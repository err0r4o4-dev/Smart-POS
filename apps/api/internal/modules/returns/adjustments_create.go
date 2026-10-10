package returns

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"math/big"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
)

func quoteAdjustment(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, kind string, input AdjustmentInput) (AdjustmentQuote, error) {
	quote := AdjustmentQuote{ReplacementTotal: "0.00", Items: []pos.CartItem{}}
	if !validText(input.Reason, 2000, true) || len(input.Items) < 1 || len(input.Items) > 100 {
		return quote, ErrInput
	}
	branch, err := saleScope(ctx, tx, actor, user, org, input.SaleID)
	if err != nil {
		return quote, err
	}
	quote.Branch = branch
	if err = inventory.BranchScope(ctx, tx, actor, org, branch, true); err != nil {
		return quote, dbError(err)
	}
	if kind == "REVERSAL" {
		var eligible bool
		err = tx.QueryRow(ctx, "SELECT NOT EXISTS(SELECT 1 FROM customer_returns WHERE organization_id=$1 AND original_sale_id=$2 AND status='COMPLETED') AND (SELECT count(*) FROM sale_items WHERE organization_id=$1 AND sale_id=$2)=$3", org, input.SaleID, len(input.Items)).Scan(&eligible)
		if err != nil {
			return quote, err
		}
		if !eligible || len(input.Replacements) > 0 || input.TerminalID != "" {
			return quote, ErrConflict
		}
	}
	total := new(big.Int)
	seen := map[string]bool{}
	for _, line := range input.Items {
		if !uuidPattern.MatchString(line.SaleItemID) || seen[line.SaleItemID] {
			return quote, ErrInput
		}
		seen[line.SaleItemID] = true
		var variant, sold, paid string
		err = tx.QueryRow(ctx, "SELECT variant_id::text,quantity::text,line_total::text FROM sale_items WHERE organization_id=$1 AND sale_id=$2 AND id=$3", org, input.SaleID, line.SaleItemID).Scan(&variant, &sold, &paid)
		if err != nil {
			return quote, dbError(err)
		}
		if err = inventory.ValidateQuantity(ctx, tx, org, variant, line.Quantity, true); err != nil {
			return quote, dbError(err)
		}
		priorQuantity, priorAmount, err := prior(ctx, tx, org, line.SaleItemID)
		if err != nil {
			return quote, err
		}
		if kind == "REVERSAL" {
			quantity, problem := units(line.Quantity, 3)
			original, _ := units(sold, 3)
			if problem != nil || quantity.Cmp(original) != 0 {
				return quote, ErrConflict
			}
		}
		credit, err := allocation(sold, paid, priorQuantity, priorAmount, line.Quantity)
		if err != nil {
			return quote, err
		}
		if err = inventory.ReturnLocation(ctx, tx, actor, org, branch, line.Destination, line.Disposition); err != nil {
			return quote, dbError(err)
		}
		amount, _ := units(credit, 2)
		total.Add(total, amount)
	}
	quote.ReturnCredit = fixed(total, 2)
	if kind == "EXCHANGE" {
		pricing, err := pos.QuoteExchange(ctx, tx, actor, user, org, input.TerminalID, input.Replacements)
		if err != nil {
			return quote, adjustmentError(err)
		}
		if pricing.Terminal.BranchID != branch {
			return quote, ErrConflict
		}
		quote.Items = pricing.Items
		quote.ReplacementTotal = pricing.Total
	}
	quote.Difference, err = difference(quote.ReplacementTotal, quote.ReturnCredit)
	return quote, err
}
func (service *Service) QuoteAdjustment(ctx context.Context, user, org, kind string, input AdjustmentInput) (AdjustmentQuote, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permissionFor(kind, "create"))
	if err != nil {
		return AdjustmentQuote{}, err
	}
	defer tx.Rollback(ctx)
	return quoteAdjustment(ctx, tx, actor, user, org, kind, input)
}
func (service *Service) SaveAdjustment(ctx context.Context, user, org, kind, id, key string, input AdjustmentInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permissionFor(kind, "create"))
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = saleScope(ctx, tx, actor, user, org, input.SaleID); err != nil {
		return nil, err
	}
	var current adjustment
	if id != "" {
		current, err = adjustmentHeader(ctx, tx, actor, user, org, kind, id)
		if err != nil {
			return nil, err
		}
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "adjustment.save."+kind, key, struct {
		ID    string
		Input AdjustmentInput
	}{id, input})
	if err != nil || cached != nil {
		return cached, dbError(err)
	}
	if id != "" && (current.Status != "DRAFT" || current.Revision != input.Revision || current.Sale != input.SaleID) {
		return nil, ErrConflict
	}
	quote, err := quoteAdjustment(ctx, tx, actor, user, org, kind, input)
	if err != nil {
		return nil, err
	}
	returnID, err := createDocument(ctx, tx, actor, user, org, quote.Branch, input.CreateInput)
	if err != nil {
		return nil, err
	}
	items, _ := json.Marshal(quote.Items)
	if id == "" {
		err = tx.QueryRow(ctx, "INSERT INTO sale_adjustments(organization_id,branch_id,kind,original_sale_id,linked_return_id,terminal_id,reason,return_credit,replacement_total,net_difference,replacement_items,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id::text", org, quote.Branch, kind, input.SaleID, returnID, nullable(input.TerminalID), input.Reason, quote.ReturnCredit, quote.ReplacementTotal, quote.Difference, items, user).Scan(&id)
	} else {
		if _, err = tx.Exec(ctx, "UPDATE customer_returns SET status='CANCELLED',revision=revision+1 WHERE organization_id=$1 AND id=$2", org, current.ReturnID); err != nil {
			return nil, dbError(err)
		}
		_, err = tx.Exec(ctx, "UPDATE sale_adjustments SET linked_return_id=$3,terminal_id=$4,reason=$5,return_credit=$6,replacement_total=$7,net_difference=$8,replacement_items=$9,revision=revision+1 WHERE organization_id=$1 AND id=$2", org, id, returnID, nullable(input.TerminalID), input.Reason, quote.ReturnCredit, quote.ReplacementTotal, quote.Difference, items)
	}
	if err != nil {
		return nil, dbError(err)
	}
	value, err := adjustmentResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "adjustments.saved", id, value)
}
