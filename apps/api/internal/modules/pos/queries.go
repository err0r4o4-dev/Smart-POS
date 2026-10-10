package pos

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"net/url"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/organization"
	"strconv"
	"time"
)

type Filter struct {
	BranchID, TerminalID, CashierID, Status, Search, Method, From, To, Barcode, CategoryID string
	Page, PageSize                                                                         int
}

func filter(values url.Values) (Filter, error) {
	result := Filter{BranchID: values.Get("branch_id"), TerminalID: values.Get("terminal_id"), CashierID: values.Get("cashier_id"), Status: values.Get("status"), Search: values.Get("search"), Method: values.Get("method"), From: values.Get("from"), To: values.Get("to"), Barcode: values.Get("barcode"), CategoryID: values.Get("category_id"), Page: 1, PageSize: 25}
	for _, value := range []string{result.BranchID, result.TerminalID, result.CashierID, result.CategoryID} {
		if value != "" && !uuidPattern.MatchString(value) {
			return result, ErrInput
		}
	}
	for _, value := range []string{result.From, result.To} {
		if value != "" {
			if _, err := time.Parse(time.RFC3339, value); err != nil {
				return result, ErrInput
			}
		}
	}
	if !text(result.Search, 200, false) || !text(result.Barcode, 80, false) || !text(result.Status, 40, false) || !text(result.Method, 40, false) {
		return result, ErrInput
	}
	var err error
	if value := values.Get("page"); value != "" {
		result.Page, err = strconv.Atoi(value)
		if err != nil {
			return result, ErrInput
		}
	}
	if value := values.Get("page_size"); value != "" {
		result.PageSize, err = strconv.Atoi(value)
		if err != nil {
			return result, ErrInput
		}
	}
	if result.Page < 1 || result.Page > 100000 || result.PageSize < 1 || result.PageSize > 100 {
		return result, ErrInput
	}
	return result, nil
}

type Page struct {
	Items    any `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}

func jsonPage(ctx context.Context, tx pgx.Tx, selectSQL, fromSQL, where string, args []any, filters Filter) (Page, error) {
	result := Page{Items: []json.RawMessage{}, Page: filters.Page, PageSize: filters.PageSize}
	if err := tx.QueryRow(ctx, "SELECT count(*)"+fromSQL+where, args...).Scan(&result.Total); err != nil {
		return result, err
	}
	args = append(args, filters.PageSize, (filters.Page-1)*filters.PageSize)
	rows, err := tx.Query(ctx, "SELECT "+selectSQL+fromSQL+where+" ORDER BY item.created_at DESC,item.id LIMIT $"+strconv.Itoa(len(args)-1)+" OFFSET $"+strconv.Itoa(len(args)), args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	items := []json.RawMessage{}
	for rows.Next() {
		var data []byte
		if err = rows.Scan(&data); err != nil {
			return result, err
		}
		items = append(items, json.RawMessage(data))
	}
	result.Items = items
	return result, rows.Err()
}

func (service *Service) List(ctx context.Context, user, org, resource string, filters Filter) (Page, error) {
	permission := "pos.access"
	switch resource {
	case "carts":
		permission = "pos.cart.manage"
	case "shifts":
		permission = "pos.register.history.read"
	case "sales":
		permission = "sales.read"
	case "receipts":
		permission = "receipts.read"
	case "checkouts":
		permission = "pos.checkout"
	}
	tx, actor, err := service.begin(ctx, user, org, permission)
	if err != nil {
		return Page{}, err
	}
	defer tx.Rollback(ctx)
	if filters.BranchID != "" {
		if err = scope(ctx, tx, actor, org, filters.BranchID, false); err != nil {
			return Page{}, err
		}
	}
	result := Page{Items: []json.RawMessage{}, Page: filters.Page, PageSize: filters.PageSize}
	if resource == "products" {
		value, err := terminal(ctx, tx, actor, org, filters.TerminalID, true)
		if err != nil {
			return result, err
		}
		ids, total, err := catalog.SearchSaleVariants(ctx, tx, org, filters.Search, filters.Barcode, filters.CategoryID, filters.PageSize, (filters.Page-1)*filters.PageSize)
		if err != nil {
			return result, err
		}
		items := []CartItem{}
		for _, id := range ids {
			item, err := variant(ctx, tx, org, value.StockLocationID, id, "1", "")
			if err != nil {
				return result, err
			}
			items = append(items, item)
		}
		result.Items = items
		result.Total = total
		return result, nil
	}
	base := ` WHERE item.organization_id=$1 AND ($2='' OR item.branch_id=nullif($2,'')::uuid) AND ($3 OR item.branch_id=ANY($4::uuid[]))`
	args := []any{org, filters.BranchID, actor.Role == "OWNER", actor.BranchIDs}
	switch resource {
	case "terminals":
		return jsonPage(ctx, tx, "to_jsonb(item)", " FROM pos_terminals item", base+" AND ($5='' OR item.status=$5)", append(args, filters.Status), filters)
	case "carts":
		return jsonPage(ctx, tx, "to_jsonb(item)-'create_key'", " FROM pos_carts item", base+" AND item.cashier_id=$5 AND ($6='' OR item.status=$6) AND ($7='' OR item.terminal_id=nullif($7,'')::uuid)", append(args, user, filters.Status, filters.TerminalID), filters)
	case "shifts":
		from := ` FROM (SELECT shift.*,shift.opened_at AS created_at FROM register_shifts shift) item JOIN pos_terminals terminal ON terminal.organization_id=item.organization_id AND terminal.id=item.terminal_id JOIN users cashier ON cashier.id=item.cashier_id`
		selectSQL := `to_jsonb(item)-ARRAY['open_key','close_key']||jsonb_build_object('opening_cash',item.opening_cash::text,'cash_sales',item.cash_sales::text,'cash_refunds',item.cash_refunds::text,'expected_cash',item.expected_cash::text,'counted_cash',item.counted_cash::text,'difference',item.difference::text,'terminal_name',terminal.name,'cashier_name',cashier.display_name)`
		return jsonPage(ctx, tx, selectSQL, from, base+" AND ($5 OR item.cashier_id=$6) AND ($7='' OR item.status=$7) AND ($8='' OR item.terminal_id=nullif($8,'')::uuid)", append(args, actor.Role != "CASHIER", user, filters.Status, filters.TerminalID), filters)
	case "checkouts":
		selectSQL := `to_jsonb(item)-ARRAY['items','fingerprint','idempotency_key','confirmation_key']||jsonb_build_object('total',item.total::text,'received',item.received::text,'change',item.change::text,'sale_id',COALESCE((SELECT id::text FROM sales WHERE organization_id=item.organization_id AND checkout_id=item.id),''))`
		return jsonPage(ctx, tx, selectSQL, " FROM pos_checkouts item", base+" AND ($5 OR item.cashier_id=$6) AND ($7='' OR item.status=$7) AND ($8='' OR item.terminal_id=nullif($8,'')::uuid)", append(args, actor.Role != "CASHIER", user, filters.Status, filters.TerminalID), filters)
	case "sales", "receipts":
		from := ` FROM (SELECT sale.*,sale.completed_at AS created_at FROM sales sale) item JOIN sale_payments payment ON payment.organization_id=item.organization_id AND payment.sale_id=item.id JOIN receipts receipt ON receipt.organization_id=item.organization_id AND receipt.sale_id=item.id`
		selectSQL := `to_jsonb(item)||jsonb_build_object('grand_total',item.grand_total::text,'subtotal',item.subtotal::text,'discount_total',item.discount_total::text,'tax_total',item.tax_total::text,'method',payment.method,'receipt_id',receipt.id,'receipt_number',receipt.receipt_number)`
		where := base + ` AND ($5 OR item.cashier_id=$6) AND ($7='' OR item.status=$7) AND ($8='' OR item.terminal_id=nullif($8,'')::uuid) AND ($9='' OR item.cashier_id=nullif($9,'')::uuid) AND ($10='' OR payment.method=$10) AND ($11='' OR item.sale_number ILIKE '%'||$11||'%' OR receipt.receipt_number ILIKE '%'||$11||'%') AND ($12='' OR item.completed_at>=nullif($12,'')::timestamptz) AND ($13='' OR item.completed_at<=nullif($13,'')::timestamptz)`
		return jsonPage(ctx, tx, selectSQL, from, where, append(args, actor.Role != "CASHIER", user, filters.Status, filters.TerminalID, filters.CashierID, filters.Method, filters.Search, filters.From, filters.To), filters)
	}
	return result, ErrInput
}

func (service *Service) Shift(ctx context.Context, user, org, id string) (json.RawMessage, error) {
	tx, actor, err := service.begin(ctx, user, org, "pos.register.history.read")
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if !uuidPattern.MatchString(id) {
		return nil, ErrInput
	}
	var branch, cashier string
	if err = tx.QueryRow(ctx, "SELECT branch_id::text,cashier_id::text FROM register_shifts WHERE organization_id=$1 AND id=$2", org, id).Scan(&branch, &cashier); err != nil {
		return nil, dbError(err)
	}
	if err = scope(ctx, tx, actor, org, branch, false); err != nil {
		return nil, err
	}
	if actor.Role == "CASHIER" && cashier != user {
		return nil, organization.ErrDenied
	}
	return shiftResult(ctx, tx, org, id)
}
