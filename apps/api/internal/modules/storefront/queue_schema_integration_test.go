package storefront_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
)

func restaurantQueueSchemaAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg string) {
	test.Helper()
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	service := &storefront.Service{Organization: organizations}
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	order, err := service.CreateOrder(ctx, shop.Slug, "9d222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic schema buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("8", 64)})
	if err != nil {
		test.Fatal(err)
	}
	otherBranch, err := organizations.SaveBranch(ctx, owner, org, "", organization.BranchInput{Name: "Schema branch", Code: "SCHEMA", Status: "ACTIVE"})
	if err != nil {
		test.Fatal(err)
	}
	begin := func(test *testing.T, scope string) pgx.Tx {
		test.Helper()
		tx, problem := organizations.Pool.Begin(ctx)
		if problem != nil {
			test.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, `SELECT set_config('app.organization_id',$1,true)`, scope); problem != nil {
			tx.Rollback(ctx)
			test.Fatal(problem)
		}
		return tx
	}
	assertState := func(test *testing.T) {
		test.Helper()
		tx := begin(test, org)
		defer tx.Rollback(ctx)
		var last int64
		var tickets int
		if problem := tx.QueryRow(ctx, `SELECT last_number,(SELECT count(*) FROM restaurant_order_queue WHERE organization_id=$1 AND branch_id=$2) FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, org, shop.BranchID).Scan(&last, &tickets); problem != nil || last != 1 || tickets != 1 {
			test.Fatalf("queue state after failed transaction: counter=%d tickets=%d error=%v", last, tickets, problem)
		}
	}
	test.Run("runtime role and tenant visibility", func(test *testing.T) {
		tx := begin(test, org)
		defer tx.Rollback(ctx)
		var role string
		var bypass, superuser, canInsertPeriods, canInsertTickets bool
		var periods, tickets int
		problem := tx.QueryRow(ctx, `SELECT current_user,rolbypassrls,rolsuper,has_table_privilege(current_user,'restaurant_queue_periods','INSERT'),has_table_privilege(current_user,'restaurant_order_queue','INSERT') FROM pg_roles WHERE rolname=current_user`).Scan(&role, &bypass, &superuser, &canInsertPeriods, &canInsertTickets)
		if problem != nil || role != "smartpos_runtime" || bypass || superuser || !canInsertPeriods || !canInsertTickets {
			test.Fatalf("runtime role or insert privileges: role=%s bypass=%t superuser=%t period_insert=%t ticket_insert=%t error=%v", role, bypass, superuser, canInsertPeriods, canInsertTickets, problem)
		}
		if problem = tx.QueryRow(ctx, `SELECT (SELECT count(*) FROM restaurant_queue_periods),(SELECT count(*) FROM restaurant_order_queue)`).Scan(&periods, &tickets); problem != nil || periods != 1 || tickets != 1 {
			test.Fatalf("own tenant visibility: periods=%d tickets=%d error=%v", periods, tickets, problem)
		}
		for _, scope := range []string{foreignOrg, ""} {
			foreignTx := begin(test, scope)
			problem = foreignTx.QueryRow(ctx, `SELECT (SELECT count(*) FROM restaurant_queue_periods WHERE organization_id=$1),(SELECT count(*) FROM restaurant_order_queue WHERE organization_id=$1)`, org).Scan(&periods, &tickets)
			foreignTx.Rollback(ctx)
			if problem != nil || periods != 0 || tickets != 0 {
				test.Fatalf("scope %q exposed queue rows: periods=%d tickets=%d error=%v", scope, periods, tickets, problem)
			}
		}
	})
	test.Run("period WITH CHECK rejects foreign and missing context", func(test *testing.T) {
		for _, scope := range []string{foreignOrg, ""} {
			tx := begin(test, scope)
			_, problem := tx.Exec(ctx, `INSERT INTO restaurant_queue_periods(organization_id,branch_id,period_start,period_end,last_number) VALUES($1,$2,'2000-01-01 UTC','2000-01-02 UTC',1)`, org, shop.BranchID)
			var databaseError *pgconn.PgError
			if !errors.As(problem, &databaseError) || databaseError.Code != "42501" || !strings.Contains(databaseError.Message, "row-level security") {
				tx.Rollback(ctx)
				test.Fatalf("scope %q expected RLS WITH CHECK rejection, got %v", scope, problem)
			}
			tx.Rollback(ctx)
		}
	})
	test.Run("ticket policy and guard reject foreign and missing context", func(test *testing.T) {
		tx := begin(test, org)
		var policyCount int
		problem := tx.QueryRow(ctx, `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='restaurant_order_queue' AND policyname='restaurant_scope' AND qual IS NOT NULL AND with_check IS NOT NULL AND qual=with_check AND with_check LIKE '%app.organization_id%'`).Scan(&policyCount)
		tx.Rollback(ctx)
		if problem != nil || policyCount != 1 {
			test.Fatalf("ticket tenant policy missing: count=%d error=%v", policyCount, problem)
		}
		for _, scope := range []string{foreignOrg, ""} {
			foreignTx := begin(test, scope)
			_, problem = foreignTx.Exec(ctx, `INSERT INTO restaurant_order_queue(organization_id,branch_id,order_id,period_start,queue_number,issued_at) VALUES($1,$2,$3,'2000-01-01 UTC',1,'2000-01-01 UTC')`, org, shop.BranchID, order.ID)
			var databaseError *pgconn.PgError
			if !errors.As(problem, &databaseError) || databaseError.Code != "23514" || !strings.Contains(databaseError.Message, "queue ticket must match") {
				foreignTx.Rollback(ctx)
				test.Fatalf("scope %q expected pre-policy ticket guard rejection, got %v", scope, problem)
			}
			foreignTx.Rollback(ctx)
		}
	})
	test.Run("composite constraints and ticket guards preserve state", func(test *testing.T) {
		cases := []struct {
			name, code, constraint, statement string
			advance                           bool
		}{
			{"period branch organization FK", "23503", "restaurant_queue_periods_organization_id_branch_id_fkey", `INSERT INTO restaurant_queue_periods(organization_id,branch_id,period_start,period_end,last_number) VALUES($1,$2,'2000-01-01 UTC','2000-01-02 UTC',1)`, false},
			{"order branch composite FK", "23503", "restaurant_order_queue_organization_id_branch_id_order_id_fkey", `INSERT INTO restaurant_order_queue SELECT $1,$2,$3,period_start,1,period_start FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, false},
			{"period number unique", "23505", "", `INSERT INTO restaurant_order_queue SELECT $1,$2,$3,period_start,last_number,period_start FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, false},
			{"counter mismatch", "23514", "", `INSERT INTO restaurant_order_queue SELECT $1,$2,$3,period_start,last_number+1,period_start FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, true},
			{"issued at period end", "23514", "", `INSERT INTO restaurant_order_queue SELECT $1,$2,$3,period_start,last_number,period_end FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, true},
			{"issued before period", "23514", "restaurant_order_queue_check", `INSERT INTO restaurant_order_queue SELECT $1,$2,$3,period_start,last_number,period_start-interval '1 microsecond' FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, true},
		}
		for _, scenario := range cases {
			test.Run(scenario.name, func(test *testing.T) {
				scope := org
				if scenario.name == "period branch organization FK" {
					scope = foreignOrg
				}
				tx := begin(test, scope)
				defer tx.Rollback(ctx)
				if scope == org {
					if _, problem := tx.Exec(ctx, `INSERT INTO restaurant_queue_periods(organization_id,branch_id,period_start,period_end,last_number) VALUES($1,$2,'2000-01-01 UTC','2000-01-02 UTC',1)`, org, otherBranch.ID); problem != nil {
						test.Fatal(problem)
					}
					if scenario.advance {
						if _, problem := tx.Exec(ctx, `UPDATE restaurant_queue_periods SET last_number=last_number+1 WHERE organization_id=$1 AND branch_id=$2`, org, shop.BranchID); problem != nil {
							test.Fatal(problem)
						}
					}
				}
				orderID := order.ID
				if scope == org {
					if problem := tx.QueryRow(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint) SELECT gen_random_uuid(),organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint FROM online_orders WHERE organization_id=$1 AND id=$2 RETURNING id::text`, org, order.ID).Scan(&orderID); problem != nil {
						test.Fatal(problem)
					}
				}
				arguments := []any{org, shop.BranchID, orderID}
				if scenario.name == "period branch organization FK" {
					arguments = []any{foreignOrg, shop.BranchID}
				} else if scenario.name == "order branch composite FK" {
					arguments[1] = otherBranch.ID
				}
				_, problem := tx.Exec(ctx, scenario.statement, arguments...)
				var databaseError *pgconn.PgError
				if !errors.As(problem, &databaseError) || databaseError.Code != scenario.code || (scenario.constraint != "" && databaseError.ConstraintName != scenario.constraint) {
					test.Fatalf("expected SQLSTATE %s constraint %s, got %v", scenario.code, scenario.constraint, problem)
				}
				if scenario.name == "period number unique" && (!strings.HasSuffix(databaseError.ConstraintName, "_key") || strings.HasSuffix(databaseError.ConstraintName, "_pkey")) {
					test.Fatalf("expected period number unique constraint, got %s", databaseError.ConstraintName)
				}
				if (scenario.name == "counter mismatch" || scenario.name == "issued at period end") && !strings.Contains(databaseError.Message, "queue ticket must match") {
					test.Fatalf("expected ticket guard rejection, got %v", problem)
				}
				if problem = tx.Rollback(ctx); problem != nil {
					test.Fatal(problem)
				}
				assertState(test)
			})
		}
	})
}
