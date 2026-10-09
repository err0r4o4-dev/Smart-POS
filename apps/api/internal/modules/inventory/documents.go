package inventory

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"strings"
)

type Document struct {
	ID                    string
	Kind                  string
	Status                string
	BranchID              string
	LocationID            string
	DestinationBranchID   *string
	DestinationLocationID *string
	TransitLocationID     *string
	AdjustmentType        *string
	Reason                string
	CreatedBy             string
	AssignedTo            *string
	Revision              int64
}

func document(ctx context.Context, tx pgx.Tx, org, id, kind string) (Document, error) {
	var item Document
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, `SELECT id::text,kind,status,branch_id::text,location_id::text,destination_branch_id::text,destination_location_id::text,transit_location_id::text,adjustment_type,reason_code,created_by::text,assigned_to::text,revision FROM inventory_documents WHERE organization_id=$1 AND id=$2 AND kind=$3 FOR UPDATE`, org, id, kind).Scan(&item.ID, &item.Kind, &item.Status, &item.BranchID, &item.LocationID, &item.DestinationBranchID, &item.DestinationLocationID, &item.TransitLocationID, &item.AdjustmentType, &item.Reason, &item.CreatedBy, &item.AssignedTo, &item.Revision)
	return item, databaseError(err)
}
func documentScope(ctx context.Context, tx pgx.Tx, actor organization.Member, org string, item Document, action string) error {
	if item.Kind != "TRANSFER" {
		return scope(ctx, tx, actor, org, item.BranchID, action != "read")
	}
	if action == "read" {
		if actor.Role == "OWNER" || contains(actor.BranchIDs, item.BranchID) || contains(actor.BranchIDs, *item.DestinationBranchID) {
			return nil
		}
		return organization.ErrDenied
	}
	if action == "receive" {
		return scope(ctx, tx, actor, org, *item.DestinationBranchID, true)
	}
	if err := scope(ctx, tx, actor, org, item.BranchID, true); err != nil {
		return err
	}
	if action == "dispatch" {
		return nil
	}
	return scope(ctx, tx, actor, org, *item.DestinationBranchID, true)
}
func documentJSON(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(doc)||jsonb_build_object('items',COALESCE((SELECT jsonb_agg(to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text,'expected_quantity',item.expected_quantity::text,'counted_quantity',item.counted_quantity::text,'variance',CASE WHEN item.counted_quantity IS NOT NULL THEN (item.counted_quantity-item.expected_quantity)::text END,'sku',variant.sku,'variant_name',variant.name,'product_name',product.name,'unit',unit.code) ORDER BY variant.sku) FROM inventory_document_items item JOIN product_variants variant ON variant.organization_id=item.organization_id AND variant.id=item.variant_id JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE item.organization_id=doc.organization_id AND item.document_id=doc.id),'[]'::jsonb),'history',COALESCE((SELECT jsonb_agg(to_jsonb(event)) FROM (SELECT event_type,actor_id,created_at,request_id FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2 ORDER BY created_at DESC LIMIT 100) event),'[]'::jsonb)) FROM inventory_documents doc WHERE doc.organization_id=$1 AND doc.id=$2`, org, id)
}
func (service *Service) CreateDocument(ctx context.Context, user, org, kind, key string, input Command) (json.RawMessage, error) {
	permission := "inventory." + strings.ToLower(kind) + ".create"
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if err = input.validate(kind); err != nil {
		return nil, err
	}
	source, err := physical(ctx, tx, actor, org, input.LocationID, true)
	if err != nil {
		return nil, err
	}
	if input.BranchID != "" && input.BranchID != source.BranchID {
		return nil, ErrInput
	}
	var destinationBranch *string
	if kind == "TRANSFER" {
		destination, err := physical(ctx, tx, actor, org, *input.DestinationLocationID, true)
		if err != nil {
			return nil, err
		}
		destinationBranch = &destination.BranchID
	}
	if input.AssignedTo != nil {
		if kind != "COUNT" || !uuidPattern.MatchString(*input.AssignedTo) {
			return nil, ErrInput
		}
		if *input.AssignedTo != user && actor.Role != "OWNER" && actor.Role != "MANAGER" {
			return nil, organization.ErrDenied
		}
		var role string
		err = tx.QueryRow(ctx, `SELECT role FROM organization_memberships member WHERE organization_id=$1 AND user_id=$2 AND status='ACTIVE' AND (role='OWNER' OR EXISTS(SELECT 1 FROM branch_memberships branch WHERE branch.organization_id=member.organization_id AND branch.membership_id=member.id AND branch.branch_id=$3))`, org, *input.AssignedTo, source.BranchID).Scan(&role)
		if err != nil {
			return nil, databaseError(err)
		}
		if !contains(organization.Permissions(role), "inventory.count.update") {
			return nil, ErrInput
		}
	}
	op, cached, err := operation(ctx, tx, user, org, "create:"+kind, key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	status := "DRAFT"
	if kind == "COUNT" {
		status = "IN_PROGRESS"
	}
	var adjustment *string
	if kind == "ADJUSTMENT" {
		adjustment = &input.AdjustmentType
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO inventory_documents(organization_id,kind,status,branch_id,location_id,destination_branch_id,destination_location_id,adjustment_type,reason_code,notes,created_by,assigned_to,snapshot_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $2='COUNT' THEN now() END) RETURNING id::text`, org, kind, status, source.BranchID, input.LocationID, destinationBranch, input.DestinationLocationID, adjustment, input.ReasonCode, input.Notes, user, input.AssignedTo).Scan(&id)
	if err != nil {
		return nil, databaseError(err)
	}
	for _, item := range input.Items {
		value := item.Quantity
		if kind == "COUNT" {
			value = "0"
		}
		if err = validVariant(ctx, tx, org, item.VariantID, value, false); err != nil {
			return nil, err
		}
		if kind == "COUNT" {
			_, err = tx.Exec(ctx, `INSERT INTO inventory_document_items(organization_id,document_id,variant_id,quantity,expected_quantity,balance_version) SELECT $1,$2,$3,0,COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$4 AND variant_id=$3),0),COALESCE((SELECT version FROM stock_balances WHERE organization_id=$1 AND location_id=$4 AND variant_id=$3),0)`, org, id, item.VariantID, input.LocationID)
		} else {
			_, err = tx.Exec(ctx, `INSERT INTO inventory_document_items(organization_id,document_id,variant_id,quantity) VALUES($1,$2,$3,abs($4::numeric))`, org, id, item.VariantID, item.Quantity)
			if kind == "ADJUSTMENT" && input.AdjustmentType == "CORRECTION" {
				_, err = tx.Exec(ctx, `UPDATE inventory_document_items SET expected_quantity=COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$4 AND variant_id=$3),0),balance_version=COALESCE((SELECT version FROM stock_balances WHERE organization_id=$1 AND location_id=$4 AND variant_id=$3),0) WHERE organization_id=$1 AND document_id=$2 AND variant_id=$3`, org, id, item.VariantID, input.LocationID)
			}
		}
		if err != nil {
			return nil, databaseError(err)
		}
	}
	result, err := documentJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "inventory."+strings.ToLower(kind)+".created", id, result)
}
func (service *Service) SaveCount(ctx context.Context, user, org, id, key string, input Command) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "inventory.count.update")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	doc, err := document(ctx, tx, org, id, "COUNT")
	if err != nil {
		return nil, err
	}
	if err = documentScope(ctx, tx, actor, org, doc, "update"); err != nil {
		return nil, err
	}
	if doc.AssignedTo != nil && *doc.AssignedTo != user && actor.Role != "OWNER" && actor.Role != "MANAGER" {
		return nil, organization.ErrDenied
	}
	op, cached, err := operation(ctx, tx, user, org, "count:items:"+id, key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	if doc.Status != "IN_PROGRESS" || input.Revision != doc.Revision || len(input.Items) == 0 || len(input.Items) > 100 {
		return nil, ErrConflict
	}
	seen := map[string]bool{}
	for _, item := range input.Items {
		if !uuidPattern.MatchString(item.VariantID) || item.CountedQuantity == nil || seen[item.VariantID] {
			return nil, ErrInput
		}
		seen[item.VariantID] = true
		amount, err := quantity(*item.CountedQuantity)
		if err != nil || amount < 0 {
			return nil, ErrInput
		}
		if err = validVariant(ctx, tx, org, item.VariantID, *item.CountedQuantity, false); err != nil {
			return nil, err
		}
		updated, err := tx.Exec(ctx, "UPDATE inventory_document_items SET counted_quantity=$4,counted_by=$5,counted_at=now() WHERE organization_id=$1 AND document_id=$2 AND variant_id=$3", org, id, item.VariantID, *item.CountedQuantity, user)
		if err != nil {
			return nil, databaseError(err)
		}
		if updated.RowsAffected() != 1 {
			return nil, ErrInput
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE inventory_documents SET revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, id); err != nil {
		return nil, err
	}
	result, err := documentJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "inventory.count.saved", id, result)
}

type storedItem struct {
	VariantID string
	Quantity  string
	Expected  *string
	Counted   *string
	Version   *int64
}

func documentItems(ctx context.Context, tx pgx.Tx, org, id string) ([]storedItem, error) {
	rows, err := tx.Query(ctx, "SELECT variant_id::text,quantity::text,expected_quantity::text,counted_quantity::text,balance_version FROM inventory_document_items WHERE organization_id=$1 AND document_id=$2 ORDER BY variant_id", org, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []storedItem{}
	for rows.Next() {
		var item storedItem
		if err = rows.Scan(&item.VariantID, &item.Quantity, &item.Expected, &item.Counted, &item.Version); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}
func actionPermission(kind, action string) string {
	permission := action
	if action == "submit" || action == "cancel" {
		permission = "create"
	}
	if action == "reject" {
		permission = "approve"
	}
	if kind == "COUNT" && action == "submit" {
		permission = "update"
	}
	return "inventory." + strings.ToLower(kind) + "." + permission
}
func (service *Service) Act(ctx context.Context, user, org, kind, id, action, key string, input Command) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, actionPermission(kind, action))
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	doc, err := document(ctx, tx, org, id, kind)
	if err != nil {
		return nil, err
	}
	if err = documentScope(ctx, tx, actor, org, doc, action); err != nil {
		return nil, err
	}
	if action == "cancel" && doc.CreatedBy != user && actor.Role != "OWNER" && actor.Role != "MANAGER" {
		return nil, organization.ErrDenied
	}
	if kind == "COUNT" && action == "submit" && doc.AssignedTo != nil && *doc.AssignedTo != user && actor.Role != "OWNER" && actor.Role != "MANAGER" {
		return nil, organization.ErrDenied
	}
	op, cached, err := operation(ctx, tx, user, org, kind+":"+id+":"+action, key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	if input.Revision != doc.Revision {
		return nil, ErrConflict
	}
	next, err := transition(kind, doc.Status, action)
	if err != nil {
		return nil, err
	}
	items, err := documentItems(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	if kind == "COUNT" && (action == "submit" || action == "post") {
		for _, item := range items {
			if item.Counted == nil {
				return nil, ErrConflict
			}
		}
	}
	if action == "post" {
		if _, err = physical(ctx, tx, actor, org, doc.LocationID, true); err != nil {
			return nil, err
		}
		for _, item := range items {
			delta, err := quantity(item.Quantity)
			if err != nil {
				return nil, err
			}
			movement := "ADJUSTMENT_IN"
			if kind == "COUNT" || kind == "ADJUSTMENT" && *doc.AdjustmentType == "CORRECTION" {
				var version int64
				err = tx.QueryRow(ctx, "SELECT COALESCE((SELECT version FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)", org, doc.LocationID, item.VariantID).Scan(&version)
				if err != nil {
					return nil, err
				}
				if item.Version == nil || version != *item.Version {
					return nil, ErrConflict
				}
				counted := delta
				if kind == "COUNT" {
					counted, _ = quantity(*item.Counted)
				}
				expected, _ := quantity(*item.Expected)
				delta = counted - expected
				if kind == "COUNT" {
					movement = "COUNT_CORRECTION"
				}
			} else {
				if *doc.AdjustmentType == "DECREASE" {
					delta = -delta
				}
			}
			if kind == "ADJUSTMENT" && delta < 0 {
				movement = "ADJUSTMENT_OUT"
			}
			if delta != 0 {
				if err = postMovement(ctx, tx, user, org, op, id, doc.LocationID, item.VariantID, movement, decimal(delta), doc.Reason); err != nil {
					return nil, err
				}
			}
		}
	}
	if kind == "TRANSFER" && (action == "dispatch" || action == "receive") {
		next, err = service.moveTransfer(ctx, tx, actor, user, org, op, doc, items, action)
		if err != nil {
			return nil, err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE inventory_documents SET status=$3,revision=revision+1,updated_at=now(),approved_by=CASE WHEN $4='approve' THEN $5::uuid ELSE approved_by END,approved_at=CASE WHEN $4='approve' THEN now() ELSE approved_at END,posted_by=CASE WHEN $3='POSTED' THEN $5::uuid ELSE posted_by END,posted_at=CASE WHEN $3='POSTED' THEN now() ELSE posted_at END,dispatched_by=CASE WHEN $4='dispatch' THEN $5::uuid ELSE dispatched_by END,dispatched_at=CASE WHEN $4='dispatch' THEN now() ELSE dispatched_at END,received_by=CASE WHEN $3='RECEIVED' THEN $5::uuid ELSE received_by END,received_at=CASE WHEN $3='RECEIVED' THEN now() ELSE received_at END WHERE organization_id=$1 AND id=$2`, org, id, next, action, user)
	if err != nil {
		return nil, databaseError(err)
	}
	result, err := documentJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return complete(ctx, tx, user, org, op, "inventory."+strings.ToLower(kind)+"."+action, id, result)
}
