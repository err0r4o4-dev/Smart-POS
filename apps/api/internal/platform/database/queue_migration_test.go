package database

import (
	"os"
	"strings"
	"testing"
)

func TestRestaurantQueueMigrationStaticBoundaries(testContext *testing.T) {
	contents, err := os.ReadFile("../../../../../database/migrations/000027_restaurant_queue_numbers.up.sql")
	if err != nil {
		testContext.Fatal(err)
	}
	migration := string(contents)
	for _, table := range []string{"restaurant_queue_periods", "restaurant_order_queue"} {
		for _, statement := range []string{
			"CREATE TABLE " + table,
			"ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY",
			"ALTER TABLE " + table + " FORCE ROW LEVEL SECURITY",
			"CREATE POLICY restaurant_scope ON " + table,
		} {
			if !strings.Contains(migration, statement) {
				testContext.Errorf("missing static queue migration boundary: %s", statement)
			}
		}
	}
	for _, statement := range []string{
		"UNIQUE (organization_id,branch_id,period_start,queue_number)",
		"REFERENCES online_orders(organization_id,branch_id,id)",
		"REFERENCES restaurant_queue_periods(organization_id,branch_id,period_start)",
		"GRANT UPDATE(last_number) ON restaurant_queue_periods TO smartpos_runtime",
		"CREATE TRIGGER restaurant_queue_period_history BEFORE UPDATE",
		"CREATE TRIGGER restaurant_order_queue_identity BEFORE INSERT",
		"NEW.queue_number=period.last_number",
		"NEW.issued_at<period.period_end",
	} {
		if !strings.Contains(migration, statement) {
			testContext.Errorf("missing queue identity/counter boundary: %s", statement)
		}
	}
	for _, forbidden := range []string{"UPDATE online_orders", "INSERT INTO online_orders", "stock_balances", "stock_movements", "SECURITY DEFINER", "GRANT DELETE", "GRANT UPDATE ON restaurant_order_queue"} {
		if strings.Contains(migration, forbidden) {
			testContext.Errorf("migration must not backfill, rewrite history/stock, or elevate runtime privileges: %s", forbidden)
		}
	}
}
