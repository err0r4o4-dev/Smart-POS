package returns

import (
	"context"
	"encoding/json"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

func adjustmentHeader(ctx context.Context, tx pgx.Tx, actor organization.Member, user, org, kind, id string) (adjustment, error) {
	var doc adjustment
	var items []byte
	if !uuidPattern.MatchString(id) {
		return doc, ErrInput
	}
	err := tx.QueryRow(ctx, "SELECT id::text,kind,branch_id::text,original_sale_id::text,linked_return_id::text,status,created_by::text,return_credit::text,replacement_total::text,net_difference::text,COALESCE(terminal_id::text,''),COALESCE(method,''),reference,settlement_note,COALESCE(reported_by::text,''),shift_id::text,revision,replacement_items FROM sale_adjustments WHERE organization_id=$1 AND id=$2 AND kind=$3 FOR UPDATE", org, id, kind).Scan(&doc.ID, &doc.Kind, &doc.Branch, &doc.Sale, &doc.ReturnID, &doc.Status, &doc.Creator, &doc.Credit, &doc.Total, &doc.Difference, &doc.Terminal, &doc.Method, &doc.Reference, &doc.Note, &doc.Reporter, &doc.Shift, &doc.Revision, &items)
	if err != nil {
		return doc, dbError(err)
	}
	if actor.Role == "CASHIER" && doc.Creator != user {
		return doc, organization.ErrDenied
	}
	if err = inventory.BranchScope(ctx, tx, actor, org, doc.Branch, false); err != nil {
		return doc, dbError(err)
	}
	doc.Items, err = snapshots(items)
	return doc, err
}
func adjustmentResult(ctx context.Context, tx pgx.Tx, org, id string) (json.RawMessage, error) {
	value, err := raw(ctx, tx, `SELECT to_jsonb(doc)||jsonb_build_object('return_credit',doc.return_credit::text,'replacement_total',doc.replacement_total::text,'net_difference',doc.net_difference::text,'store_name',sale.store_name,'branch_name',sale.branch_name,'original_sale_number',sale.sale_number,'cashier_name',actor.display_name,'events',COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at,event.id) FROM (SELECT * FROM adjustment_settlement_events WHERE organization_id=$1 AND adjustment_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100) event),'[]'::jsonb),'audit',COALESCE((SELECT jsonb_agg(to_jsonb(event) ORDER BY event.created_at) FROM (SELECT event_type,actor_id,created_at FROM organization_audit_events WHERE organization_id=$1 AND object_id=$2 ORDER BY created_at DESC LIMIT 100) event),'[]'::jsonb)) FROM sale_adjustments doc JOIN sales sale ON sale.organization_id=doc.organization_id AND sale.id=doc.original_sale_id JOIN users actor ON actor.id=doc.created_by WHERE doc.organization_id=$1 AND doc.id=$2`, org, id)
	if err != nil {
		return nil, err
	}
	var object map[string]any
	if err = json.Unmarshal(value, &object); err != nil {
		return nil, err
	}
	returnID, _ := object["linked_return_id"].(string)
	linked, err := result(ctx, tx, org, returnID)
	if err != nil {
		return nil, err
	}
	object["return_document"] = linked
	return json.Marshal(object)
}
func (service *Service) GetAdjustment(ctx context.Context, user, org, kind, id string) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permissionFor(kind, "read"))
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	if _, err = adjustmentHeader(ctx, tx, actor, user, org, kind, id); err != nil {
		return nil, err
	}
	return adjustmentResult(ctx, tx, org, id)
}
func (service *Service) ListAdjustments(ctx context.Context, user, org, kind string, input Filter) (json.RawMessage, error) {
	tx, actor, err := service.Organization.Authorized(ctx, user, org, permissionFor(kind, "read"))
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
	return raw(ctx, tx, `WITH matched AS (SELECT to_jsonb(doc)||jsonb_build_object('return_credit',doc.return_credit::text,'replacement_total',doc.replacement_total::text,'net_difference',doc.net_difference::text) AS value,doc.created_at,doc.id FROM sale_adjustments doc WHERE doc.organization_id=$1 AND kind=$2 AND ($3::uuid IS NULL OR branch_id=$3) AND ($4::uuid[] IS NULL OR branch_id=ANY($4)) AND ($5::uuid IS NULL OR original_sale_id=$5) AND ($6='' OR status=$6) AND ($7='' OR strpos(lower(number),lower($7))>0) AND (NOT $8 OR created_by=$9)) SELECT jsonb_build_object('items',COALESCE((SELECT jsonb_agg(value ORDER BY created_at DESC,id) FROM (SELECT * FROM matched ORDER BY created_at DESC,id LIMIT $10 OFFSET $11) page),'[]'::jsonb),'total',(SELECT count(*) FROM matched),'page',$12::integer,'page_size',$10::integer)`, org, kind, nullable(input.Branch), branches, nullable(input.Sale), input.Status, input.Search, actor.Role == "CASHIER", user, input.PageSize, (input.Page-1)*input.PageSize, input.Page)
}
