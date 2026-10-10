package pos

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"log/slog"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

type Service struct{ Organization *organization.Service }

var ErrCustomer = errors.New("customer unavailable for checkout")

func dbError(err error) error {
	if errors.Is(err, loyalty.ErrNotFound) || errors.Is(err, customers.ErrNotFound) || errors.Is(err, pgx.ErrNoRows) || errors.Is(err, catalog.ErrNotFound) || errors.Is(err, inventory.ErrNotFound) || errors.Is(err, organization.ErrNotFound) {
		return ErrNotFound
	}
	if errors.Is(err, loyalty.ErrInput) || errors.Is(err, customers.ErrInput) || errors.Is(err, pricing.ErrInput) || errors.Is(err, catalog.ErrInput) || errors.Is(err, inventory.ErrInput) || errors.Is(err, organization.ErrInput) {
		return ErrInput
	}
	if errors.Is(err, loyalty.ErrConflict) || errors.Is(err, customers.ErrConflict) || errors.Is(err, pricing.ErrConflict) || errors.Is(err, catalog.ErrConflict) || errors.Is(err, inventory.ErrConflict) || errors.Is(err, organization.ErrConflict) {
		return ErrConflict
	}
	var problem *pgconn.PgError
	if errors.As(err, &problem) {
		slog.Warn("POS database operation rejected", "sqlstate", problem.Code, "constraint", problem.ConstraintName, "table", problem.TableName, "message", problem.Message)
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
func fingerprint(input any) string {
	encoded, _ := json.Marshal(input)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}
func (service *Service) begin(ctx context.Context, user, org, permission string) (pgx.Tx, organization.Member, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	return tx, actor, dbError(err)
}
func scope(ctx context.Context, tx pgx.Tx, actor organization.Member, org, branch string, active bool) error {
	if !uuidPattern.MatchString(branch) {
		return ErrInput
	}
	if actor.Role != "OWNER" && !allowed(actor.BranchIDs, branch) {
		return organization.ErrDenied
	}
	var status string
	if err := tx.QueryRow(ctx, "SELECT status FROM branches WHERE organization_id=$1 AND id=$2", org, branch).Scan(&status); err != nil {
		return dbError(err)
	}
	if active && status != "ACTIVE" {
		return ErrConflict
	}
	return nil
}
func raw(ctx context.Context, tx pgx.Tx, query string, args ...any) (json.RawMessage, error) {
	var result []byte
	err := tx.QueryRow(ctx, query, args...).Scan(&result)
	return json.RawMessage(result), dbError(err)
}
func finish(ctx context.Context, tx pgx.Tx, org, user, event, id string) error {
	if err := organization.RecordAudit(ctx, tx, org, user, event, id); err != nil {
		return err
	}
	return dbError(tx.Commit(ctx))
}
func terminal(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string, active bool) (Terminal, error) {
	var item Terminal
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, "SELECT id::text,branch_id::text,code,name,stock_location_id::text,status,revision FROM pos_terminals WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&item.ID, &item.BranchID, &item.Code, &item.Name, &item.StockLocationID, &item.Status, &item.Revision)
	if err != nil {
		return item, dbError(err)
	}
	if err = scope(ctx, tx, actor, org, item.BranchID, active); err != nil {
		return item, err
	}
	if active {
		if item.Status != "ACTIVE" {
			return item, ErrConflict
		}
		if err = inventory.SaleLocation(ctx, tx, actor, org, item.BranchID, item.StockLocationID); err != nil {
			return item, dbError(err)
		}
	}
	return item, nil
}
func ownShift(ctx context.Context, tx pgx.Tx, org, terminalID, user string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, "SELECT id::text FROM register_shifts WHERE organization_id=$1 AND terminal_id=$2 AND cashier_id=$3 AND status='OPEN' FOR UPDATE", org, terminalID, user).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrConflict
	}
	return id, dbError(err)
}
func variant(ctx context.Context, tx pgx.Tx, org, location, id, quantity, oldPrice string) (CartItem, error) {
	item := CartItem{Quantity: quantity, PreviousPrice: oldPrice}
	value, err := catalog.ReadSaleVariant(ctx, tx, org, id)
	if err != nil {
		return item, dbError(err)
	}
	item.SaleVariant = value
	var branch string
	if err = tx.QueryRow(ctx, "SELECT branch_id::text FROM stock_locations WHERE organization_id=$1 AND id=$2", org, location).Scan(&branch); err != nil {
		return item, dbError(err)
	}
	value.UnitPrice, _, _, err = pricing.EffectivePrice(ctx, tx, org, branch, id, value.UnitPrice)
	if err != nil {
		return item, dbError(err)
	}
	item.UnitPrice = value.UnitPrice
	amount, err := scaled(quantity, 3)
	if err != nil || amount <= 0 {
		return item, ErrInput
	}
	if allowed([]string{"COUNT", "PACKAGING"}, value.UnitType) && amount%1000 != 0 {
		return item, ErrInput
	}
	price, priceErr := scaled(value.UnitPrice, 2)
	item.Saleable = value.ProductStatus == "ACTIVE" && value.VariantStatus == "ACTIVE" && value.UnitStatus == "ACTIVE" && value.Currency == "THB" && priceErr == nil && price > 0
	err = tx.QueryRow(ctx, "SELECT COALESCE((SELECT quantity::text FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),'0.000')", org, location, id).Scan(&item.Available)
	if err != nil {
		return item, err
	}
	total, err := lineTotal(value.UnitPrice, quantity)
	if err != nil {
		return item, err
	}
	item.LineTotal = money(total)
	item.PriceChanged = oldPrice != "" && oldPrice != value.UnitPrice
	return item, nil
}

func (service *Service) SaveTerminal(ctx context.Context, user, org, id string, input TerminalInput) (Terminal, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.terminal.manage")
	if err != nil {
		return Terminal{}, err
	}
	defer tx.Rollback(ctx)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !codePattern.MatchString(input.Code) || !text(input.Name, 200, true) || !allowed([]string{"ACTIVE", "INACTIVE"}, input.Status) {
		return Terminal{}, ErrInput
	}
	if err = scope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return Terminal{}, err
	}
	if err = inventory.SaleLocation(ctx, tx, actor, org, input.BranchID, input.StockLocationID); err != nil {
		return Terminal{}, dbError(err)
	}
	if id != "" {
		current, err := terminal(ctx, tx, actor, org, id, false)
		if err != nil {
			return Terminal{}, err
		}
		if current.Revision != input.Revision || current.BranchID != input.BranchID {
			return Terminal{}, ErrConflict
		}
		var busy bool
		if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM register_shifts WHERE organization_id=$1 AND terminal_id=$2 AND status='OPEN') OR EXISTS(SELECT 1 FROM pos_carts WHERE organization_id=$1 AND terminal_id=$2 AND status IN ('ACTIVE','HELD'))", org, id).Scan(&busy); err != nil {
			return Terminal{}, err
		}
		if busy {
			return Terminal{}, ErrConflict
		}
		_, err = tx.Exec(ctx, "UPDATE pos_terminals SET code=$3,name=$4,stock_location_id=$5,status=$6,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.Code, input.Name, input.StockLocationID, input.Status)
		if err != nil {
			return Terminal{}, dbError(err)
		}
	} else {
		err = tx.QueryRow(ctx, "INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id,status) VALUES($1,$2,$3,$4,$5,$6) RETURNING id::text", org, input.BranchID, input.Code, input.Name, input.StockLocationID, input.Status).Scan(&id)
		if err != nil {
			return Terminal{}, dbError(err)
		}
	}
	result, err := terminal(ctx, tx, actor, org, id, false)
	if err != nil {
		return result, err
	}
	return result, finish(ctx, tx, org, user, "pos.terminal.saved", id)
}
