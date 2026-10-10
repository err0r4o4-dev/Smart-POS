package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/jackc/pgx/v5"
	"net/url"
	"strconv"
	"time"
)

type Filter struct {
	ShelfOnly                                                                                                        bool
	BranchID, Search, LocationID, VariantID, Status, Type, CategoryID, ProductStatus, Start, End, Actor, StockStatus string
	Page, PageSize                                                                                                   int
}

func filter(values url.Values) (Filter, error) {
	result := Filter{BranchID: values.Get("branch_id"), Search: values.Get("search"), LocationID: values.Get("location_id"), VariantID: values.Get("variant_id"), Status: values.Get("status"), Type: values.Get("type"), CategoryID: values.Get("category_id"), ProductStatus: values.Get("product_status"), Start: values.Get("from"), End: values.Get("to"), Actor: values.Get("actor_id"), StockStatus: values.Get("stock_status"), Page: 1, PageSize: 20}
	var err error
	if value := values.Get("shelf_only"); value != "" {
		result.ShelfOnly, err = strconv.ParseBool(value)
		if err != nil {
			return result, ErrInput
		}
	}
	if values.Get("page") != "" {
		result.Page, err = strconv.Atoi(values.Get("page"))
		if err != nil {
			return result, ErrInput
		}
	}
	if values.Get("page_size") != "" {
		result.PageSize, err = strconv.Atoi(values.Get("page_size"))
		if err != nil {
			return result, ErrInput
		}
	}
	if result.Page < 1 || result.Page > 100000 || result.PageSize < 1 || result.PageSize > 100 || !text(result.Search, 200, false) {
		return result, ErrInput
	}
	for _, id := range []string{result.BranchID, result.LocationID, result.VariantID, result.CategoryID, result.Actor} {
		if id != "" && !uuidPattern.MatchString(id) {
			return result, ErrInput
		}
	}
	for _, date := range []string{result.Start, result.End} {
		if date != "" {
			if _, err = time.Parse(time.RFC3339, date); err != nil {
				return result, ErrInput
			}
		}
	}
	if result.Start != "" && result.End != "" {
		start, _ := time.Parse(time.RFC3339, result.Start)
		end, _ := time.Parse(time.RFC3339, result.End)
		if end.Before(start) {
			return result, ErrInput
		}
	}
	if !text(result.Status, 30, false) || !text(result.Type, 30, false) || !text(result.ProductStatus, 20, false) || !contains([]string{"", "ZERO", "POSITIVE", "LOW"}, result.StockStatus) {
		return result, ErrInput
	}
	return result, nil
}

type Page struct {
	Items    []json.RawMessage `json:"items"`
	Total    int               `json:"total"`
	Page     int               `json:"page"`
	PageSize int               `json:"page_size"`
}

func pageQuery(ctx context.Context, tx pgx.Tx, selection, from, where string, args []any, filter Filter) (Page, error) {
	result := Page{Items: []json.RawMessage{}, Page: filter.Page, PageSize: filter.PageSize}
	if err := tx.QueryRow(ctx, "SELECT count(*) "+from+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	args = append(args, filter.PageSize, (filter.Page-1)*filter.PageSize)
	rows, err := tx.Query(ctx, fmt.Sprintf("SELECT %s %s%s ORDER BY item.created_at DESC,item.id LIMIT $%d OFFSET $%d", selection, from, where, len(args)-1, len(args)), args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		var value []byte
		if err = rows.Scan(&value); err != nil {
			return result, err
		}
		result.Items = append(result.Items, json.RawMessage(value))
	}
	return result, rows.Err()
}

const stockFrom = ` FROM (SELECT balance.*,updated_at AS created_at FROM stock_balances balance) item JOIN stock_locations location ON location.organization_id=item.organization_id AND location.id=item.location_id JOIN branches stock_branch ON stock_branch.organization_id=item.organization_id AND stock_branch.id=item.branch_id JOIN product_variants variant ON variant.organization_id=item.organization_id AND variant.id=item.variant_id JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id JOIN units unit ON unit.organization_id=variant.organization_id AND unit.id=variant.unit_id `
const stockWhere = ` WHERE item.organization_id=$1 AND ($2 OR item.branch_id=ANY($3::uuid[])) AND ($4='' OR item.branch_id=nullif($4,'')::uuid) AND (product.name ILIKE $5 OR variant.sku ILIKE $5 OR EXISTS(SELECT 1 FROM product_barcodes barcode WHERE barcode.organization_id=item.organization_id AND barcode.variant_id=item.variant_id AND barcode.code ILIKE $5)) AND ($6='' OR item.location_id=nullif($6,'')::uuid) AND ($7='' OR item.variant_id=nullif($7,'')::uuid) AND ($8='' OR product.status=$8) AND ($9='' OR location.type=$9) AND ($10='' OR product.category_id=nullif($10,'')::uuid) AND ($11='' OR ($11='ZERO' AND item.quantity=0) OR ($11='POSITIVE' AND item.quantity>0) OR ($11='LOW' AND EXISTS(SELECT 1 FROM inventory_reorder_points threshold WHERE threshold.organization_id=item.organization_id AND threshold.branch_id=item.branch_id AND threshold.variant_id=item.variant_id AND threshold.status='ACTIVE' AND threshold.minimum_quantity>(SELECT COALESCE(sum(balance.quantity),0) FROM stock_balances balance JOIN stock_locations place ON place.organization_id=balance.organization_id AND place.id=balance.location_id WHERE balance.organization_id=item.organization_id AND balance.branch_id=item.branch_id AND balance.variant_id=item.variant_id AND place.status='ACTIVE' AND place.type IN ('WAREHOUSE','SALES_FLOOR','SHELF'))))) `
const stockJSON = `to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text,'reserved','0.000','sku',variant.sku,'product_name',product.name,'variant_name',variant.name,'barcode',(SELECT code FROM product_barcodes WHERE organization_id=item.organization_id AND variant_id=item.variant_id ORDER BY is_primary DESC,created_at LIMIT 1),'unit',unit.code,'location_name',location.name,'location_type',location.type,'available',CASE WHEN stock_branch.status='ACTIVE' AND location.status='ACTIVE' AND location.type IN ('SALES_FLOOR','SHELF') AND variant.status='ACTIVE' AND product.status='ACTIVE' THEN item.quantity::text ELSE '0.000' END,'availability_status',CASE WHEN location.type='IN_TRANSIT' THEN 'IN_TRANSIT' WHEN stock_branch.status<>'ACTIVE' OR location.status<>'ACTIVE' OR variant.status<>'ACTIVE' OR product.status<>'ACTIVE' OR location.type IN ('QUARANTINE','DAMAGED') THEN 'RESTRICTED' WHEN location.type='WAREHOUSE' THEN 'WAREHOUSE' ELSE 'POS_ELIGIBLE' END)`

func (service *Service) List(ctx context.Context, user, org, resource string, filter Filter) (any, error) {
	permission := "inventory.read"
	if resource == "movements" {
		permission = "inventory.audit.read"
	}
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if filter.BranchID != "" {
		if err = scope(ctx, tx, actor, org, filter.BranchID, false); err != nil {
			return nil, err
		}
	}
	owner := actor.Role == "OWNER"
	branches := actor.BranchIDs
	if filter.LocationID != "" {
		if _, err = physical(ctx, tx, actor, org, filter.LocationID, false); err != nil {
			return nil, err
		}
	}
	if resource == "balances" || resource == "overview" {
		args := []any{org, owner, branches, filter.BranchID, "%" + filter.Search + "%", filter.LocationID, filter.VariantID, filter.ProductStatus, filter.Type, filter.CategoryID, filter.StockStatus}
		if resource == "balances" {
			return pageQuery(ctx, tx, stockJSON, stockFrom, stockWhere, args, filter)
		}
		summary, err := raw(ctx, tx, `SELECT jsonb_build_object('recorded_variants',count(DISTINCT item.variant_id),'by_unit',COALESCE((SELECT jsonb_agg(to_jsonb(total)) FROM (SELECT unit.code AS unit,location.type,sum(item.quantity)::text AS quantity `+stockFrom+stockWhere+` GROUP BY unit.id,unit.code,location.type ORDER BY unit.code,location.type) total),'[]'::jsonb)) `+stockFrom+stockWhere, args...)
		if err != nil {
			return nil, err
		}
		operations, err := raw(ctx, tx, `SELECT jsonb_build_object('pending_adjustments',count(*) FILTER(WHERE kind='ADJUSTMENT' AND status IN ('DRAFT','PENDING_APPROVAL','APPROVED')),'open_counts',count(*) FILTER(WHERE kind='COUNT' AND status IN ('IN_PROGRESS','SUBMITTED','APPROVED')),'pending_transfers',count(*) FILTER(WHERE kind='TRANSFER' AND status NOT IN ('RECEIVED','CANCELLED'))) FROM inventory_documents WHERE organization_id=$1 AND ($2 OR branch_id=ANY($3::uuid[]) OR destination_branch_id=ANY($3::uuid[])) AND ($4='' OR branch_id=nullif($4,'')::uuid OR destination_branch_id=nullif($4,'')::uuid)`, org, owner, branches, filter.BranchID)
		if err != nil {
			return nil, err
		}
		alerts, err := raw(ctx, tx, `SELECT jsonb_build_object('active_variants',(SELECT count(*) FROM product_variants variant JOIN products product ON product.organization_id=variant.organization_id AND product.id=variant.product_id WHERE variant.organization_id=$1 AND variant.status='ACTIVE' AND product.status='ACTIVE'),'low_stock_variants',count(DISTINCT threshold.variant_id)) FROM inventory_reorder_points threshold WHERE threshold.organization_id=$1 AND ($2 OR threshold.branch_id=ANY($3::uuid[])) AND ($4='' OR threshold.branch_id=nullif($4,'')::uuid) AND threshold.status='ACTIVE' AND threshold.minimum_quantity>(SELECT COALESCE(sum(balance.quantity),0) FROM stock_balances balance JOIN stock_locations place ON place.organization_id=balance.organization_id AND place.id=balance.location_id WHERE balance.organization_id=threshold.organization_id AND balance.branch_id=threshold.branch_id AND balance.variant_id=threshold.variant_id AND place.status='ACTIVE' AND place.type IN ('WAREHOUSE','SALES_FLOOR','SHELF'))`, org, owner, branches, filter.BranchID)
		if err != nil {
			return nil, err
		}
		recent := json.RawMessage(`[]`)
		if contains(actor.Permissions, "inventory.audit.read") {
			recent, err = raw(ctx, tx, `SELECT COALESCE(jsonb_agg(to_jsonb(recent)), '[]'::jsonb) FROM (SELECT movement.id,variant.sku,movement.location_id,movement.variant_id,movement.movement_type,movement.quantity_delta::text,movement.quantity_before::text,movement.quantity_after::text,movement.created_at FROM stock_movements movement JOIN product_variants variant ON variant.organization_id=movement.organization_id AND variant.id=movement.variant_id WHERE movement.organization_id=$1 AND ($2 OR movement.branch_id=ANY($3::uuid[])) AND ($4='' OR movement.branch_id=nullif($4,'')::uuid) ORDER BY movement.created_at DESC,movement.id LIMIT 10) recent`, org, owner, branches, filter.BranchID)
			if err != nil {
				return nil, err
			}
		}
		return map[string]any{"stock": summary, "operations": operations, "alerts": alerts, "recent_movements": recent, "reservation_policy": "NOT_IMPLEMENTED_ZERO", "quantity_policy": "PER_VARIANT_UNIT"}, nil
	}
	args := []any{org, owner, branches, filter.BranchID, "%" + filter.Search + "%", filter.Status, filter.Type}
	selection := `to_jsonb(item)`
	from := ""
	where := ` WHERE item.organization_id=$1 AND ($2 OR item.branch_id=ANY($3::uuid[])) AND ($4='' OR item.branch_id=nullif($4,'')::uuid) `
	switch resource {
	case "locations":
		from = ` FROM stock_locations item `
		if filter.ShelfOnly {
			where += ` AND EXISTS(SELECT 1 FROM shelves shelf WHERE shelf.organization_id=item.organization_id AND shelf.stock_location_id=item.id) `
		}
		where += ` AND (item.name ILIKE $5 OR item.code ILIKE $5) AND ($6='' OR item.status=$6) AND ($7='' OR item.type=$7)`
	case "adjustments", "counts", "transfers":
		kind := map[string]string{"adjustments": "ADJUSTMENT", "counts": "COUNT", "transfers": "TRANSFER"}[resource]
		args[6] = kind
		from = ` FROM inventory_documents item `
		where = ` WHERE item.organization_id=$1 AND ($2 OR item.branch_id=ANY($3::uuid[]) OR item.destination_branch_id=ANY($3::uuid[])) AND ($4='' OR item.branch_id=nullif($4,'')::uuid OR item.destination_branch_id=nullif($4,'')::uuid) AND item.kind=$7 AND ($6='' OR item.status=$6) AND (item.reason_code ILIKE $5 OR item.id::text ILIKE $5) `
		if filter.ShelfOnly {
			where += ` AND EXISTS(SELECT 1 FROM shelves shelf WHERE shelf.organization_id=item.organization_id AND shelf.stock_location_id=item.location_id) `
		}
		if filter.LocationID != "" {
			args = append(args, filter.LocationID)
			where += ` AND item.location_id=$8::uuid `
		}
		selection += `||jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object('variant_id',variant_id,'quantity',quantity::text,'expected_quantity',expected_quantity::text,'counted_quantity',counted_quantity::text)) FROM inventory_document_items WHERE organization_id=item.organization_id AND document_id=item.id),'[]'::jsonb))`
	case "movements":
		args = []any{org, owner, branches, filter.BranchID, "%" + filter.Search + "%", filter.LocationID, filter.VariantID, filter.Type, filter.Start, filter.End, filter.Actor}
		from = ` FROM stock_movements item JOIN product_variants variant ON variant.organization_id=item.organization_id AND variant.id=item.variant_id `
		where += ` AND (variant.sku ILIKE $5 OR item.id::text ILIKE $5) AND ($6='' OR item.location_id=nullif($6,'')::uuid) AND ($7='' OR item.variant_id=nullif($7,'')::uuid) AND ($8='' OR item.movement_type=$8) AND ($9='' OR item.created_at>=nullif($9,'')::timestamptz) AND ($10='' OR item.created_at<=nullif($10,'')::timestamptz) AND ($11='' OR item.performed_by=nullif($11,'')::uuid)`
		selection += `||jsonb_build_object('sku',variant.sku,'quantity_delta',item.quantity_delta::text,'quantity_before',item.quantity_before::text,'quantity_after',item.quantity_after::text)`
	case "reorder-points":
		from = ` FROM inventory_reorder_points item JOIN product_variants variant ON variant.organization_id=item.organization_id AND variant.id=item.variant_id `
		where += ` AND variant.sku ILIKE $5 AND ($6='' OR item.status=$6) AND ($7='' OR variant.id=nullif($7,'')::uuid)`
		args[6] = filter.VariantID
		current := `(SELECT COALESCE(sum(balance.quantity),0) FROM stock_balances balance JOIN stock_locations place ON place.organization_id=balance.organization_id AND place.id=balance.location_id WHERE balance.organization_id=item.organization_id AND balance.branch_id=item.branch_id AND balance.variant_id=item.variant_id AND place.status='ACTIVE' AND place.type IN ('WAREHOUSE','SALES_FLOOR','SHELF'))`
		selection += `||jsonb_build_object('sku',variant.sku,'minimum_quantity',item.minimum_quantity::text,'target_quantity',item.target_quantity::text,'current_quantity',` + current + `::text,'below_minimum',item.status='ACTIVE' AND ` + current + `<item.minimum_quantity)`
	default:
		return nil, ErrNotFound
	}
	if resource == "reorder-points" {
		from = ` FROM (SELECT threshold.*,updated_at AS created_at FROM inventory_reorder_points threshold) item JOIN product_variants variant ON variant.organization_id=item.organization_id AND variant.id=item.variant_id `
	}
	if resource == "balances" {
		return nil, ErrNotFound
	}
	return pageQuery(ctx, tx, selection, from, where, args, filter)
}
func (service *Service) Get(ctx context.Context, user, org, resource, id string) (json.RawMessage, error) {
	permission := "inventory.read"
	if resource == "movements" {
		permission = "inventory.audit.read"
	}
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) {
		return nil, ErrInput
	}
	if kind := map[string]string{"adjustments": "ADJUSTMENT", "counts": "COUNT", "transfers": "TRANSFER"}[resource]; kind != "" {
		doc, err := document(ctx, tx, org, id, kind)
		if err != nil {
			return nil, err
		}
		if err = documentScope(ctx, tx, actor, org, doc, "read"); err != nil {
			return nil, err
		}
		return documentJSON(ctx, tx, org, id)
	}
	table := map[string]string{"locations": "stock_locations", "balances": "stock_balances", "movements": "stock_movements"}[resource]
	if table == "" {
		return nil, ErrNotFound
	}
	var branch string
	if err = tx.QueryRow(ctx, "SELECT branch_id::text FROM "+table+" WHERE organization_id=$1 AND id=$2", org, id).Scan(&branch); err != nil {
		return nil, databaseError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, false); err != nil {
		return nil, err
	}
	selection := "to_jsonb(item)"
	if resource == "balances" {
		selection += `||jsonb_build_object('quantity',quantity::text)`
	}
	if resource == "movements" {
		selection += `||jsonb_build_object('quantity_delta',quantity_delta::text,'quantity_before',quantity_before::text,'quantity_after',quantity_after::text)`
	}
	return raw(ctx, tx, "SELECT "+selection+" FROM "+table+" item WHERE organization_id=$1 AND id=$2", org, id)
}
