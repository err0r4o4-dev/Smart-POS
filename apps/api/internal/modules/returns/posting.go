package returns

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
)

func (service *Service) Transition(ctx context.Context, user, org, id, action, key string, input ActionInput) (json.RawMessage, error) {
	permission := "returns.create"
	if action == "approve" || action == "reject" {
		permission = "returns.approve"
	}
	if action == "complete" {
		permission = "returns.complete"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	doc, err := header(ctx, tx, actor, org, id)
	if err != nil {
		return nil, err
	}
	if actor.Role == "CASHIER" && doc.Creator != user {
		return nil, organization.ErrDenied
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, doc.Branch, true); err != nil {
		return nil, dbError(err)
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "customer-return."+action, key, struct {
		ID    string
		Input ActionInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	var linked bool
	if err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM sale_adjustments WHERE organization_id=$1 AND linked_return_id=$2)", org, id).Scan(&linked); err != nil {
		return nil, err
	}
	if linked {
		return nil, ErrConflict
	}
	if input.Revision != doc.Revision {
		return nil, ErrConflict
	}
	next, err := transition(doc.Status, action)
	if err != nil {
		return nil, err
	}
	if action == "complete" {
		if err = post(ctx, tx, actor, user, org, op, doc, nil); err != nil {
			return nil, err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE customer_returns SET status=$3,revision=revision+1,approved_by=CASE WHEN $4='approve' THEN $5::uuid ELSE approved_by END,approved_at=CASE WHEN $4='approve' THEN now() ELSE approved_at END,completed_by=CASE WHEN $4='complete' THEN $5::uuid ELSE completed_by END,completed_at=CASE WHEN $4='complete' THEN now() ELSE completed_at END,inventory_operation_id=CASE WHEN $4='complete' THEN $6::uuid ELSE inventory_operation_id END WHERE organization_id=$1 AND id=$2`, org, id, next, action, user, op)
	if err != nil {
		return nil, dbError(err)
	}
	value, err := result(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "returns."+action, id, value)
}
func post(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op string, doc document, refundAmount *string) error {
	rows, err := tx.Query(ctx, `SELECT item.id::text,item.original_sale_item_id::text,item.variant_id::text,item.quantity::text,item.refund_amount::text,item.disposition,item.destination_location_id::text,sale.quantity::text,sale.line_total::text FROM customer_return_items item JOIN sale_items sale ON sale.organization_id=item.organization_id AND sale.id=item.original_sale_item_id WHERE item.organization_id=$1 AND item.return_id=$2 ORDER BY item.variant_id,item.id`, org, doc.ID)
	if err != nil {
		return err
	}
	type posting struct {
		ID, SaleItem, Variant, Quantity, Amount, Disposition, Sold, Paid string
		Destination                                                      *string
	}
	items := []posting{}
	for rows.Next() {
		var line posting
		if err = rows.Scan(&line.ID, &line.SaleItem, &line.Variant, &line.Quantity, &line.Amount, &line.Disposition, &line.Destination, &line.Sold, &line.Paid); err != nil {
			rows.Close()
			return err
		}
		items = append(items, line)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	if len(items) == 0 {
		return ErrConflict
	}
	for _, line := range items {
		returned, refunded, err := prior(ctx, tx, org, line.SaleItem)
		if err != nil {
			return err
		}
		amount, err := allocation(line.Sold, line.Paid, returned, refunded, line.Quantity)
		if err != nil {
			return err
		}
		if amount != line.Amount {
			return ErrConflict
		}
		if err = inventory.PostCustomerReturn(ctx, tx, actor, user, org, op, doc.Branch, line.ID, line.Variant, line.Quantity, line.Destination, line.Disposition); err != nil {
			return dbError(err)
		}
	}
	if err = loyalty.ReverseReturn(ctx, tx, user, org, doc.ID); err != nil {
		return dbError(err)
	}
	if refundAmount != nil {
		if *refundAmount == "" {
			return nil
		}
		_, err = tx.Exec(ctx, "INSERT INTO customer_refunds(organization_id,branch_id,return_id,amount) VALUES($1,$2,$3,$4)", org, doc.Branch, doc.ID, *refundAmount)
		return dbError(err)
	}
	_, err = tx.Exec(ctx, "INSERT INTO customer_refunds(organization_id,branch_id,return_id,amount) SELECT organization_id,branch_id,id,amount FROM customer_returns WHERE organization_id=$1 AND id=$2", org, doc.ID)
	return dbError(err)
}
