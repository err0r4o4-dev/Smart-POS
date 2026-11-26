package database

import (
	"os"
	"strings"
	"testing"
)

func readSetupMigration(t *testing.T, name string) string {
	t.Helper()
	contents, err := os.ReadFile("../../../../../database/migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(contents)
}

func TestFirstTimeRestaurantSetupMigrationStaticIntegrity(t *testing.T) {
	migration := readSetupMigration(t, "000030_first_time_restaurant_setup.up.sql")

	for _, table := range []string{
		"email_verification_tokens",
		"restaurant_setup_progress",
		"restaurant_setup_steps",
		"restaurant_service_modes",
		"restaurant_zones",
		"restaurant_table_zones",
		"restaurant_payment_settings",
		"restaurant_charge_settings",
		"restaurant_trials",
	} {
		if !strings.Contains(migration, "CREATE TABLE "+table) {
			t.Errorf("missing setup table: %s", table)
		}
	}

	for _, boundary := range []string{
		"token_hash bytea NOT NULL UNIQUE",
		"CHECK (octet_length(token_hash)=32)",
		"expires_at timestamptz NOT NULL",
		"used_at timestamptz",
		"CHECK (expires_at>created_at)",
		"WHERE used_at IS NULL",
		"UNIQUE (organization_id,branch_id,code)",
		"PRIMARY KEY (organization_id,branch_id,table_id)",
		"numeric(5,2)",
		"ALTER TABLE %I ENABLE ROW LEVEL SECURITY",
		"ALTER TABLE %I FORCE ROW LEVEL SECURITY",
		"CREATE POLICY restaurant_scope ON %I",
		"FOREACH table_name IN ARRAY ARRAY['restaurant_setup_progress','restaurant_setup_steps','restaurant_service_modes','restaurant_zones','restaurant_table_zones','restaurant_payment_settings','restaurant_charge_settings','restaurant_trials']",
	} {
		if !strings.Contains(migration, boundary) {
			t.Errorf("missing setup integrity boundary: %s", boundary)
		}
	}

	if !strings.Contains(migration, "CREATE POLICY restaurant_scope ON %I") {
		t.Error("missing tenant policy creation")
	}

	for _, forbidden := range []string{
		"token text",
		"verification_token text",
		"secret text",
		"api_key text",
		"private_key text",
		"password text",
		"card_number",
		"cvv",
		"UPDATE organizations",
		"UPDATE branches",
		"INSERT INTO",
	} {
		if strings.Contains(strings.ToLower(migration), strings.ToLower(forbidden)) {
			t.Errorf("migration must not contain plaintext secrets or data rewrite: %s", forbidden)
		}
	}
}

func TestFirstTimeRestaurantSetupMigrationIsReversible(t *testing.T) {
	down := readSetupMigration(t, "000030_first_time_restaurant_setup.down.sql")

	for _, table := range []string{
		"restaurant_trials",
		"restaurant_charge_settings",
		"restaurant_payment_settings",
		"restaurant_table_zones",
		"restaurant_zones",
		"restaurant_service_modes",
		"restaurant_setup_steps",
		"restaurant_setup_progress",
		"email_verification_tokens",
	} {
		if !strings.Contains(down, "DROP TABLE "+table) {
			t.Errorf("down migration does not remove %s", table)
		}
	}
	if !strings.Contains(down, "DROP CONSTRAINT restaurant_tables_branch_identity") {
		t.Error("down migration does not remove the additive table branch identity constraint")
	}
}
