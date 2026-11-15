package storefront

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type sourceRow struct {
	values []any
	err    error
}

func (row sourceRow) Scan(destinations ...any) error {
	if row.err != nil {
		return row.err
	}
	if len(destinations) != len(row.values) {
		return errors.New("unexpected source scan")
	}
	for index, value := range row.values {
		reflect.ValueOf(destinations[index]).Elem().Set(reflect.ValueOf(value))
	}
	return nil
}

type sourceTx struct {
	pgx.Tx
	test      *testing.T
	rows      []sourceRow
	queries   []string
	arguments [][]any
}

func (tx *sourceTx) QueryRow(_ context.Context, query string, arguments ...any) pgx.Row {
	tx.test.Helper()
	tx.queries = append(tx.queries, query)
	tx.arguments = append(tx.arguments, arguments)
	if len(tx.rows) == 0 {
		tx.test.Fatal("unexpected source query")
	}
	row := tx.rows[0]
	tx.rows = tx.rows[1:]
	return row
}

func TestMenuSaleSourceRequiresOnlyActiveScopedBranch(test *testing.T) {
	for _, active := range []bool{true, false} {
		test.Run(map[bool]string{true: "active", false: "inactive"}[active], func(test *testing.T) {
			tx := &sourceTx{test: test, rows: []sourceRow{{values: []any{active}}}}
			err := menuSaleSource(context.Background(), tx, "organization", Settings{BranchID: "branch"})
			if active && err != nil || !active && !errors.Is(err, ErrClosed) {
				test.Fatalf("source active=%v: %v", active, err)
			}
			if len(tx.queries) != 1 || !reflect.DeepEqual(tx.arguments[0], []any{"organization", "branch"}) {
				test.Fatal("menu source must be scoped to organization and branch")
			}
			query := tx.queries[0]
			for _, forbidden := range []string{"pos_terminals", "stock_locations", "register_shifts", "inventory_"} {
				if strings.Contains(query, forbidden) {
					test.Fatalf("menu source depends on %s", forbidden)
				}
			}
			for _, required := range []string{"branches", "organizations", "branch.organization_id=$1", "branch.id=$2", "branch.status='ACTIVE'", "organization.status='ACTIVE'"} {
				if !strings.Contains(query, required) {
					test.Fatalf("missing active scope predicate: %s", required)
				}
			}
		})
	}
}

func TestMenuSaleSourcePropagatesDatabaseFailure(test *testing.T) {
	failure := errors.New("source unavailable")
	tx := &sourceTx{test: test, rows: []sourceRow{{err: failure}}}
	if err := menuSaleSource(context.Background(), tx, "organization", Settings{BranchID: "branch"}); !errors.Is(err, failure) {
		test.Fatalf("database failure hidden: %v", err)
	}
}

func TestOrderSaleSourceUsesStoredPolicy(test *testing.T) {
	for _, policy := range []string{"MENU_ONLY", "TRACKED", "UNKNOWN"} {
		test.Run(policy, func(test *testing.T) {
			rows := []sourceRow{{values: []any{policy}}}
			if policy == "MENU_ONLY" {
				rows = append(rows, sourceRow{values: []any{true}})
			}
			if policy == "TRACKED" {
				rows = append(rows, sourceRow{values: []any{"location"}}, sourceRow{values: []any{true}})
			}
			tx := &sourceTx{test: test, rows: rows}
			shop, err := orderSaleSource(context.Background(), tx, "organization", "order", Settings{BranchID: "branch", TerminalID: "terminal"})
			if policy == "UNKNOWN" {
				if !errors.Is(err, ErrConflict) || len(tx.queries) != 1 {
					test.Fatalf("unknown policy accepted: %v", err)
				}
				return
			}
			if err != nil || len(tx.rows) != 0 {
				test.Fatalf("stored policy %s: %v", policy, err)
			}
			if !reflect.DeepEqual(tx.arguments[0], []any{"organization", "order", "branch"}) {
				test.Fatal("order source must match organization/order/branch")
			}
			if policy == "MENU_ONLY" {
				if shop.LocationID != "" {
					test.Fatal("menu source must not acquire a stock location")
				}
				for _, query := range tx.queries {
					if strings.Contains(query, "stock_location") || strings.Contains(query, "pos_terminals") {
						test.Fatal("menu order still reads legacy source")
					}
				}
			} else if shop.LocationID != "location" || !strings.Contains(tx.queries[2], "pos_terminals") || !strings.Contains(tx.queries[2], "stock_locations") {
				test.Fatal("historical tracked source validation was removed")
			}
		})
	}
}

func TestOrderSaleSourceFailsClosedForMissingOrForeignOrder(test *testing.T) {
	tx := &sourceTx{test: test, rows: []sourceRow{{err: pgx.ErrNoRows}}}
	if _, err := orderSaleSource(context.Background(), tx, "organization", "order", Settings{BranchID: "branch"}); !errors.Is(err, ErrNotFound) || len(tx.queries) != 1 {
		test.Fatalf("missing order must not fall through to menu-only: %v", err)
	}
}
