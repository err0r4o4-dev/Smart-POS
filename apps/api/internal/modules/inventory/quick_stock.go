package inventory

import (
	"context"
	"encoding/json"
	"strings"

	"smartpos/api/internal/modules/organization"
)

type QuickStockInput struct {
	BranchID       string `json:"branch_id"`
	LocationID     string `json:"location_id"`
	VariantID      string `json:"variant_id"`
	Action         string `json:"action"`
	Quantity       string `json:"quantity"`
	Reason         string `json:"reason"`
	BalanceVersion *int64 `json:"balance_version,omitempty"`
}

func (input *QuickStockInput) normalize() error {
	input.BranchID = strings.ToLower(strings.TrimSpace(input.BranchID))
	input.LocationID = strings.ToLower(strings.TrimSpace(input.LocationID))
	input.VariantID = strings.ToLower(strings.TrimSpace(input.VariantID))
	input.Reason = strings.TrimSpace(input.Reason)
	amount, err := quantity(input.Quantity)
	if !uuidPattern.MatchString(input.BranchID) || !uuidPattern.MatchString(input.LocationID) || !uuidPattern.MatchString(input.VariantID) || !contains([]string{"INCREASE", "DECREASE", "CORRECTION"}, input.Action) || err != nil || amount < 0 || amount == 0 && input.Action != "CORRECTION" || !text(input.Reason, 100, true) || input.Action == "CORRECTION" && (input.BalanceVersion == nil || *input.BalanceVersion < 0) {
		return ErrInput
	}
	input.Quantity = decimal(amount)
	return nil
}

func (service *Service) QuickStock(ctx context.Context, user, org, key string, input QuickStockInput) (json.RawMessage, error) {
	if err := input.normalize(); err != nil {
		return nil, err
	}
	tx, actor, err := service.begin(ctx, user, org, "inventory.adjustment.post")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !contains(actor.Permissions, "inventory.adjustment.create") || !contains(actor.Permissions, "inventory.adjustment.approve") {
		return nil, organization.ErrDenied
	}
	location, err := physical(ctx, tx, actor, org, input.LocationID, true)
	if err != nil {
		return nil, err
	}
	if location.BranchID != input.BranchID {
		return nil, ErrInput
	}
	if err = validVariant(ctx, tx, org, input.VariantID, input.Quantity, true); err != nil {
		return nil, err
	}
	op, previous, err := operation(ctx, tx, user, org, "restaurant.quick_stock", key, input)
	if err != nil {
		return nil, err
	}
	if previous != nil {
		return previous, nil
	}
	var hasBatches bool
	err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM quality_stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3 AND batch_id IS NOT NULL AND quantity<>0)", org, input.LocationID, input.VariantID).Scan(&hasBatches)
	if err != nil {
		return nil, err
	}
	if hasBatches {
		return nil, ErrConflict
	}
	var balance string
	var version int64
	err = tx.QueryRow(ctx, "SELECT COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)::text,COALESCE((SELECT version FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)", org, input.LocationID, input.VariantID).Scan(&balance, &version)
	if err != nil {
		return nil, err
	}
	delta, _ := quantity(input.Quantity)
	if input.Action == "DECREASE" {
		delta = -delta
	}
	if input.Action == "CORRECTION" {
		if version != *input.BalanceVersion {
			return nil, ErrConflict
		}
		current, problem := quantity(balance)
		if problem != nil {
			return nil, problem
		}
		delta -= current
	}
	movement := "ADJUSTMENT_IN"
	if delta < 0 {
		movement = "ADJUSTMENT_OUT"
	}
	if delta != 0 {
		if err = postMovement(ctx, tx, user, org, op, "", input.LocationID, input.VariantID, movement, decimal(delta), input.Reason); err != nil {
			return nil, err
		}
	}
	result, err := raw(ctx, tx, `SELECT jsonb_build_object('operation_id',$4::uuid,'new_balance',COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)::text,'balance_version',COALESCE((SELECT version FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0))`, org, input.LocationID, input.VariantID, op)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "restaurant.quick_stock.posted", op, result)
}
