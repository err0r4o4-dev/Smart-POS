package purchasing

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"time"
)

type document struct {
	ID, Kind, Branch, Supplier, Status, Creator string
	Parent, Location                            *string
	Revision                                    int64
}

func readDocument(ctx context.Context, tx pgx.Tx, org, id, kind string) (document, error) {
	var item document
	if !uuidPattern.MatchString(id) {
		return item, ErrInput
	}
	err := tx.QueryRow(ctx, `SELECT id::text,kind,branch_id::text,supplier_id::text,status,created_by::text,parent_id::text,location_id::text,revision FROM purchasing_documents WHERE organization_id=$1 AND id=$2 AND kind=$3 FOR UPDATE`, org, id, kind).Scan(&item.ID, &item.Kind, &item.Branch, &item.Supplier, &item.Status, &item.Creator, &item.Parent, &item.Location, &item.Revision)
	return item, dbError(err)
}

const itemJSON = `to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text,'base_quantity',item.base_quantity::text,'accepted_quantity',item.accepted_quantity::text,'outstanding_quantity',(item.quantity-item.accepted_quantity)::text,'conversion_factor',item.conversion_factor::text,'unit_cost',item.unit_cost::text,'line_total',item.line_total::text,'delivered_quantity',item.delivered_quantity::text,'rejected_quantity',item.rejected_quantity::text,'damaged_quantity',item.damaged_quantity::text)`

func documentJSON(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	return raw(ctx, tx, `SELECT to_jsonb(doc)||jsonb_build_object('total',doc.total::text,'items',COALESCE((SELECT jsonb_agg(`+itemJSON+` ORDER BY item.sku_snapshot) FROM purchasing_items item WHERE item.organization_id=doc.organization_id AND item.document_id=doc.id),'[]'::jsonb),'events',COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at) FROM (SELECT * FROM purchasing_events WHERE organization_id=doc.organization_id AND document_id=doc.id ORDER BY created_at DESC,id LIMIT 100) event),'[]'::jsonb),'children',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',child.id,'kind',child.kind,'number',child.number,'status',child.status)) FROM (SELECT * FROM purchasing_documents WHERE organization_id=doc.organization_id AND parent_id=doc.id ORDER BY created_at DESC,id LIMIT 100) child),'[]'::jsonb)) FROM purchasing_documents doc WHERE doc.organization_id=$1 AND doc.id=$2`, org, id)
}
func event(ctx context.Context, tx pgx.Tx, user, org, id, action, reason string) error {
	_, err := tx.Exec(ctx, `INSERT INTO purchasing_events(organization_id,document_id,action,revision,actor_id,reason) SELECT organization_id,id,$3,revision,$4,$5 FROM purchasing_documents WHERE organization_id=$1 AND id=$2`, org, id, action, user, reason)
	return dbError(err)
}
func documentPermission(kind, action string) string {
	if kind == "ORDER" {
		if action == "submit" || action == "correct" {
			action = "update"
		}
		if action == "reject" {
			action = "approve"
		}
		if action == "close" {
			action = "cancel"
		}
		return "purchasing.order." + action
	}
	prefix := "purchasing.receive."
	if kind == "RETURN" {
		prefix = "purchasing.return."
	}
	if action == "submit" || action == "update" || action == "cancel" {
		action = "create"
	}
	if kind == "RECEIPT" && (action == "approve" || action == "reject" || action == "correct") {
		action = "review"
	}
	if kind == "RETURN" && action == "reject" {
		action = "approve"
	}
	return prefix + action
}
func (service *Service) SaveDocument(ctx context.Context, user, org, kind, id, key string, input DocumentInput) (json.RawMessage, error) {
	action := "create"
	if id != "" {
		action = "update"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, documentPermission(kind, action))
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !contains([]string{"ORDER", "RECEIPT", "RETURN"}, kind) || !uuidPattern.MatchString(input.SupplierID) || !text(input.Notes, 2000, false) || len(input.Items) == 0 || len(input.Items) > 100 {
		return nil, ErrInput
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, input.BranchID, true); err != nil {
		return nil, err
	}
	var current document
	if id != "" {
		current, err = readDocument(ctx, tx, org, id, kind)
		if err != nil {
			return nil, err
		}
		if current.Branch != input.BranchID || current.Supplier != input.SupplierID {
			return nil, ErrConflict
		}
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "purchasing:"+kind+":"+action+":"+id, key, input)
	if err != nil || cached != nil {
		return cached, err
	}
	if id != "" && (current.Status != "DRAFT" || current.Revision != input.Revision) {
		return nil, ErrConflict
	}
	var supplierSnapshot []byte
	var supplierStatus, currency string
	err = tx.QueryRow(ctx, `SELECT to_jsonb(supplier),supplier.status,org.currency FROM suppliers supplier JOIN organizations org ON org.id=supplier.organization_id WHERE supplier.organization_id=$1 AND supplier.id=$2`, org, input.SupplierID).Scan(&supplierSnapshot, &supplierStatus, &currency)
	if err != nil {
		return nil, dbError(err)
	}
	if currency != "THB" || (kind == "ORDER" && supplierStatus != "ACTIVE") {
		return nil, ErrConflict
	}
	if kind == "ORDER" {
		if input.ParentID != "" || input.LocationID != "" {
			return nil, ErrInput
		}
		if input.ExpectedDate != "" {
			if _, err = time.Parse("2006-01-02", input.ExpectedDate); err != nil {
				return nil, ErrInput
			}
		}
	} else {
		parentKind := "ORDER"
		if kind == "RETURN" {
			parentKind = "RECEIPT"
		}
		parent, err := readDocument(ctx, tx, org, input.ParentID, parentKind)
		if err != nil {
			return nil, err
		}
		if parent.Branch != input.BranchID || parent.Supplier != input.SupplierID || (kind == "RECEIPT" && !contains([]string{"ORDERED", "PARTIALLY_RECEIVED"}, parent.Status)) || (kind == "RETURN" && parent.Status != "POSTED") {
			return nil, ErrConflict
		}
		if err = inventory.SupplyLocation(ctx, tx, actor, org, input.BranchID, input.LocationID, kind); err != nil {
			return nil, err
		}
		err = tx.QueryRow(ctx, `SELECT supplier_snapshot FROM purchasing_documents WHERE organization_id=$1 AND id=$2`, org, input.ParentID).Scan(&supplierSnapshot)
		if err != nil {
			return nil, dbError(err)
		}
	}
	if id == "" {
		err = tx.QueryRow(ctx, `INSERT INTO purchasing_documents(organization_id,branch_id,supplier_id,kind,parent_id,location_id,supplier_snapshot,currency,expected_delivery_date,notes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id::text`, org, input.BranchID, input.SupplierID, kind, nullable(input.ParentID), nullable(input.LocationID), supplierSnapshot, currency, nullable(input.ExpectedDate), input.Notes, user).Scan(&id)
	} else {
		_, err = tx.Exec(ctx, `DELETE FROM purchasing_items WHERE organization_id=$1 AND document_id=$2`, org, id)
		if err == nil {
			_, err = tx.Exec(ctx, `UPDATE purchasing_documents SET parent_id=$3,location_id=$4,expected_delivery_date=$5,notes=$6,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2`, org, id, nullable(input.ParentID), nullable(input.LocationID), nullable(input.ExpectedDate), input.Notes)
		}
	}
	if err != nil {
		return nil, dbError(err)
	}
	total := int64(0)
	seen := map[string]bool{}
	for _, line := range input.Items {
		if line.BatchID != nil && (!uuidPattern.MatchString(*line.BatchID) || !line.BatchVerified || kind == "ORDER") {
			return nil, ErrInput
		}
		if !uuidPattern.MatchString(line.VariantID) || seen[line.VariantID] || !text(line.Reason, 2000, false) {
			return nil, ErrInput
		}
		seen[line.VariantID] = true
		amount, err := decimal(line.Quantity, 3)
		if err != nil || amount <= 0 {
			return nil, ErrInput
		}
		info := variantInfo{}
		unit := line.PurchaseUnitID
		cost := line.UnitCost
		accepted, delivered, rejected, damaged := int64(0), int64(0), int64(0), int64(0)
		if kind == "ORDER" {
			if line.ParentItemID != "" || line.Delivered != "" || line.Rejected != "" || line.Damaged != "" {
				return nil, ErrInput
			}
			info, err = conversion(ctx, tx, org, line.VariantID, unit)
			if err != nil {
				return nil, err
			}
			var minimum, multiple string
			var configuredUnit string
			err = tx.QueryRow(ctx, `SELECT minimum_order_quantity::text,order_multiple::text,purchase_unit_id::text FROM supplier_products WHERE organization_id=$1 AND supplier_id=$2 AND variant_id=$3 AND status='ACTIVE'`, org, input.SupplierID, line.VariantID).Scan(&minimum, &multiple, &configuredUnit)
			if err != nil {
				return nil, dbError(err)
			}
			minimumAmount, _ := decimal(minimum, 3)
			multipleAmount, _ := decimal(multiple, 3)
			if unit != configuredUnit || amount < minimumAmount || amount%multipleAmount != 0 {
				return nil, ErrInput
			}
		} else {
			if !uuidPattern.MatchString(line.ParentItemID) {
				return nil, ErrInput
			}
			var parentAmount, parentAccepted string
			var parentBatch *string
			err = tx.QueryRow(ctx, `SELECT name_snapshot,sku_snapshot,purchase_unit_id::text,inventory_unit_id::text,unit_snapshot,conversion_factor::text,unit_cost::text,quantity::text,accepted_quantity::text,batch_id::text FROM purchasing_items WHERE organization_id=$1 AND document_id=$2 AND id=$3 AND variant_id=$4`, org, input.ParentID, line.ParentItemID, line.VariantID).Scan(&info.Name, &info.SKU, &unit, &info.UnitID, &info.UnitName, &info.Factor, &cost, &parentAmount, &parentAccepted, &parentBatch)
			if err != nil {
				return nil, dbError(err)
			}
			err = tx.QueryRow(ctx, `SELECT stock.unit_type,purchase.unit_type FROM units stock JOIN units purchase ON purchase.organization_id=stock.organization_id AND purchase.id=$3 WHERE stock.organization_id=$1 AND stock.id=$2`, org, info.UnitID, unit).Scan(&info.UnitType, &info.PurchaseType)
			if err != nil {
				return nil, dbError(err)
			}
			if (line.PurchaseUnitID != "" && line.PurchaseUnitID != unit) || (line.UnitCost != "" && line.UnitCost != cost) {
				return nil, ErrInput
			}
			ordered, _ := decimal(parentAmount, 3)
			received, _ := decimal(parentAccepted, 3)
			if kind == "RECEIPT" {
				accepted = amount
				delivered, err = decimal(line.Delivered, 3)
				if err != nil {
					return nil, err
				}
				rejected, err = decimal(line.Rejected, 3)
				if err != nil {
					return nil, err
				}
				damaged, err = decimal(line.Damaged, 3)
				if err != nil {
					return nil, err
				}
				if amount > ordered-received || delivered != amount+rejected || damaged > rejected || ((rejected > 0 || delivered != ordered-received) && !text(line.Reason, 2000, true)) {
					return nil, ErrInput
				}
				if (info.PurchaseType == "COUNT" || info.PurchaseType == "PACKAGING") && (delivered%1000 != 0 || rejected%1000 != 0 || damaged%1000 != 0) {
					return nil, ErrInput
				}
			} else {
				if (parentBatch == nil) != (line.BatchID == nil) || parentBatch != nil && *parentBatch != *line.BatchID {
					return nil, ErrInput
				}
				if !text(line.Reason, 2000, true) {
					return nil, ErrInput
				}
				var returned string
				err = tx.QueryRow(ctx, `SELECT COALESCE(sum(item.quantity),0)::text FROM purchasing_items item JOIN purchasing_documents doc ON doc.organization_id=item.organization_id AND doc.id=item.document_id WHERE item.organization_id=$1 AND item.parent_item_id=$2 AND doc.kind='RETURN' AND doc.status='DISPATCHED'`, org, line.ParentItemID).Scan(&returned)
				if err != nil {
					return nil, err
				}
				returnedAmount, _ := decimal(returned, 3)
				if amount > ordered-returnedAmount {
					return nil, ErrConflict
				}
			}
		}
		if (info.PurchaseType == "COUNT" || info.PurchaseType == "PACKAGING") && amount%1000 != 0 {
			return nil, ErrInput
		}
		base, err := convert(amount, info.Factor)
		if err != nil {
			return nil, err
		}
		var currentUnit string
		err = tx.QueryRow(ctx, "SELECT unit_id::text FROM product_variants WHERE organization_id=$1 AND id=$2", org, line.VariantID).Scan(&currentUnit)
		if err != nil {
			return nil, dbError(err)
		}
		if currentUnit != info.UnitID {
			return nil, ErrConflict
		}
		if err = inventory.ValidateQuantity(ctx, tx, org, line.VariantID, fixed(base, 3), true); err != nil {
			return nil, err
		}
		cents, err := decimal(cost, 2)
		if err != nil {
			return nil, err
		}
		lineTotal, err := lineCost(amount, cents)
		if err != nil || total > 999999999999999999-lineTotal {
			return nil, ErrInput
		}
		total += lineTotal
		_, err = tx.Exec(ctx, `INSERT INTO purchasing_items(organization_id,document_id,variant_id,parent_item_id,name_snapshot,sku_snapshot,purchase_unit_id,inventory_unit_id,unit_snapshot,conversion_factor,quantity,base_quantity,unit_cost,line_total,accepted_quantity,delivered_quantity,rejected_quantity,damaged_quantity,reason,batch_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`, org, id, line.VariantID, nullable(line.ParentItemID), info.Name, info.SKU, unit, info.UnitID, info.UnitName, info.Factor, fixed(amount, 3), fixed(base, 3), fixed(cents, 2), fixed(lineTotal, 2), fixed(accepted, 3), fixed(delivered, 3), fixed(rejected, 3), fixed(damaged, 3), line.Reason, line.BatchID)
		if err != nil {
			return nil, dbError(err)
		}
	}
	if _, err = tx.Exec(ctx, "UPDATE purchasing_documents SET total=$3 WHERE organization_id=$1 AND id=$2", org, id, fixed(total, 2)); err != nil {
		return nil, dbError(err)
	}
	if err = event(ctx, tx, user, org, id, action, input.Notes); err != nil {
		return nil, err
	}
	result, err := documentJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "purchasing."+kind+".saved", id, result)
}

func (service *Service) ActDocument(ctx context.Context, user, org, kind, id, action, key string, input ActionInput) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, documentPermission(kind, action))
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	doc, err := readDocument(ctx, tx, org, id, kind)
	if err != nil {
		return nil, err
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, doc.Branch, true); err != nil {
		return nil, err
	}
	if !text(input.Reason, 2000, false) || input.AssignedTo != "" {
		return nil, ErrInput
	}
	op, cached, err := inventory.BeginOperation(ctx, tx, user, org, "purchasing:"+kind+":"+id+":"+action, key, input)
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
	if action == "approve" && doc.Creator == user && actor.Role != "OWNER" {
		return nil, organization.ErrDenied
	}
	if contains([]string{"reject", "correct", "cancel", "close", "issue"}, action) && !text(input.Reason, 2000, true) {
		return nil, ErrInput
	}
	if kind == "ORDER" && contains([]string{"submit", "approve", "issue"}, action) {
		var valid bool
		err = tx.QueryRow(ctx, `SELECT supplier.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM purchasing_items item JOIN product_variants variant ON variant.organization_id=item.organization_id AND variant.id=item.variant_id JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id WHERE item.organization_id=doc.organization_id AND item.document_id=doc.id AND (variant.status<>'ACTIVE' OR product.status<>'ACTIVE' OR unit.status<>'ACTIVE' OR variant.unit_id<>item.inventory_unit_id)) FROM purchasing_documents doc JOIN suppliers supplier ON supplier.organization_id=doc.organization_id AND supplier.id=doc.supplier_id WHERE doc.organization_id=$1 AND doc.id=$2`, org, id).Scan(&valid)
		if err != nil {
			return nil, err
		}
		if !valid {
			return nil, ErrConflict
		}
	}
	if kind == "ORDER" && (action == "close" || action == "cancel") {
		var blocked bool
		err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM purchasing_documents WHERE organization_id=$1 AND parent_id=$2 AND kind='RECEIPT' AND status IN ('DRAFT','PENDING_REVIEW','APPROVED')) OR ($3='cancel' AND EXISTS(SELECT 1 FROM purchasing_items WHERE organization_id=$1 AND document_id=$2 AND accepted_quantity>0))`, org, id, action).Scan(&blocked)
		if err != nil {
			return nil, err
		}
		if blocked {
			return nil, ErrConflict
		}
	}
	if action == "post" || action == "dispatch" {
		if err = service.postDocument(ctx, tx, actor, user, org, op, doc); err != nil {
			return nil, err
		}
	}
	_, err = tx.Exec(ctx, `UPDATE purchasing_documents SET status=$3,revision=revision+1,updated_at=now(),approved_by=CASE WHEN $4='approve' THEN $5::uuid ELSE approved_by END,approved_at=CASE WHEN $4='approve' THEN now() ELSE approved_at END,issued_by=CASE WHEN $4='issue' THEN $5::uuid ELSE issued_by END,issued_at=CASE WHEN $4='issue' THEN now() ELSE issued_at END,posted_by=CASE WHEN $4 IN ('post','dispatch') THEN $5::uuid ELSE posted_by END,posted_at=CASE WHEN $4 IN ('post','dispatch') THEN now() ELSE posted_at END,inventory_operation_id=CASE WHEN $4 IN ('post','dispatch') THEN $6::uuid ELSE inventory_operation_id END WHERE organization_id=$1 AND id=$2`, org, id, next, action, user, op)
	if err != nil {
		return nil, dbError(err)
	}
	if err = event(ctx, tx, user, org, id, action, input.Reason); err != nil {
		return nil, err
	}
	result, err := documentJSON(ctx, tx, org, id)
	if err != nil {
		return nil, err
	}
	return finish(ctx, tx, user, org, op, "purchasing."+kind+"."+action, id, result)
}
func (service *Service) postDocument(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, op string, doc document) error {
	parentKind := "ORDER"
	if doc.Kind == "RETURN" {
		parentKind = "RECEIPT"
	}
	parent, err := readDocument(ctx, tx, org, *doc.Parent, parentKind)
	if err != nil {
		return err
	}
	if (doc.Kind == "RECEIPT" && !contains([]string{"ORDERED", "PARTIALLY_RECEIVED"}, parent.Status)) || (doc.Kind == "RETURN" && parent.Status != "POSTED") {
		return ErrConflict
	}
	rows, err := tx.Query(ctx, `SELECT variant_id::text,parent_item_id::text,quantity::text,base_quantity::text,inventory_unit_id::text,batch_id::text FROM purchasing_items WHERE organization_id=$1 AND document_id=$2 ORDER BY variant_id`, org, doc.ID)
	if err != nil {
		return err
	}
	type posting struct {
		Variant, Parent, Quantity, Base, Unit string
		BatchID                               *string
	}
	lines := []posting{}
	for rows.Next() {
		var line posting
		if err = rows.Scan(&line.Variant, &line.Parent, &line.Quantity, &line.Base, &line.Unit, &line.BatchID); err != nil {
			rows.Close()
			return err
		}
		lines = append(lines, line)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	items := []inventory.Item{}
	for _, line := range lines {
		var currentUnit string
		err = tx.QueryRow(ctx, "SELECT unit_id::text FROM product_variants WHERE organization_id=$1 AND id=$2", org, line.Variant).Scan(&currentUnit)
		if err != nil {
			return dbError(err)
		}
		if currentUnit != line.Unit {
			return ErrConflict
		}
		if doc.Kind == "RECEIPT" {
			changed, err := tx.Exec(ctx, `UPDATE purchasing_items SET accepted_quantity=accepted_quantity+$4::numeric WHERE organization_id=$1 AND id=$2 AND document_id=$3 AND variant_id=$5 AND accepted_quantity+$4::numeric<=quantity`, org, line.Parent, parent.ID, line.Quantity, line.Variant)
			if err != nil {
				return dbError(err)
			}
			if changed.RowsAffected() != 1 {
				return ErrConflict
			}
		} else {
			var remaining string
			err = tx.QueryRow(ctx, `SELECT (original.quantity-COALESCE((SELECT sum(item.quantity) FROM purchasing_items item JOIN purchasing_documents doc ON doc.organization_id=item.organization_id AND doc.id=item.document_id WHERE item.organization_id=original.organization_id AND item.parent_item_id=original.id AND doc.kind='RETURN' AND doc.status='DISPATCHED'),0))::text FROM purchasing_items original WHERE organization_id=$1 AND document_id=$2 AND id=$3 AND variant_id=$4`, org, parent.ID, line.Parent, line.Variant).Scan(&remaining)
			if err != nil {
				return dbError(err)
			}
			available, _ := decimal(remaining, 3)
			requested, _ := decimal(line.Quantity, 3)
			if requested > available {
				return ErrConflict
			}
		}
		items = append(items, inventory.Item{VariantID: line.Variant, Quantity: line.Base, BatchID: line.BatchID})
	}
	if err = inventory.PostSupply(ctx, tx, actor, user, org, op, doc.ID, doc.Branch, *doc.Location, doc.Kind, items); err != nil {
		return err
	}
	if doc.Kind == "RECEIPT" {
		_, err = tx.Exec(ctx, `UPDATE purchasing_documents SET status=CASE WHEN EXISTS(SELECT 1 FROM purchasing_items WHERE organization_id=$1 AND document_id=$2 AND accepted_quantity<quantity) THEN 'PARTIALLY_RECEIVED' ELSE 'RECEIVED' END,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2`, org, parent.ID)
		if err != nil {
			return dbError(err)
		}
		return event(ctx, tx, user, org, parent.ID, "received", doc.ID)
	}
	return nil
}
