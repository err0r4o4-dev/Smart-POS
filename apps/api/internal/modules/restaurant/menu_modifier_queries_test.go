package restaurant

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/platform/database"
)

func TestModifierSchemaReadinessIsolated(t *testing.T) {
	dsn, want := os.Getenv("SMARTPOS_MODIFIER_TEST_DSN"), os.Getenv("SMARTPOS_MODIFIER_READINESS")
	if dsn == "" {
		t.Skip("requires the task-owned modifier fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal("configure modifier fixture pool failed")
	}
	defer pool.Close()
	err = (database.Checker{Pool: pool}).Ready(ctx)
	switch want {
	case "ready":
		if err != nil {
			t.Fatalf("clean schema readiness: %v", err)
		}
	case "rejected":
		if err == nil || err.Error() != "schema not ready" {
			t.Fatalf("expected schema version or dirty-state rejection, got %v", err)
		}
	default:
		t.Fatal("missing expected readiness state")
	}
}

func TestReadMenuModifierGroupsIsolated(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MODIFIER_TEST_DSN")
	if dsn == "" {
		t.Skip("requires the task-owned modifier fixture")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		t.Fatal("connect to modifier fixture failed")
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	org, other := os.Getenv("SMARTPOS_MODIFIER_ORG"), os.Getenv("SMARTPOS_MODIFIER_OTHER_ORG")
	variant, empty, foreign := os.Getenv("SMARTPOS_MODIFIER_ITEM"), os.Getenv("SMARTPOS_MODIFIER_EMPTY"), os.Getenv("SMARTPOS_MODIFIER_FOREIGN")
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true)", org); err != nil {
		t.Fatal(err)
	}
	groups, err := readMenuModifierGroups(ctx, tx, org, variant)
	if err != nil || len(groups) != 1 || len(groups[0].options) != 1 {
		t.Fatalf("unexpected scoped projection: %#v, %v", groups, err)
	}
	group, option := groups[0], groups[0].options[0]
	if group.label != "Protein" || option.label != "Tofu" || option.extraPrice != "12.35" {
		t.Fatalf("incorrect labels or price: %#v, %#v", group, option)
	}
	if err = validateMenuModifierSelection(groups, []menuModifierSelection{{groupID: group.id, optionIDs: []string{option.id}}}); err != nil {
		t.Fatal(err)
	}
	if groups, err = readMenuModifierGroups(ctx, tx, org, empty); err != nil || groups == nil || len(groups) != 0 {
		t.Fatalf("registered menu item without modifiers = %#v, %v", groups, err)
	}
	if _, err = readMenuModifierGroups(ctx, tx, org, foreign); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign variant under matching scope = %v", err)
	}
	if _, err = readMenuModifierGroups(ctx, tx, other, foreign); !errors.Is(err, ErrNotFound) {
		t.Fatalf("foreign restaurant under matching scope = %v", err)
	}
}
