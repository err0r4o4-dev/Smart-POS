package purchasing

import (
	"os"
	"strings"
	"testing"
)

func TestAssignmentRequiresActiveOwnerAndSupportsRecovery(test *testing.T) {
	source, err := os.ReadFile("shelves.go")
	if err != nil {
		test.Fatal(err)
	}
	sql := string(source)
	start := strings.Index(sql, "SELECT EXISTS(SELECT 1 FROM organization_memberships member JOIN users account")
	if start < 0 {
		test.Fatal("assignment eligibility query missing")
	}
	end := strings.Index(sql[start:], "`, org, input.AssignedTo")
	if end < 0 {
		test.Fatal("assignment eligibility query boundary missing")
	}
	query := sql[start : start+end]
	for _, condition := range []string{"member.organization_id=$1", "member.user_id=$2", "member.role='OWNER'", "member.status='ACTIVE'", "account.status='ACTIVE'", "account.id=member.user_id"} {
		if !strings.Contains(query, condition) {
			test.Errorf("assignment query missing %s", condition)
		}
	}
	if strings.Contains(query, "'MANAGER'") || strings.Contains(query, "'INVENTORY_STAFF'") {
		test.Error("assignment permits retired staff roles")
	}
	for _, tc := range []struct {
		status, action, want string
		fails                bool
	}{
		{"OPEN", "assign", "ASSIGNED", false},
		{"ASSIGNED", "assign", "ASSIGNED", false},
		{"IN_PROGRESS", "assign", "IN_PROGRESS", false},
		{"IN_PROGRESS", "complete", "COMPLETED", false},
		{"COMPLETED", "assign", "", true},
		{"CANCELLED", "assign", "", true},
	} {
		got, err := taskTransition(tc.status, tc.action)
		if (err != nil) != tc.fails || got != tc.want {
			test.Errorf("%s/%s: got %q, %v", tc.status, tc.action, got, err)
		}
	}
}
