package pos

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

const shiftJSON = `to_jsonb(shift)-ARRAY['open_key','close_key'] || jsonb_build_object('opening_cash',shift.opening_cash::text,'cash_sales',shift.cash_sales::text,'expected_cash',shift.expected_cash::text,'counted_cash',shift.counted_cash::text,'difference',shift.difference::text,'terminal_name',terminal.name,'cashier_name',cashier.display_name)`
const shiftFrom = ` FROM register_shifts shift JOIN pos_terminals terminal ON terminal.organization_id=shift.organization_id AND terminal.id=shift.terminal_id JOIN users cashier ON cashier.id=shift.cashier_id`

func shiftResult(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, "SELECT "+shiftJSON+shiftFrom+" WHERE shift.organization_id=$1 AND shift.id=$2", org, id)
}

func (service *Service) OpenShift(ctx context.Context, user, org, key string, input ShiftInput) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.register.open")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(key) {
		return nil, ErrInput
	}
	if _, err = scaled(input.OpeningCash, 2); err != nil {
		return nil, err
	}
	value, err := terminal(ctx, tx, actor, org, input.TerminalID, true)
	if err != nil {
		return nil, err
	}
	var id, existingTerminal, cash string
	err = tx.QueryRow(ctx, "SELECT id::text,terminal_id::text,opening_cash::text FROM register_shifts WHERE organization_id=$1 AND cashier_id=$2 AND open_key=$3", org, user, key).Scan(&id, &existingTerminal, &cash)
	if err == nil {
		amount, _ := scaled(input.OpeningCash, 2)
		if existingTerminal != input.TerminalID || cash != money(amount) {
			return nil, ErrConflict
		}
		return shiftResult(ctx, tx, org, id)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}
	err = tx.QueryRow(ctx, "INSERT INTO register_shifts(organization_id,branch_id,terminal_id,cashier_id,opening_cash,expected_cash,open_key) VALUES($1,$2,$3,$4,$5,$5,$6) RETURNING id::text", org, value.BranchID, value.ID, user, input.OpeningCash, key).Scan(&id)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := shiftResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return result, finish(ctx, tx, org, user, "pos.shift.opened", id)
}

func (service *Service) CloseShift(ctx context.Context, user, org, id, key string, input ShiftInput) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.register.close")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) || !uuidPattern.MatchString(key) {
		return nil, ErrInput
	}
	amount, err := scaled(input.CountedCash, 2)
	if err != nil {
		return nil, err
	}
	var branch, cashier, status, counted, previousKey string
	err = tx.QueryRow(ctx, "SELECT branch_id::text,cashier_id::text,status,COALESCE(counted_cash::text,''),COALESCE(close_key::text,'') FROM register_shifts WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, id).Scan(&branch, &cashier, &status, &counted, &previousKey)
	if err != nil {
		return nil, dbError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, false); err != nil {
		return nil, err
	}
	if cashier != user && !allowed(actor.Permissions, "pos.register.close.other") {
		return nil, organization.ErrDenied
	}
	if status == "CLOSED" {
		if previousKey != key || counted != money(amount) {
			return nil, ErrConflict
		}
		return shiftResult(ctx, tx, org, id)
	}
	var pending bool
	err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM pos_checkouts WHERE organization_id=$1 AND shift_id=$2 AND status IN ('AWAITING_PAYMENT','CONFIRMED','RECONCILIATION_REQUIRED'))", org, id).Scan(&pending)
	if err != nil {
		return nil, err
	}
	if pending {
		return nil, ErrPending
	}
	_, err = tx.Exec(ctx, "UPDATE register_shifts SET status='CLOSED',counted_cash=$3,difference=$3::numeric-expected_cash,close_key=$4,closed_by=$5,closed_at=now() WHERE organization_id=$1 AND id=$2", org, id, input.CountedCash, key, user)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := shiftResult(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return result, finish(ctx, tx, org, user, "pos.shift.closed", id)
}
