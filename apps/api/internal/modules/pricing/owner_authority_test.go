package pricing

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type approverQueryProbe struct {
	pgx.Tx
	query string
	args  []any
	row   pgx.Row
}

func (probe *approverQueryProbe) QueryRow(_ context.Context, sql string, args ...any) pgx.Row {
	probe.query, probe.args = sql, args
	return probe.row
}

type approverRow struct {
	allowed bool
	err     error
}

func (row approverRow) Scan(dest ...any) error {
	if row.err != nil {
		return row.err
	}
	*dest[0].(*bool) = row.allowed
	return nil
}

func TestCurrentApproverRequiresActiveOwnerQuery(test *testing.T) {
	probe := &approverQueryProbe{row: approverRow{allowed: true}}
	if err := CurrentApprover(context.Background(), probe, "org", "approval"); err != nil {
		test.Fatal(err)
	}
	for _, condition := range []string{"approval.organization_id=$1", "approval.id=$2", "member.organization_id=approval.organization_id", "member.user_id=approval.approved_by", "member.role='OWNER'", "member.status='ACTIVE'", "account.status='ACTIVE'", "branch.status='ACTIVE'"} {
		if !strings.Contains(probe.query, condition) {
			test.Errorf("query missing %s", condition)
		}
	}
	if strings.Contains(probe.query, "'MANAGER'") {
		test.Error("query permits manager approval")
	}
	if len(probe.args) != 2 || probe.args[0] != "org" || probe.args[1] != "approval" {
		test.Errorf("wrong query arguments: %v", probe.args)
	}
	probe.row = approverRow{allowed: false}
	if err := CurrentApprover(context.Background(), probe, "org", "approval"); err == nil {
		test.Error("unauthorized approval accepted")
	}
	problem := errors.New("database unavailable")
	probe.row = approverRow{err: problem}
	if err := CurrentApprover(context.Background(), probe, "org", "approval"); !errors.Is(err, problem) {
		test.Errorf("database error lost: %v", err)
	}
}
