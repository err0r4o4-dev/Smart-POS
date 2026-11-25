package pos

import (
	"context"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/organization"
)

type CustomerInput struct {
	Revision   int64   `json:"revision"`
	CustomerID *string `json:"customer_id"`
}

func (service *Service) SelectCustomer(ctx context.Context, user, org, id string, input CustomerInput) (Cart, error) {
	authorization, err := service.Organization.AuthorizeMFA(ctx, user, org, "pos.cart.manage")
	if err != nil {
		return Cart{}, dbError(err)
	}
	tx, actor := authorization.Tx, authorization.Actor
	defer tx.Rollback(ctx)
	check := func(problem error) error {
		if failure := ctx.Err(); failure != nil {
			return failure
		}
		// An aborted SQL transaction cannot recheck assurance or return private data.
		if problem != nil && tx.Conn().PgConn().TxStatus() == 'E' {
			return dbError(problem)
		}
		if failure := authorization.Recheck(ctx); failure != nil {
			return failure
		}
		return dbError(problem)
	}
	if !allowed(actor.Permissions, "customers.select") {
		return Cart{}, check(organization.ErrDenied)
	}
	cart, err := cartHeader(ctx, tx, actor, user, org, id)
	if err = check(err); err != nil {
		return Cart{}, err
	}
	if cart.Status != "ACTIVE" && cart.Status != "HELD" || input.Revision != cart.Revision {
		return Cart{}, ErrConflict
	}
	if err = check(cartUnlocked(ctx, tx, org, id)); err != nil {
		return Cart{}, err
	}
	if input.CustomerID != nil {
		_, err = customers.ValidateSelection(ctx, tx, actor, org, *input.CustomerID)
		if err = check(err); err != nil {
			return Cart{}, err
		}
	}
	_, err = tx.Exec(ctx, "UPDATE pos_carts SET customer_id=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.CustomerID)
	if err = check(err); err != nil {
		return Cart{}, err
	}
	cart, err = readCart(ctx, tx, actor, user, org, id)
	if err = check(err); err != nil {
		return Cart{}, err
	}
	if err = check(organization.RecordAudit(ctx, tx, org, user, "pos.cart.customer_selected", id)); err != nil {
		return Cart{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Cart{}, dbError(err)
	}
	return cart, nil
}

func validateCheckoutCustomer(ctx context.Context, tx pgx.Tx, org string, item Checkout) error {
	if item.CustomerID == nil {
		return nil
	}
	var adjustment *string
	if err := tx.QueryRow(ctx, "SELECT adjustment_id::text FROM pos_checkouts WHERE organization_id=$1 AND id=$2", org, item.ID).Scan(&adjustment); err != nil {
		return err
	}
	if adjustment != nil {
		return nil
	}
	selected, err := customers.ReadSelection(ctx, tx, org, *item.CustomerID)
	if err != nil {
		return dbError(err)
	}
	if selected == nil || selected.Status != "ACTIVE" {
		return ErrCustomer
	}
	return nil
}
