package storefront

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/stripe"
	"time"
)

type CustomerPaymentGateway interface {
	Enabled() bool
	CustomerRequestFingerprint(stripe.CustomerCharge) (string, error)
	CreateCustomerCheckout(context.Context, stripe.CustomerCharge) (stripe.CustomerSession, error)
	RetrieveCustomerCheckout(context.Context, stripe.CustomerCharge, string) (stripe.CustomerSession, error)
	VerifyCustomerEvent([]byte, string, time.Time) (stripe.CustomerEvent, error)
}

type Service struct {
	Organization     *organization.Service
	CustomerPayments CustomerPaymentGateway
}

func dbError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, organization.ErrNotFound) {
		return ErrNotFound
	}
	if errors.Is(err, organization.ErrInput) || errors.Is(err, inventory.ErrInput) {
		return ErrInput
	}
	if errors.Is(err, organization.ErrConflict) || errors.Is(err, inventory.ErrConflict) {
		return ErrConflict
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		switch problem.Code {
		case "23505", "23514", "40001", "40P01", "22003":
			return ErrConflict
		case "23503", "22P02":
			return ErrInput
		case "42501":
			return organization.ErrDenied
		}
	}
	return err
}
func branchAllowed(actor organization.Member, branch string) bool {
	if actor.Role == "OWNER" {
		return true
	}
	for _, id := range actor.BranchIDs {
		if id == branch {
			return true
		}
	}
	return false
}
func (service *Service) authorized(ctx context.Context, user, org, permission string) (pgx.Tx, organization.Member, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	return tx, actor, dbError(err)
}
func (service *Service) public(ctx context.Context, slug string, lock bool) (pgx.Tx, string, error) {
	if !slugPattern.MatchString(slug) {
		return nil, "", ErrNotFound
	}
	tx, err := service.Organization.Pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	fail := func(problem error) (pgx.Tx, string, error) { tx.Rollback(ctx); return nil, "", dbError(problem) }
	var org *string
	if err = tx.QueryRow(ctx, "SELECT storefront_resolve($1)::text", slug).Scan(&org); err != nil {
		return fail(err)
	}
	if !service.resolvedOrganizationAllowed(org) {
		return fail(ErrNotFound)
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", *org); err != nil {
		return fail(err)
	}
	query := "SELECT id::text FROM organizations WHERE id=$1 AND status='ACTIVE'"
	if lock {
		query += " FOR UPDATE"
	}
	var id string
	if err = tx.QueryRow(ctx, query, *org).Scan(&id); err != nil {
		return fail(err)
	}
	return tx, *org, nil
}
func (service *Service) Directory(ctx context.Context) (json.RawMessage, error) {
	if service.Organization.SingleStoreOrganizationID != "" {
		tx, err := service.Organization.Pool.Begin(ctx)
		if err != nil {
			return nil, err
		}
		defer tx.Rollback(ctx)
		org := service.Organization.SingleStoreOrganizationID
		if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", org); err != nil {
			return nil, err
		}
		var result []byte
		err = tx.QueryRow(ctx, `SELECT COALESCE(jsonb_agg(jsonb_build_object('slug',shop.slug,'name',shop.name,'accepting_orders',shop.accepting_orders)),'[]'::jsonb) FROM storefronts shop JOIN organizations org ON org.id=shop.organization_id WHERE shop.organization_id=$1 AND shop.published AND org.status='ACTIVE'`, org).Scan(&result)
		return json.RawMessage(result), dbError(err)
	}
	var result []byte
	err := service.Organization.Pool.QueryRow(ctx, "SELECT storefront_directory()").Scan(&result)
	return json.RawMessage(result), dbError(err)
}

func (service *Service) resolvedOrganizationAllowed(org *string) bool {
	return org != nil && uuidPattern.MatchString(*org) && service.Organization.AllowsOrganization(*org)
}
func settings(ctx context.Context, tx pgx.Tx, org string) (Settings, error) {
	var result Settings
	err := tx.QueryRow(ctx, `SELECT shop.slug,shop.name,shop.description,shop.contact_phone,shop.pickup_instructions,shop.terminal_id::text,shop.published,shop.accepting_orders,shop.revision,terminal.branch_id::text,terminal.stock_location_id::text,COALESCE(shop.online_terminal_id::text,'') FROM storefronts shop JOIN pos_terminals terminal ON terminal.organization_id=shop.organization_id AND terminal.id=COALESCE(shop.online_terminal_id,shop.terminal_id) WHERE shop.organization_id=$1`, org).Scan(&result.Slug, &result.Name, &result.Description, &result.ContactPhone, &result.PickupInstructions, &result.TerminalID, &result.Published, &result.AcceptingOrders, &result.Revision, &result.BranchID, &result.LocationID, &result.OnlineTerminalID)
	return result, dbError(err)
}
func (service *Service) PublicSettings(ctx context.Context, slug string) (Settings, error) {
	tx, org, err := service.public(ctx, slug, false)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	result, err := settings(ctx, tx, org)
	if err != nil || !result.Published {
		return Settings{}, ErrNotFound
	}
	result.TerminalID = ""
	result.OnlineTerminalID = ""
	result.BranchID = ""
	result.LocationID = ""
	return result, nil
}
func (service *Service) Settings(ctx context.Context, user, org string) (*Settings, error) {
	tx, actor, err := service.authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	result, err := settings(ctx, tx, org)
	if errors.Is(err, ErrNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if !branchAllowed(actor, result.BranchID) {
		return nil, organization.ErrDenied
	}
	return &result, nil
}
func (service *Service) SaveSettings(ctx context.Context, user, org string, input SettingsInput) (Settings, error) {
	tx, actor, err := service.authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback(ctx)
	if err = input.validate(); err != nil {
		return Settings{}, err
	}
	var branch, location string
	err = tx.QueryRow(ctx, `SELECT terminal.branch_id::text,terminal.stock_location_id::text FROM pos_terminals terminal JOIN branches branch ON branch.organization_id=terminal.organization_id AND branch.id=terminal.branch_id WHERE terminal.organization_id=$1 AND terminal.id=$2 AND terminal.status='ACTIVE' AND branch.status='ACTIVE' FOR UPDATE OF terminal`, org, input.TerminalID).Scan(&branch, &location)
	if err != nil {
		return Settings{}, dbError(err)
	}
	if !branchAllowed(actor, branch) {
		return Settings{}, organization.ErrDenied
	}
	if err = inventory.SaleLocation(ctx, tx, actor, org, branch, location); err != nil {
		return Settings{}, dbError(err)
	}
	if input.OnlineTerminalID != "" {
		var onlineBranch, onlineLocation, locationType string
		err = tx.QueryRow(ctx, `SELECT terminal.branch_id::text,terminal.stock_location_id::text,location.type FROM pos_terminals terminal JOIN stock_locations location ON location.organization_id=terminal.organization_id AND location.id=terminal.stock_location_id WHERE terminal.organization_id=$1 AND terminal.id=$2 AND terminal.status='ACTIVE' AND location.status='ACTIVE' FOR UPDATE OF terminal`, org, input.OnlineTerminalID).Scan(&onlineBranch, &onlineLocation, &locationType)
		if err != nil {
			return Settings{}, dbError(err)
		}
		if !branchAllowed(actor, onlineBranch) {
			return Settings{}, organization.ErrDenied
		}
		if onlineBranch != branch || onlineLocation == location || locationType != "WAREHOUSE" {
			return Settings{}, ErrConflict
		}
		if err = inventory.SaleLocation(ctx, tx, actor, org, branch, onlineLocation); err != nil {
			return Settings{}, dbError(err)
		}
	}
	current, err := settings(ctx, tx, org)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return Settings{}, err
	}
	if err == nil && (!branchAllowed(actor, current.BranchID) || current.Revision != input.Revision) {
		return Settings{}, ErrConflict
	}
	if errors.Is(err, ErrNotFound) && input.Revision != 0 {
		return Settings{}, ErrConflict
	}
	if err == nil && current.Slug != input.Slug {
		var ordered bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM online_orders WHERE organization_id=$1)`, org).Scan(&ordered); err != nil {
			return Settings{}, err
		}
		if ordered {
			return Settings{}, ErrConflict
		}
	}
	if err == nil && (current.TerminalID != input.TerminalID || current.OnlineTerminalID != input.OnlineTerminalID || current.Slug != input.Slug || !input.Published) {
		var live bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM online_orders WHERE organization_id=$1 AND storefront_order_live(organization_id,id))`, org).Scan(&live); err != nil {
			return Settings{}, err
		}
		if live {
			return Settings{}, ErrConflict
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO storefronts(organization_id,slug,name,description,contact_phone,pickup_instructions,terminal_id,published,accepting_orders,online_terminal_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,nullif($10,'')::uuid) ON CONFLICT(organization_id) DO UPDATE SET slug=excluded.slug,name=excluded.name,description=excluded.description,contact_phone=excluded.contact_phone,pickup_instructions=excluded.pickup_instructions,terminal_id=excluded.terminal_id,published=excluded.published,accepting_orders=excluded.accepting_orders,online_terminal_id=excluded.online_terminal_id,revision=storefronts.revision+1,updated_at=now()`, org, input.Slug, input.Name, input.Description, input.ContactPhone, input.PickupInstructions, input.TerminalID, input.Published, input.AcceptingOrders, input.OnlineTerminalID)
	if err != nil {
		return Settings{}, dbError(err)
	}
	result, err := settings(ctx, tx, org)
	if err != nil {
		return result, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "storefront.updated", org); err != nil {
		return result, err
	}
	return result, dbError(tx.Commit(ctx))
}
func saleSource(ctx context.Context, tx pgx.Tx, org string, shop Settings) error {
	var active bool
	err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pos_terminals terminal JOIN branches branch ON branch.organization_id=terminal.organization_id AND branch.id=terminal.branch_id JOIN stock_locations location ON location.organization_id=terminal.organization_id AND location.id=terminal.stock_location_id WHERE terminal.organization_id=$1 AND terminal.id=$2 AND terminal.branch_id=$3 AND terminal.stock_location_id=$4 AND terminal.status='ACTIVE' AND branch.status='ACTIVE' AND location.status='ACTIVE' AND location.type IN ('WAREHOUSE','SALES_FLOOR','SHELF') AND ($5='' OR location.type='WAREHOUSE'))`, org, shop.orderTerminalID(), shop.BranchID, shop.LocationID, shop.OnlineTerminalID).Scan(&active)
	if err != nil {
		return err
	}
	if !active {
		return ErrClosed
	}
	return nil
}
