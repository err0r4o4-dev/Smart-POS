package pos

import (
	"context"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pricing"
)

func priceCart(ctx context.Context, tx pgx.Tx, org string, cart *Cart, approval string) error {
	inputs := []pricing.Line{}
	for _, item := range cart.Items {
		inputs = append(inputs, pricing.Line{VariantID: item.VariantID, Quantity: item.Quantity})
	}
	quote, err := pricing.QuoteCart(ctx, tx, org, cart.BranchID, inputs)
	if err != nil {
		return dbError(err)
	}
	quote, err = pricing.ApplyApproval(ctx, tx, org, cart.BranchID, cart.CashierID, cart.ID, cart.Revision, approval, quote)
	if err != nil {
		return dbError(err)
	}
	for index := range cart.Items {
		for _, line := range quote.Lines {
			if cart.Items[index].VariantID == line.VariantID {
				cart.Items[index].UnitPrice = line.UnitPrice
				cart.Items[index].GrossTotal = line.Gross
				cart.Items[index].DiscountTotal = line.Discount
				cart.Items[index].LineTotal = line.Net
				cart.Items[index].PricingRevision = quote.Revision
			}
		}
	}
	cart.Pricing = quote
	cart.Total = quote.Total
	return nil
}
func (service *Service) Quote(ctx context.Context, user, org, id, approval string, points ...int64) (pricing.Quote, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.checkout")
	if err != nil {
		return pricing.Quote{}, err
	}
	defer tx.Rollback(ctx)
	cart, err := readCart(ctx, tx, actor, user, org, id)
	if err != nil {
		return pricing.Quote{}, err
	}
	if err = priceCart(ctx, tx, org, &cart, approval); err != nil {
		return pricing.Quote{}, err
	}
	if len(points) > 0 {
		quote, problem := loyalty.Quote(ctx, tx, actor, org, cart.CustomerID, cart.Pricing, points[0])
		return quote, dbError(problem)
	}
	return cart.Pricing, nil
}
func revalidate(ctx context.Context, tx pgx.Tx, org string, item Checkout) error {
	if err := validateCheckoutCustomer(ctx, tx, org, item); err != nil {
		return err
	}
	if item.Pricing.Revision == "" {
		return ErrPrice
	}
	cart := Cart{ID: item.CartID, BranchID: item.BranchID, CashierID: item.CashierID, Items: append([]CartItem(nil), item.Items...)}
	if err := tx.QueryRow(ctx, "SELECT cart_revision FROM pos_checkouts WHERE organization_id=$1 AND id=$2", org, item.ID).Scan(&cart.Revision); err != nil {
		return err
	}
	if err := priceCart(ctx, tx, org, &cart, item.Pricing.ApprovalID); err != nil {
		return err
	}
	if item.Pricing.Loyalty != nil {
		var err error
		cart.Pricing, err = pricing.ApplyReward(cart.Pricing, *item.Pricing.Loyalty)
		if err != nil {
			return dbError(err)
		}
		cart.Total = cart.Pricing.Total
	}
	if cart.Pricing.Revision != item.Pricing.Revision || cart.Total != item.Total {
		return ErrPrice
	}
	return nil
}

func validateReward(ctx context.Context, tx pgx.Tx, actor organization.Member, org string, item Checkout) error {
	return dbError(loyalty.Validate(ctx, tx, actor, org, item.ID, item.CustomerID, item.Pricing.Loyalty))
}
