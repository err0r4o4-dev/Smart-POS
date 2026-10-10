package inventory

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"strings"
)

func (service *Service) moveTransfer(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op string, doc Document, items []storedItem, action string) (string, error) {
	source, err := location(ctx, tx, org, doc.LocationID)
	if err != nil {
		return "", err
	}
	destination, err := location(ctx, tx, org, *doc.DestinationLocationID)
	if err != nil {
		return "", err
	}
	if destination.Status != "ACTIVE" || destination.System {
		return "", ErrConflict
	}
	var destinationStatus string
	err = tx.QueryRow(ctx, "SELECT status FROM branches WHERE organization_id=$1 AND id=$2", org, destination.BranchID).Scan(&destinationStatus)
	if err != nil {
		return "", databaseError(err)
	}
	if destinationStatus != "ACTIVE" {
		return "", ErrConflict
	}
	if action == "dispatch" {
		if source.Status != "ACTIVE" || source.System {
			return "", ErrConflict
		}
		if err = scope(ctx, tx, actor, org, source.BranchID, true); err != nil {
			return "", err
		}
		target := destination.ID
		next := "RECEIVED"
		outKind, inKind := "TRANSFER_OUT", "TRANSFER_IN"
		if source.BranchID != destination.BranchID {
			next = "DISPATCHED"
			outKind = "TRANSFER_DISPATCH"
			inKind = outKind
			err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,is_system,created_by,updated_by) VALUES($1,$2,$3,'Transfer in transit','IN_TRANSIT',true,$4,$4) RETURNING id::text`, org, source.BranchID, "TRANSIT_"+strings.ToUpper(strings.ReplaceAll(doc.ID, "-", "")), user).Scan(&target)
			if err != nil {
				return "", databaseError(err)
			}
			if _, err = tx.Exec(ctx, "UPDATE inventory_documents SET transit_location_id=$3 WHERE organization_id=$1 AND id=$2", org, doc.ID, target); err != nil {
				return "", err
			}
		}
		for _, item := range items {
			amount, _ := quantity(item.Quantity)
			if err = postMovement(ctx, tx, user, org, op, doc.ID, source.ID, item.VariantID, outKind, decimal(-amount), doc.Reason, item.BatchID); err != nil {
				return "", err
			}
			if err = postMovement(ctx, tx, user, org, op, doc.ID, target, item.VariantID, inKind, item.Quantity, doc.Reason, item.BatchID); err != nil {
				return "", err
			}
		}
		return next, nil
	}
	if doc.TransitLocationID == nil {
		return "", ErrConflict
	}
	if err = scope(ctx, tx, actor, org, destination.BranchID, true); err != nil {
		return "", err
	}
	for _, item := range items {
		amount, _ := quantity(item.Quantity)
		if err = postMovement(ctx, tx, user, org, op, doc.ID, *doc.TransitLocationID, item.VariantID, "TRANSFER_RECEIVE", decimal(-amount), doc.Reason, item.BatchID); err != nil {
			return "", err
		}
		if err = postMovement(ctx, tx, user, org, op, doc.ID, destination.ID, item.VariantID, "TRANSFER_RECEIVE", item.Quantity, doc.Reason, item.BatchID); err != nil {
			return "", err
		}
	}
	return "RECEIVED", nil
}

type ReorderInput struct {
	BranchID  string `json:"branch_id"`
	VariantID string `json:"variant_id"`
	Minimum   string `json:"minimum_quantity"`
	Target    string `json:"target_quantity"`
	Status    string `json:"status"`
}

func (service *Service) SaveReorder(ctx context.Context, user, org, key string, input ReorderInput) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "inventory.reorder_point.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = scope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return nil, err
	}
	if !uuidPattern.MatchString(input.VariantID) {
		return nil, ErrInput
	}
	minimum, err := quantity(input.Minimum)
	if err != nil || minimum < 0 {
		return nil, ErrInput
	}
	target, err := quantity(input.Target)
	if err != nil || target < minimum {
		return nil, ErrInput
	}
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !contains([]string{"ACTIVE", "INACTIVE"}, input.Status) {
		return nil, ErrInput
	}
	if err = validVariant(ctx, tx, org, input.VariantID, input.Minimum, false); err != nil {
		return nil, err
	}
	if err = validVariant(ctx, tx, org, input.VariantID, input.Target, false); err != nil {
		return nil, err
	}
	op, cached, err := operation(ctx, tx, user, org, "reorder", key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO inventory_reorder_points(organization_id,branch_id,variant_id,minimum_quantity,target_quantity,status,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(organization_id,branch_id,variant_id) DO UPDATE SET minimum_quantity=excluded.minimum_quantity,target_quantity=excluded.target_quantity,status=excluded.status,updated_by=excluded.updated_by,updated_at=now() RETURNING id::text`, org, input.BranchID, input.VariantID, input.Minimum, input.Target, input.Status, user).Scan(&id)
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := raw(ctx, tx, "SELECT to_jsonb(item)||jsonb_build_object('minimum_quantity',minimum_quantity::text,'target_quantity',target_quantity::text) FROM inventory_reorder_points item WHERE organization_id=$1 AND id=$2", org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "inventory.reorder.saved", id, result)
}
