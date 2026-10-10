package purchasing

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"net/url"
	"smartpos/api/internal/modules/inventory"
	"strconv"
)

type Filter struct {
	Branch, Supplier, Parent, Status, Search string
	Page, Size                               int
}

func filter(values url.Values) (Filter, error) {
	input := Filter{Branch: values.Get("branch_id"), Supplier: values.Get("supplier_id"), Parent: values.Get("parent_id"), Status: values.Get("status"), Search: values.Get("search"), Page: 1, Size: 20}
	var err error
	for key, target := range map[string]*int{"page": &input.Page, "page_size": &input.Size} {
		if values.Get(key) != "" {
			*target, err = strconv.Atoi(values.Get(key))
			if err != nil {
				return input, ErrInput
			}
		}
	}
	if input.Page < 1 || input.Page > 100000 || input.Size < 1 || input.Size > 100 || !text(input.Search, 200, false) || !text(input.Status, 80, false) {
		return input, ErrInput
	}
	for _, id := range []string{input.Branch, input.Supplier, input.Parent} {
		if id != "" && !uuidPattern.MatchString(id) {
			return input, ErrInput
		}
	}
	return input, nil
}

type Page struct {
	Items    []json.RawMessage `json:"items"`
	Total    int               `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

func pageQuery(ctx context.Context, tx pgx.Tx, selectJSON, from, where, order string, input Filter, args ...any) (Page, error) {
	result := Page{Items: []json.RawMessage{}, Page: input.Page, PageSize: input.Size}
	err := tx.QueryRow(ctx, "SELECT count(*) "+from+" WHERE "+where, args...).Scan(&result.Total)
	if err != nil {
		return result, dbError(err)
	}
	limit := len(args) + 1
	args = append(args, input.Size, (input.Page-1)*input.Size)
	rows, err := tx.Query(ctx, fmt.Sprintf("SELECT %s %s WHERE %s ORDER BY %s LIMIT $%d OFFSET $%d", selectJSON, from, where, order, limit, limit+1), args...)
	if err != nil {
		return result, dbError(err)
	}
	defer rows.Close()
	for rows.Next() {
		var item []byte
		if err = rows.Scan(&item); err != nil {
			return result, err
		}
		result.Items = append(result.Items, item)
	}
	return result, dbError(rows.Err())
}
func (service *Service) List(ctx context.Context, user, org, resource string, input Filter) (Page, error) {
	permission := "purchasing.read"
	if resource == "suppliers" {
		permission = "supplier.read"
	}
	if resource == "shelves" || resource == "tasks" || resource == "replenishment-suggestions" {
		permission = "shelf.read"
	}
	if resource == "suggestions" {
		permission = "purchasing.suggestion.read"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return Page{}, err
	}
	defer tx.Rollback(ctx)
	branches := actor.BranchIDs
	if actor.Role == "OWNER" {
		branches = nil
	}
	if input.Branch != "" {
		if err = inventory.BranchScope(ctx, tx, actor, org, input.Branch, false); err != nil {
			return Page{}, err
		}
	}
	branchWhere := ` AND ($2::uuid IS NULL OR row.branch_id=$2) AND ($3::uuid[] IS NULL OR row.branch_id=ANY($3))`
	if resource == "suppliers" {
		return pageQuery(ctx, tx, "to_jsonb(row)", "FROM suppliers row", `row.organization_id=$1 AND ($2='' OR row.status=$2) AND ($3='' OR row.code ILIKE '%'||$3||'%' OR row.name ILIKE '%'||$3||'%')`, "row.name,row.id", input, org, input.Status, input.Search)
	}
	if contains([]string{"orders", "receipts", "returns", "discrepancies"}, resource) {
		kind := map[string]string{"orders": "ORDER", "receipts": "RECEIPT", "returns": "RETURN", "discrepancies": "RECEIPT"}[resource]
		where := `row.organization_id=$1` + branchWhere + ` AND row.kind=$4 AND ($5='' OR row.status=$5) AND ($6::uuid IS NULL OR row.supplier_id=$6) AND ($7::uuid IS NULL OR row.parent_id=$7) AND ($8='' OR row.number ILIKE '%'||$8||'%' OR row.supplier_snapshot->>'name' ILIKE '%'||$8||'%')`
		if resource == "discrepancies" {
			where += ` AND EXISTS(SELECT 1 FROM purchasing_items item WHERE item.organization_id=row.organization_id AND item.document_id=row.id AND item.reason<>'')`
		}
		return pageQuery(ctx, tx, `to_jsonb(row)||jsonb_build_object('total',row.total::text)`, "FROM purchasing_documents row", where, "row.created_at DESC,row.id", input, org, nullable(input.Branch), branches, kind, input.Status, nullable(input.Supplier), nullable(input.Parent), input.Search)
	}
	if resource == "shelves" {
		return pageQuery(ctx, tx, `to_jsonb(row)||jsonb_build_object('assignment_count',(SELECT count(*) FROM shelf_assignments assignment WHERE assignment.organization_id=row.organization_id AND assignment.shelf_id=row.id AND assignment.status='ACTIVE'),'low_stock_count',(SELECT count(*) FROM shelf_assignments assignment LEFT JOIN stock_balances balance ON balance.organization_id=assignment.organization_id AND balance.location_id=row.stock_location_id AND balance.variant_id=assignment.variant_id WHERE assignment.organization_id=row.organization_id AND assignment.shelf_id=row.id AND assignment.status='ACTIVE' AND COALESCE(balance.quantity,0)<assignment.minimum_quantity))`, "FROM shelves row", `row.organization_id=$1`+branchWhere+` AND ($4='' OR row.status=$4) AND ($5='' OR row.code ILIKE '%'||$5||'%' OR row.name ILIKE '%'||$5||'%' OR row.zone ILIKE '%'||$5||'%')`, "row.zone,row.code,row.id", input, org, nullable(input.Branch), branches, input.Status, input.Search)
	}
	if resource == "tasks" {
		return pageQuery(ctx, tx, `to_jsonb(row)||jsonb_build_object('quantity',row.quantity::text,'shelf_name',shelf.name,'variant_id',assignment.variant_id,'sku',variant.sku,'source_name',location.name)`, "FROM replenishment_tasks row JOIN shelves shelf ON shelf.organization_id=row.organization_id AND shelf.id=row.shelf_id JOIN shelf_assignments assignment ON assignment.organization_id=row.organization_id AND assignment.id=row.assignment_id JOIN product_variants variant ON variant.organization_id=row.organization_id AND variant.id=assignment.variant_id JOIN stock_locations location ON location.organization_id=row.organization_id AND location.id=row.source_location_id", `row.organization_id=$1`+branchWhere+` AND ($4='' OR row.status=$4) AND ($5='' OR variant.sku ILIKE '%'||$5||'%' OR shelf.name ILIKE '%'||$5||'%')`, "row.created_at DESC,row.id", input, org, nullable(input.Branch), branches, input.Status, input.Search)
	}
	if resource == "suggestions" {
		return purchaseSuggestions(ctx, tx, org, branches, input)
	}
	if resource == "replenishment-suggestions" {
		return replenishmentSuggestions(ctx, tx, org, branches, input)
	}
	return Page{}, ErrNotFound
}
func (service *Service) Get(ctx context.Context, user, org, resource, id string) (json.RawMessage, error) {
	permission := "purchasing.read"
	if resource == "suppliers" || resource == "products" {
		permission = "supplier.read"
	}
	if resource == "shelves" || resource == "tasks" {
		permission = "shelf.read"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) {
		return nil, ErrInput
	}
	if resource == "suppliers" {
		return raw(ctx, tx, "SELECT to_jsonb(row) FROM suppliers row WHERE organization_id=$1 AND id=$2", org, id)
	}
	if resource == "products" {
		var exists bool
		err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM suppliers WHERE organization_id=$1 AND id=$2)", org, id).Scan(&exists)
		if err != nil {
			return nil, err
		}
		if !exists {
			return nil, ErrNotFound
		}
		return raw(ctx, tx, `SELECT COALESCE(jsonb_agg(to_jsonb(row)||jsonb_build_object('unit_cost',unit_cost::text,'minimum_order_quantity',minimum_order_quantity::text,'order_multiple',order_multiple::text,'sku',variant.sku,'name',product.name) ORDER BY variant.sku),'[]'::jsonb) FROM (SELECT * FROM supplier_products WHERE organization_id=$1 AND supplier_id=$2 ORDER BY id LIMIT 100) row JOIN product_variants variant ON variant.organization_id=row.organization_id AND variant.id=row.variant_id JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id`, org, id)
	}
	if resource == "shelves" {
		if _, err = readShelf(ctx, tx, actor, org, id, false); err != nil {
			return nil, err
		}
		return shelfJSON(ctx, tx, org, id)
	}
	if resource == "tasks" {
		var branch string
		err = tx.QueryRow(ctx, "SELECT branch_id::text FROM replenishment_tasks WHERE organization_id=$1 AND id=$2", org, id).Scan(&branch)
		if err != nil {
			return nil, dbError(err)
		}
		if err = inventory.BranchScope(ctx, tx, actor, org, branch, false); err != nil {
			return nil, err
		}
		return taskJSON(ctx, tx, org, id)
	}
	kind := map[string]string{"orders": "ORDER", "receipts": "RECEIPT", "returns": "RETURN", "discrepancies": "RECEIPT"}[resource]
	if kind == "" {
		return nil, ErrNotFound
	}
	doc, err := readDocument(ctx, tx, org, id, kind)
	if err != nil {
		return nil, err
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, doc.Branch, false); err != nil {
		return nil, err
	}
	return documentJSON(ctx, tx, org, id)
}
func purchaseSuggestions(ctx context.Context, tx pgx.Tx, org string, branches []string, input Filter) (Page, error) {
	from := `FROM inventory_reorder_points row JOIN product_variants variant ON variant.organization_id=row.organization_id AND variant.id=row.variant_id AND variant.status='ACTIVE' JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id AND product.status='ACTIVE' JOIN branches branch ON branch.organization_id=row.organization_id AND branch.id=row.branch_id AND branch.status='ACTIVE'
 LEFT JOIN LATERAL(SELECT COALESCE(sum(balance.quantity),0) amount FROM stock_balances balance JOIN stock_locations location ON location.organization_id=balance.organization_id AND location.id=balance.location_id WHERE balance.organization_id=row.organization_id AND balance.branch_id=row.branch_id AND balance.variant_id=row.variant_id AND location.status='ACTIVE' AND location.type IN ('WAREHOUSE','SHELF','SALES_FLOOR')) stock ON true
 LEFT JOIN LATERAL(SELECT COALESCE(sum(item.base_quantity-item.accepted_quantity*item.conversion_factor),0) amount FROM purchasing_items item JOIN purchasing_documents doc ON doc.organization_id=item.organization_id AND doc.id=item.document_id WHERE doc.organization_id=row.organization_id AND doc.branch_id=row.branch_id AND doc.kind='ORDER' AND doc.status IN ('APPROVED','ORDERED','PARTIALLY_RECEIVED') AND item.variant_id=row.variant_id) incoming ON true
 JOIN LATERAL(SELECT link.*,supplier.name supplier_name,unit.name unit_name,CASE WHEN unit.id=variant.unit_id THEN 1 ELSE unit.conversion_factor END factor FROM supplier_products link JOIN suppliers supplier ON supplier.organization_id=link.organization_id AND supplier.id=link.supplier_id AND supplier.status='ACTIVE' JOIN units unit ON unit.organization_id=link.organization_id AND unit.id=link.purchase_unit_id AND unit.status='ACTIVE' WHERE link.organization_id=row.organization_id AND link.variant_id=row.variant_id AND link.status='ACTIVE' AND (unit.id=variant.unit_id OR unit.base_unit_id=variant.unit_id) ORDER BY link.is_preferred DESC,link.unit_cost,link.lead_time_days,link.id LIMIT 1) supplier ON true`
	where := `row.organization_id=$1 AND ($2::uuid IS NULL OR row.branch_id=$2) AND ($3::uuid[] IS NULL OR row.branch_id=ANY($3)) AND row.status='ACTIVE' AND stock.amount<row.minimum_quantity AND row.target_quantity>stock.amount+incoming.amount AND ($4='' OR variant.sku ILIKE '%'||$4||'%' OR product.name ILIKE '%'||$4||'%')`
	selectJSON := `jsonb_build_object('id',row.id,'branch_id',row.branch_id,'variant_id',row.variant_id,'sku',variant.sku,'name',product.name,'current_quantity',stock.amount::text,'minimum_quantity',row.minimum_quantity::text,'target_quantity',row.target_quantity::text,'incoming_quantity',incoming.amount::numeric(18,3)::text,'supplier_id',supplier.supplier_id,'supplier_name',supplier.supplier_name,'purchase_unit_id',supplier.purchase_unit_id,'purchase_unit',supplier.unit_name,'conversion_factor',supplier.factor::text,'unit_cost',supplier.unit_cost::text,'lead_time_days',supplier.lead_time_days,'suggested_quantity',(greatest(ceil((row.target_quantity-stock.amount-incoming.amount)/(supplier.factor*supplier.order_multiple)),ceil(supplier.minimum_order_quantity/supplier.order_multiple))*supplier.order_multiple)::text,'explanation','Target minus active sellable branch stock minus approved/issued outstanding; rounded up to MOQ/order multiple. No stock reservation or automatic approval.')`
	return pageQuery(ctx, tx, selectJSON, from, where, "variant.sku,row.id", input, org, nullable(input.Branch), branches, input.Search)
}
func replenishmentSuggestions(ctx context.Context, tx pgx.Tx, org string, branches []string, input Filter) (Page, error) {
	from := `FROM shelves row JOIN shelf_assignments assignment ON assignment.organization_id=row.organization_id AND assignment.shelf_id=row.id AND assignment.status='ACTIVE' JOIN product_variants variant ON variant.organization_id=assignment.organization_id AND variant.id=assignment.variant_id AND variant.status='ACTIVE' JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id AND product.status='ACTIVE' JOIN branches branch ON branch.organization_id=row.organization_id AND branch.id=row.branch_id AND branch.status='ACTIVE' JOIN stock_locations destination ON destination.organization_id=row.organization_id AND destination.id=row.stock_location_id AND destination.status='ACTIVE'
 LEFT JOIN stock_balances balance ON balance.organization_id=row.organization_id AND balance.location_id=row.stock_location_id AND balance.variant_id=assignment.variant_id
 JOIN LATERAL(SELECT source.id,source.name,greatest(0,warehouse.quantity-COALESCE((SELECT sum(task.quantity) FROM replenishment_tasks task JOIN shelf_assignments other ON other.organization_id=task.organization_id AND other.id=task.assignment_id WHERE task.organization_id=row.organization_id AND task.source_location_id=source.id AND other.variant_id=assignment.variant_id AND task.status IN ('OPEN','ASSIGNED','IN_PROGRESS')),0)) available FROM stock_locations source JOIN stock_balances warehouse ON warehouse.organization_id=source.organization_id AND warehouse.location_id=source.id AND warehouse.variant_id=assignment.variant_id WHERE source.organization_id=row.organization_id AND source.branch_id=row.branch_id AND source.type='WAREHOUSE' AND source.status='ACTIVE' AND NOT source.is_system ORDER BY warehouse.quantity DESC,source.id LIMIT 1) warehouse ON true`
	where := `row.organization_id=$1 AND ($2::uuid IS NULL OR row.branch_id=$2) AND ($3::uuid[] IS NULL OR row.branch_id=ANY($3)) AND row.status='ACTIVE' AND COALESCE(balance.quantity,0)<assignment.minimum_quantity AND warehouse.available>0 AND NOT EXISTS(SELECT 1 FROM replenishment_tasks task WHERE task.organization_id=row.organization_id AND task.assignment_id=assignment.id AND task.status IN ('OPEN','ASSIGNED','IN_PROGRESS')) AND ($4='' OR variant.sku ILIKE '%'||$4||'%' OR row.name ILIKE '%'||$4||'%')`
	selectJSON := `jsonb_build_object('id',assignment.id,'assignment_id',assignment.id,'shelf_id',row.id,'shelf_name',row.name,'branch_id',row.branch_id,'variant_id',assignment.variant_id,'sku',variant.sku,'recorded_quantity',COALESCE(balance.quantity,0)::text,'minimum_quantity',assignment.minimum_quantity::text,'target_quantity',assignment.target_quantity::text,'capacity_quantity',assignment.capacity_quantity::text,'source_location_id',warehouse.id,'source_name',warehouse.name,'available_quantity',warehouse.available::text,'suggested_quantity',least(assignment.target_quantity-COALESCE(balance.quantity,0),warehouse.available)::text,'explanation','Target minus recorded shelf quantity; capped by eligible same-branch warehouse stock minus planned tasks. Tasks do not reserve stock.')`
	return pageQuery(ctx, tx, selectJSON, from, where, "row.code,variant.sku,assignment.id", input, org, nullable(input.Branch), branches, input.Search)
}
