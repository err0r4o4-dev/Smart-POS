package database

import (
	"os"
	"strconv"
	"strings"
	"testing"
)

func TestRequiredVersionMatchesLatestMigration(t *testing.T) {
	entries, err := os.ReadDir("../../../../../database/migrations")
	if err != nil {
		t.Fatal(err)
	}
	latest := 0
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		prefix, _, found := strings.Cut(entry.Name(), "_")
		if !found {
			t.Fatalf("invalid migration filename: %s", entry.Name())
		}
		version, err := strconv.Atoi(prefix)
		if err != nil {
			t.Fatal(err)
		}
		if version > latest {
			latest = version
		}
	}
	if latest == 0 || RequiredVersion != latest {
		t.Fatalf("readiness requires schema %d but latest migration is %d", RequiredVersion, latest)
	}
}
