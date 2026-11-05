package database

import (
	"os"
	"strings"
	"testing"
)

func TestIngredientMigrationStaticIntegrity(test *testing.T) {
	contents, err := os.ReadFile("../../../../../database/migrations/000028_online_ingredient_reservations.up.sql")
	if err != nil {
		test.Fatal(err)
	}
	migration := string(contents)
	for _, required := range []string{
		"NEW.operation_id IS DISTINCT FROM sale.inventory_operation_id",
		"movement.operation_id<>NEW.inventory_operation_id",
		"storefront_reserved_quantity_for_order",
		"snapshot.stock_variant_id=requested_variant",
		"insufficient stock for reservation",
		"LOCK TABLE online_orders,online_order_items,online_payment_attempts",
		"drain or reconcile live online orders",
		"ALTER TABLE online_order_stock_items FORCE ROW LEVEL SECURITY",
	} {
		if !strings.Contains(migration, required) {
			test.Errorf("missing static integrity boundary: %s", required)
		}
	}
	for _, forbidden := range []string{
		"doc.id<>excluded_cart",
		"FROM public.online_orders doc CROSS JOIN LATERAL public.storefront_order_stock_requirements",
		"AND movement.operation_id=NEW.inventory_operation_id AND movement.movement_type='SALE'",
		"UPDATE online_orders",
	} {
		if strings.Contains(migration, forbidden) {
			test.Errorf("ambiguous exclusion, unfiltered expansion, hidden movement or backfill: %s", forbidden)
		}
	}
}

func TestIngredientMovementGuardFiltersRequirementBeforeAggregation(test *testing.T) {
	contents, err := os.ReadFile("../../../../../database/migrations/000028_online_ingredient_reservations.up.sql")
	if err != nil {
		test.Fatal(err)
	}
	migration := string(contents)
	start := strings.Index(migration, "CREATE OR REPLACE FUNCTION inventory_reservation_guard()")
	end := strings.Index(migration, "CREATE OR REPLACE FUNCTION pos_sale_consistency()")
	if start < 0 || end <= start {
		test.Fatal("missing inventory/sale guard boundaries")
	}
	guard := migration[start:end]
	if !strings.Contains(guard, "storefront_order_stock_quantity(doc.organization_id,doc.id,NEW.variant_id)") || strings.Contains(guard, "storefront_order_stock_requirements(") {
		test.Fatal("each movement must aggregate only its own order/stock variant, not expand the entire recipe")
	}
}
