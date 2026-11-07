package database

import (
	"os"
	"regexp"
	"strings"
	"testing"
)

func TestStorefrontDirectoryMigrationPreservesPublicBoundaries(t *testing.T) {
	root := "../../../../../database/migrations/"
	original, err := os.ReadFile(root + "000014_storefront.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	definition := regexp.MustCompile(`(?s)CREATE (?:OR REPLACE )?FUNCTION storefront_directory\(\) RETURNS jsonb.*?\$\$;`)
	previous := definition.FindString(string(original))
	if previous == "" {
		t.Fatal("original directory definition missing")
	}
	compact := func(sql string) string { return strings.Join(strings.Fields(sql), " ") }
	for _, direction := range []string{"up", "down"} {
		t.Run(direction, func(t *testing.T) {
			contents, problem := os.ReadFile(root + "000033_storefront_business_types." + direction + ".sql")
			if problem != nil {
				t.Fatal(problem)
			}
			sql := string(contents)
			current := definition.FindString(sql)
			if direction == "up" {
				if !strings.Contains(current, "'business_type',business_type") || !strings.Contains(current, "org.business_type") {
					t.Fatal("public shop type metadata missing")
				}
				current = strings.ReplaceAll(current, ",'business_type',business_type", "")
				current = strings.ReplaceAll(current, ",org.business_type", "")
			}
			current = strings.Replace(current, "CREATE OR REPLACE FUNCTION", "CREATE FUNCTION", 1)
			if compact(current) != compact(previous) {
				t.Fatal("directory visibility, public projection, limit, sorting or security settings changed")
			}
			for _, required := range []string{
				"BEGIN;", "COMMIT;", "SET LOCAL lock_timeout = '5s';", "SET LOCAL statement_timeout = '30s';",
				"REVOKE ALL ON FUNCTION storefront_directory() FROM PUBLIC;",
				"GRANT EXECUTE ON FUNCTION storefront_directory() TO smartpos_runtime;",
			} {
				if !strings.Contains(sql, required) {
					t.Errorf("missing migration boundary: %s", required)
				}
			}
		})
	}
}
