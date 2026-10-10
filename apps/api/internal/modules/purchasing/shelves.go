package purchasing

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

type shelf struct {
	ID, Branch, Location, Status string
	Revision                     int64
}

func readShelf(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string, write bool) (shelf, error) {
	var item shelf
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, `SELECT id::text,branch_id::text,stock_location_id::text,status,revision FROM shelves WHERE organization_id=$1 AND id=$2`, org, id).Scan(&item.ID, &item.Branch, &item.Location, &item.Status, &item.Revision)
	if err != nil {
		return item, dbError(err)
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, item.Branch, write); err != nil {
		return item, err
	}
	if write && item.Status != "ACTIVE" {
		return item, ErrConflict
	}
	return item, nil
}

const assignmentJSON = `to_jsonb(assignment)||jsonb_build_object('minimum_quantity',assignment.minimum_quantity::text,'target_quantity',assignment.target_quantity::text,'capacity_quantity',assignment.capacity_quantity::text,'recorded_quantity',COALESCE(balance.quantity,0)::text,'sku',variant.sku,'name',product.name,'unit',unit.name,'slot_code',slot.code,'last_count', (SELECT jsonb_build_object('document_id',doc.id,'status',doc.status,'expected_quantity',item.expected_quantity::text,'counted_quantity',item.counted_quantity::text,'variance',(item.counted_quantity-item.expected_quantity)::text,'counted_at',item.counted_at) FROM inventory_document_items item JOIN inventory_documents doc ON doc.organization_id=item.organization_id AND doc.id=item.document_id WHERE item.organization_id=assignment.organization_id AND item.variant_id=assignment.variant_id AND doc.location_id=shelf.stock_location_id AND doc.kind='COUNT' AND item.counted_quantity IS NOT NULL ORDER BY item.counted_at DESC LIMIT 1))`
const assignmentJoins = ` FROM shelf_assignments assignment JOIN shelves shelf ON shelf.organization_id=assignment.organization_id AND shelf.id=assignment.shelf_id JOIN shelf_slots slot ON slot.organization_id=assignment.organization_id AND slot.id=assignment.slot_id JOIN product_variants variant ON variant.organization_id=assignment.organization_id AND variant.id=assignment.variant_id JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id LEFT JOIN stock_balances balance ON balance.organization_id=assignment.organization_id AND balance.location_id=shelf.stock_location_id AND balance.variant_id=assignment.variant_id`

func shelfJSON(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(shelf)||jsonb_build_object('slots',COALESCE((SELECT jsonb_agg(to_jsonb(slot) ORDER BY position,code) FROM shelf_slots slot WHERE slot.organization_id=shelf.organization_id AND slot.shelf_id=shelf.id),'[]'::jsonb),'assignments',COALESCE((SELECT jsonb_agg(`+assignmentJSON+` ORDER BY slot.position)`+assignmentJoins+` WHERE assignment.organization_id=$1 AND assignment.shelf_id=$2),'[]'::jsonb)) FROM shelves shelf WHERE organization_id=$1 AND id=$2`, org, id)
}
func (service *Service) SaveShelf(ctx context.Context, user, org, id string, input ShelfInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "shelf.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !codePattern.MatchString(input.Code) || !text(input.Name, 200, true) || !text(input.Zone, 200, false) || !text(input.Description, 2000, false) || !contains([]string{"ACTIVE", "INACTIVE", "ARCHIVED"}, input.Status) {
		return nil, ErrInput
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return nil, err
	}
	if err = inventory.SaleLocation(ctx, tx, actor, org, input.BranchID, input.LocationID); err != nil {
		return nil, err
	}
	var locationType string
	err = tx.QueryRow(ctx, "SELECT type FROM stock_locations WHERE organization_id=$1 AND id=$2", org, input.LocationID).Scan(&locationType)
	if err != nil {
		return nil, dbError(err)
	}
	if !contains([]string{"SHELF", "SALES_FLOOR"}, locationType) {
		return nil, ErrInput
	}
	if id != "" {
		current, err := readShelf(ctx, tx, actor, org, id, false)
		if err != nil {
			return nil, err
		}
		if current.Revision != input.Revision || current.Branch != input.BranchID || current.Location != input.LocationID {
			return nil, ErrConflict
		}
		if input.Status != "ACTIVE" {
			var pending bool
			err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM replenishment_tasks WHERE organization_id=$1 AND shelf_id=$2 AND status IN ('OPEN','ASSIGNED','IN_PROGRESS'))", org, id).Scan(&pending)
			if err != nil {
				return nil, err
			}
			if pending {
				return nil, ErrConflict
			}
		}
		_, err = tx.Exec(ctx, `UPDATE shelves SET code=$3,name=$4,zone=$5,description=$6,status=$7,revision=revision+1,updated_by=$8,updated_at=now() WHERE organization_id=$1 AND id=$2`, org, id, input.Code, input.Name, input.Zone, input.Description, input.Status, user)
	} else {
		err = tx.QueryRow(ctx, `INSERT INTO shelves(organization_id,branch_id,stock_location_id,code,name,zone,description,status,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING id::text`, org, input.BranchID, input.LocationID, input.Code, input.Name, input.Zone, input.Description, input.Status, user).Scan(&id)
	}
	if err != nil {
		return nil, dbError(err)
	}
	result, err := shelfJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, "", "shelf.saved", id, result)
}
func (service *Service) SaveSlot(ctx context.Context, user, org, shelfID string, input SlotInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "shelf.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = readShelf(ctx, tx, actor, org, shelfID, true); err != nil {
		return nil, err
	}
	if !codePattern.MatchString(input.Code) || input.Position < 0 || input.Position > 10000 {
		return nil, ErrInput
	}
	var count int
	err = tx.QueryRow(ctx, "SELECT count(*) FROM shelf_slots WHERE organization_id=$1 AND shelf_id=$2", org, shelfID).Scan(&count)
	if err != nil {
		return nil, err
	}
	if count >= 100 {
		return nil, ErrConflict
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO shelf_slots(organization_id,shelf_id,code,position) VALUES($1,$2,$3,$4) RETURNING id::text`, org, shelfID, input.Code, input.Position).Scan(&id)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := raw(ctx, tx, "SELECT to_jsonb(slot) FROM shelf_slots slot WHERE organization_id=$1 AND id=$2", org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, "", "shelf.slot.created", id, result)
}
func (service *Service) SaveAssignment(ctx context.Context, user, org, shelfID, id string, input AssignmentInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "shelf.assignment.manage")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	current, err := readShelf(ctx, tx, actor, org, shelfID, true)
	if err != nil {
		return nil, err
	}
	if !uuidPattern.MatchString(input.SlotID) || !uuidPattern.MatchString(input.VariantID) {
		return nil, ErrInput
	}
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	minimum, err := decimal(input.Minimum, 3)
	if err != nil {
		return nil, err
	}
	target, err := decimal(input.Target, 3)
	if err != nil {
		return nil, err
	}
	capacity, err := decimal(input.Capacity, 3)
	if err != nil || capacity <= 0 || minimum > target || target > capacity || !contains([]string{"ACTIVE", "INACTIVE"}, input.Status) {
		return nil, ErrInput
	}
	for _, amount := range []string{input.Minimum, input.Target, input.Capacity} {
		if err = inventory.ValidateQuantity(ctx, tx, org, input.VariantID, amount, false); err != nil {
			return nil, err
		}
	}
	var recorded string
	err = tx.QueryRow(ctx, `SELECT COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)::text`, org, current.Location, input.VariantID).Scan(&recorded)
	if err != nil {
		return nil, err
	}
	stock, _ := decimal(recorded, 3)
	if stock > capacity {
		return nil, ErrConflict
	}
	if id != "" {
		if err = checkRevision(ctx, tx, org, "shelf_assignments", id, input.Revision); err != nil {
			return nil, err
		}
		var pending bool
		err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM replenishment_tasks WHERE organization_id=$1 AND assignment_id=$2 AND status IN ('OPEN','ASSIGNED','IN_PROGRESS'))", org, id).Scan(&pending)
		if err != nil {
			return nil, err
		}
		if pending {
			return nil, ErrConflict
		}
		changed, err := tx.Exec(ctx, `UPDATE shelf_assignments SET slot_id=$4,minimum_quantity=$5,target_quantity=$6,capacity_quantity=$7,status=$8,revision=revision+1 WHERE organization_id=$1 AND id=$2 AND shelf_id=$3 AND variant_id=$9`, org, id, shelfID, input.SlotID, input.Minimum, input.Target, input.Capacity, input.Status, input.VariantID)
		if err != nil {
			return nil, dbError(err)
		}
		if changed.RowsAffected() != 1 {
			return nil, ErrConflict
		}
	} else {
		err = tx.QueryRow(ctx, `INSERT INTO shelf_assignments(organization_id,shelf_id,slot_id,variant_id,minimum_quantity,target_quantity,capacity_quantity,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id::text`, org, shelfID, input.SlotID, input.VariantID, input.Minimum, input.Target, input.Capacity, input.Status).Scan(&id)
		if err != nil {
			return nil, dbError(err)
		}
	}
	result, err := raw(ctx, tx, `SELECT `+assignmentJSON+assignmentJoins+` WHERE assignment.organization_id=$1 AND assignment.id=$2`, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, "", "shelf.assignment.saved", id, result)
}

type assignment struct{ ID, Shelf, Variant, Location, Branch, Status, ShelfStatus, Minimum, Target, Capacity string }

func readAssignment(ctx context.Context, tx pgx.Tx, actor organization.Member, org, id string) (assignment, error) {
	var item assignment
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, `SELECT assignment.id::text,shelf.id::text,assignment.variant_id::text,shelf.stock_location_id::text,shelf.branch_id::text,assignment.status,shelf.status,assignment.minimum_quantity::text,assignment.target_quantity::text,assignment.capacity_quantity::text FROM shelf_assignments assignment JOIN shelves shelf ON shelf.organization_id=assignment.organization_id AND shelf.id=assignment.shelf_id WHERE assignment.organization_id=$1 AND assignment.id=$2`, org, id).Scan(&item.ID, &item.Shelf, &item.Variant, &item.Location, &item.Branch, &item.Status, &item.ShelfStatus, &item.Minimum, &item.Target, &item.Capacity)
	if err != nil {
		return item, dbError(err)
	}
	return item, inventory.BranchScope(ctx, tx, actor, org, item.Branch, true)
}
func balance(ctx context.Context, tx pgx.Tx, org, location, variant string) (int64, error) {
	var amount string
	err := tx.QueryRow(ctx, "SELECT COALESCE((SELECT quantity FROM stock_balances WHERE organization_id=$1 AND location_id=$2 AND variant_id=$3),0)::text", org, location, variant).Scan(&amount)
	if err != nil {
		return 0, err
	}
	return decimal(amount, 3)
}
func taskJSON(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(task)||jsonb_build_object('quantity',quantity::text) FROM replenishment_tasks task WHERE organization_id=$1 AND id=$2`, org, id)
}
func (service *Service) CreateTask(ctx context.Context, user, org, key string, input TaskInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, "shelf.replenishment.create")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	item, err := readAssignment(ctx, tx, actor, org, input.AssignmentID)
	if err != nil {
		return nil, err
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "shelf.task.create", key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	if item.Status != "ACTIVE" || item.ShelfStatus != "ACTIVE" {
		return nil, ErrConflict
	}
	if err = inventory.SupplyLocation(ctx, tx, actor, org, item.Branch, input.SourceID, "RECEIPT"); err != nil {
		return nil, err
	}
	if err = inventory.SaleLocation(ctx, tx, actor, org, item.Branch, item.Location); err != nil {
		return nil, err
	}
	requested, err := decimal(input.Quantity, 3)
	if err != nil || requested <= 0 || input.SourceID == item.Location {
		return nil, ErrInput
	}
	if err = inventory.ValidateQuantity(ctx, tx, org, item.Variant, input.Quantity, true); err != nil {
		return nil, err
	}
	recorded, err := balance(ctx, tx, org, item.Location, item.Variant)
	if err != nil {
		return nil, err
	}
	available, err := balance(ctx, tx, org, input.SourceID, item.Variant)
	if err != nil {
		return nil, err
	}
	target, _ := decimal(item.Target, 3)
	capacity, _ := decimal(item.Capacity, 3)
	if requested > available {
		return nil, ErrStock
	}
	if recorded+requested > target || recorded+requested > capacity {
		return nil, ErrConflict
	}
	var id string
	err = tx.QueryRow(ctx, `INSERT INTO replenishment_tasks(organization_id,branch_id,shelf_id,assignment_id,source_location_id,quantity,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id::text`, org, item.Branch, item.Shelf, item.ID, input.SourceID, input.Quantity, user).Scan(&id)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := taskJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "shelf.task.created", id, result)
}
func (service *Service) ActTask(ctx context.Context, user, org, id, action, key string, input ActionInput) (json.RawMessage, error) {
	permission := "shelf.replenishment.complete"
	if action == "assign" {
		permission = "shelf.replenishment.assign"
	}
	if action == "cancel" {
		permission = "shelf.replenishment.create"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) || !text(input.Reason, 2000, false) {
		return nil, ErrInput
	}
	var assignmentID, source, status, quantity string
	var assigned *string
	var revision int64
	err = tx.QueryRow(ctx, `SELECT assignment_id::text,source_location_id::text,status,quantity::text,assigned_to::text,revision FROM replenishment_tasks WHERE organization_id=$1 AND id=$2 FOR UPDATE`, org, id).Scan(&assignmentID, &source, &status, &quantity, &assigned, &revision)
	if err != nil {
		return nil, dbError(err)
	}
	item, err := readAssignment(ctx, tx, actor, org, assignmentID)
	if err != nil {
		return nil, err
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "shelf.task:"+id+":"+action, key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	if revision != input.Revision {
		return nil, ErrConflict
	}
	next, err := transition("TASK", status, action)
	if err != nil {
		return nil, err
	}
	if assigned != nil && *assigned != user && actor.Role != "OWNER" && actor.Role != "MANAGER" {
		return nil, organization.ErrDenied
	}
	if action == "assign" {
		if !uuidPattern.MatchString(input.AssignedTo) {
			return nil, ErrInput
		}
		var eligible bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organization_memberships member WHERE member.organization_id=$1 AND member.user_id=$2 AND member.status='ACTIVE' AND member.role IN ('OWNER','MANAGER','INVENTORY_STAFF') AND (member.role='OWNER' OR EXISTS(SELECT 1 FROM branch_memberships access WHERE access.organization_id=member.organization_id AND access.membership_id=member.id AND access.branch_id=$3)))`, org, input.AssignedTo, item.Branch).Scan(&eligible)
		if err != nil {
			return nil, err
		}
		if !eligible {
			return nil, organization.ErrDenied
		}
		_, err = tx.Exec(ctx, `UPDATE replenishment_tasks SET assigned_to=$3 WHERE organization_id=$1 AND id=$2`, org, id, input.AssignedTo)
		if err != nil {
			return nil, dbError(err)
		}
	} else if input.AssignedTo != "" {
		return nil, ErrInput
	}
	transfer := ""
	if action == "complete" {
		if item.Status != "ACTIVE" || item.ShelfStatus != "ACTIVE" {
			return nil, ErrConflict
		}
		requested, _ := decimal(quantity, 3)
		recorded, err := balance(ctx, tx, org, item.Location, item.Variant)
		if err != nil {
			return nil, err
		}
		capacity, _ := decimal(item.Capacity, 3)
		target, _ := decimal(item.Target, 3)
		if recorded+requested > capacity || recorded+requested > target {
			return nil, ErrConflict
		}
		available, err := balance(ctx, tx, org, source, item.Variant)
		if err != nil {
			return nil, err
		}
		if requested > available {
			return nil, ErrStock
		}
		adapter := inventory.Service{Organization: service.Organization}
		transfer, err = adapter.Replenish(ctx, tx, actor, user, org, op, item.Branch, source, item.Location, item.Variant, quantity)
		if err != nil {
			return nil, err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE replenishment_tasks SET status=$3,revision=revision+1,transfer_id=$4,inventory_operation_id=CASE WHEN $3='COMPLETED' THEN $5::uuid ELSE NULL END,completed_by=CASE WHEN $3='COMPLETED' THEN $6::uuid ELSE NULL END,completed_at=CASE WHEN $3='COMPLETED' THEN now() ELSE NULL END WHERE organization_id=$1 AND id=$2`, org, id, next, nullable(transfer), op, user)
	if err != nil {
		return nil, dbError(err)
	}
	result, err := taskJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "shelf.task."+action, id, result)
}
