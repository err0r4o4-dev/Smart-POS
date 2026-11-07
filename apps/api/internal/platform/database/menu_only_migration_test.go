package database

import (
	"os"
	"strings"
	"testing"
)

func TestMenuOnlyMigrationStaticBoundaries(t *testing.T) {
	contents, err := os.ReadFile("../../../../../database/migrations/000032_menu_only_stock_policy.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	sql := string(contents)
	for _, required := range []string{
		"ALTER TABLE online_orders ADD COLUMN stock_policy text NOT NULL DEFAULT 'TRACKED'",
		"ALTER TABLE pos_carts ADD COLUMN stock_policy text NOT NULL DEFAULT 'TRACKED'",
		"ALTER TABLE sales ADD COLUMN stock_policy text NOT NULL DEFAULT 'TRACKED'",
		"NEW.stock_policy IS DISTINCT FROM OLD.stock_policy",
		"IF doc.stock_policy='MENU_ONLY' THEN RETURN NEW; END IF;",
		"doc.stock_policy='TRACKED'",
		"COALESCE((SELECT doc.stock_policy FROM online_orders doc",
		"NEW.stock_policy='TRACKED'",
		"movement.movement_type='SALE'",
		"NEW.stock_policy='MENU_ONLY' AND EXISTS(SELECT 1 FROM stock_movements",
		"NEW.disposition<>'NO_STOCK_RETURN'",
		"sale.stock_policy='MENU_ONLY'",
		"CREATE TRIGGER menu_only_return_movement",
		"payment.amount+payment.credit_amount=NEW.grand_total",
		"checkout.adjustment_id IS NOT NULL",
		"NOT EXISTS(SELECT 1 FROM inventory_operations",
	} {
		if !strings.Contains(sql, required) {
			t.Errorf("missing stock policy boundary: %s", required)
		}
	}
	for _, forbidden := range []string{"UPDATE online_orders SET", "UPDATE pos_carts SET", "UPDATE sales SET", "DROP TABLE", "DELETE FROM"} {
		if strings.Contains(sql, forbidden) {
			t.Errorf("unexpected historical mutation: %s", forbidden)
		}
	}
}

func TestMenuOnlyMigrationRequiresForwardRecovery(t *testing.T) {
	if _, err := os.Stat("../../../../../database/migrations/000032_menu_only_stock_policy.down.sql"); !os.IsNotExist(err) {
		t.Fatalf("migration 32 must not offer a down migration after menu-only writes: %v", err)
	}
	if RequiredVersion != 32 {
		t.Fatalf("schema readiness must require version 32, got %d", RequiredVersion)
	}
}
