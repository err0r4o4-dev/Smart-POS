package returns

import (
	"context"
	"encoding/json"
	"net/url"
	"smartpos/api/internal/modules/inventory"
	"strconv"
)

type Filter struct {
	Branch, Sale, Status, Search string
	Page, PageSize               int
}

func filter(values url.Values) (Filter, error) {
	value := Filter{Branch: values.Get("branch_id"), Sale: values.Get("sale_id"), Status: values.Get("status"), Search: values.Get("search"), Page: 1, PageSize: 25}
	for _, id := range []string{value.Branch, value.Sale} {
		if id != "" && !uuidPattern.MatchString(id) {
			return value, ErrInput
		}
	}
	if !validText(value.Status, 40, false) || !validText(value.Search, 100, false) {
		return value, ErrInput
	}
	var err error
	if text := values.Get("page"); text != "" {
		value.Page, err = strconv.Atoi(text)
		if err != nil {
			return value, ErrInput
		}
	}
	if text := values.Get("page_size"); text != "" {
		value.PageSize, err = strconv.Atoi(text)
		if err != nil {
			return value, ErrInput
		}
	}
	if value.Page < 1 || value.Page > 100000 || value.PageSize < 1 || value.PageSize > 100 {
		return value, ErrInput
	}
	return value, nil
}
func nullable(value string) any {
	if value == "" {
		return nil
	}
	return value
}
func (service *Service) List(ctx context.Context, user, org, kind string, input Filter) (json.RawMessage, error) {
	permission := "returns.read"
	if kind == "refunds" {
		permission = "refunds.read"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if input.Branch != "" {
		if err = inventory.BranchScope(ctx, tx, actor, org, input.Branch, false); err != nil {
			return nil, dbError(err)
		}
	}
	branches := actor.BranchIDs
	if actor.Role == "OWNER" {
		branches = nil
	}
	query := `WITH matched AS (SELECT to_jsonb(doc)||jsonb_build_object('amount',doc.amount::text) AS value,doc.created_at,doc.id FROM customer_returns doc WHERE doc.organization_id=$1 AND ($2::uuid IS NULL OR doc.branch_id=$2) AND ($3::uuid[] IS NULL OR doc.branch_id=ANY($3)) AND ($4::uuid IS NULL OR doc.original_sale_id=$4) AND ($5='' OR doc.status=$5) AND ($6='' OR strpos(lower(doc.number),lower($6))>0) AND ($7::boolean=false OR doc.created_by=$8)) SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(value ORDER BY created_at DESC,id) FROM (SELECT * FROM matched ORDER BY created_at DESC,id LIMIT $9 OFFSET $10) page),'[]'::jsonb),'total',(SELECT count(*) FROM matched),'page',$11::integer,'page_size',$9::integer)`
	if kind == "refunds" {
		query = `WITH matched AS (SELECT to_jsonb(refund)||jsonb_build_object('amount',refund.amount::text,'return_number',doc.number) AS value,refund.created_at,refund.id FROM customer_refunds refund JOIN customer_returns doc ON doc.organization_id=refund.organization_id AND doc.id=refund.return_id WHERE refund.organization_id=$1 AND ($2::uuid IS NULL OR refund.branch_id=$2) AND ($3::uuid[] IS NULL OR refund.branch_id=ANY($3)) AND ($4::uuid IS NULL OR doc.original_sale_id=$4) AND ($5='' OR refund.status=$5) AND ($6='' OR strpos(lower(doc.number),lower($6))>0) AND ($7::boolean=false OR doc.created_by=$8)) SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(value ORDER BY created_at DESC,id) FROM (SELECT * FROM matched ORDER BY created_at DESC,id LIMIT $9 OFFSET $10) page),'[]'::jsonb),'total',(SELECT count(*) FROM matched),'page',$11::integer,'page_size',$9::integer)`
	}
	return raw(ctx, tx, query, org, nullable(input.Branch), branches, nullable(input.Sale), input.Status, input.Search, actor.Role == "CASHIER", user, input.PageSize, (input.Page-1)*input.PageSize, input.Page)
}
func (service *Service) Get(ctx context.Context, user, org, kind, id string) (json.RawMessage, error) {
	permission := "returns.read"
	if kind == "refunds" {
		permission = "refunds.read"
	}
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if kind == "sale" {
		if _, err = saleScope(ctx, tx, actor, user, org, id); err != nil {
			return nil, err
		}
		return raw(ctx, tx, `SELECT jsonb_build_object('id',sale.id,'sale_number',sale.sale_number,'branch_id',sale.branch_id,'grand_total',sale.grand_total::text,'items',COALESCE((SELECT jsonb_agg(to_jsonb(item)||jsonb_build_object('quantity',item.quantity::text,'unit_price',item.unit_price::text,'line_total',item.line_total::text,'returned_quantity',COALESCE(prior.quantity,0)::text,'returnable_quantity',(item.quantity-COALESCE(prior.quantity,0))::text,'refunded_amount',COALESCE(prior.amount,0)::text) ORDER BY item.id) FROM sale_items item LEFT JOIN LATERAL (SELECT sum(line.quantity) quantity,sum(line.refund_amount) amount FROM customer_return_items line JOIN customer_returns doc ON doc.organization_id=line.organization_id AND doc.id=line.return_id WHERE line.organization_id=item.organization_id AND line.original_sale_item_id=item.id AND doc.status='COMPLETED') prior ON true WHERE item.organization_id=sale.organization_id AND item.sale_id=sale.id),'[]'::jsonb)) FROM sales sale WHERE sale.organization_id=$1 AND sale.id=$2`, org, id)
	}
	if kind == "refunds" {
		if _, err = refundHeader(ctx, tx, actor, user, org, id); err != nil {
			return nil, err
		}
		return refundResult(ctx, tx, org, id)
	}
	doc, err := header(ctx, tx, actor, org, id)
	if err != nil {
		return nil, err
	}
	if actor.Role == "CASHIER" && doc.Creator != user {
		return nil, ErrNotFound
	}
	return result(ctx, tx, org, id)
}
