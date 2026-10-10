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
	tx, actor, err := service.begin(ctx, user, org, "pos.cart.manage")
	if err != nil {
		return Cart{}, err
	}
	defer tx.Rollback(ctx)
	if !allowed(actor.Permissions, "customers.select") {
		return Cart{}, organization.ErrDenied
	}
	cart, err := cartHeader(ctx, tx, actor, user, org, id)
	if err != nil {
		return cart, err
	}
	if cart.Status != "ACTIVE" && cart.Status != "HELD" || input.Revision != cart.Revision {
		return cart, ErrConflict
	}
	if err = cartUnlocked(ctx, tx, org, id); err != nil {
		return cart, err
	}
	if input.CustomerID != nil {
		if _, err = customers.ValidateSelection(ctx, tx, actor, org, *input.CustomerID); err != nil {
			return cart, dbError(err)
		}
	}
	_, err = tx.Exec(ctx, "UPDATE pos_carts SET customer_id=$3,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.CustomerID)
	if err != nil {
		return cart, dbError(err)
	}
	cart, err = readCart(ctx, tx, actor, user, org, id)
	if err != nil {
		return cart, err
	}
	return cart, finish(ctx, tx, org, user, "pos.cart.customer_selected", id)
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
	if selected.Status != "ACTIVE" {
		return ErrCustomer
	}
	return nil
}
