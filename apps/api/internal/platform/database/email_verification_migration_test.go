package database

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEmailVerificationQuotaMigrationIsAdditiveAndReversible(t *testing.T) {
	root := filepath.Join("../../../../../database/migrations")
	up, err := os.ReadFile(filepath.Join(root, "000031_email_verification_quotas.up.sql"))
	if err != nil {
		t.Fatal(err)
	}
	down, err := os.ReadFile(filepath.Join(root, "000031_email_verification_quotas.down.sql"))
	if err != nil {
		t.Fatal(err)
	}
	for _, scope := range []string{"EMAIL_VERIFY", "EMAIL_RESEND"} {
		if !strings.Contains(string(up), "'"+scope+"'") || !strings.Contains(string(down), "'"+scope+"'") {
			t.Fatalf("migration does not cover scope %s in both directions", scope)
		}
	}
	if !strings.Contains(string(down), "cannot roll back email verification rate-limit scopes") {
		t.Fatal("down migration lacks usage guard")
	}
}
