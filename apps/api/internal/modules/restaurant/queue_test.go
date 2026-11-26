package restaurant

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const queueTestOrg = "11111111-1111-4111-8111-111111111111"
const queueTestBranch = "22222222-2222-4222-8222-222222222222"
const queueTestOrder = "33333333-3333-4333-8333-333333333333"

type queueTestRow struct {
	values []any
	err    error
}

func (row queueTestRow) Scan(destinations ...any) error {
	if row.err != nil {
		return row.err
	}
	if len(destinations) != len(row.values) {
		return errors.New("unexpected queue scan shape")
	}
	for index, value := range row.values {
		reflect.ValueOf(destinations[index]).Elem().Set(reflect.ValueOf(value))
	}
	return nil
}

type queueTestTx struct {
	pgx.Tx
	test       *testing.T
	rows       []queueTestRow
	queries    []string
	queryArgs  [][]any
	executions []string
	execArgs   [][]any
	execError  error
	execFailAt int
}

func (tx *queueTestTx) QueryRow(_ context.Context, query string, args ...any) pgx.Row {
	tx.test.Helper()
	tx.queries = append(tx.queries, query)
	tx.queryArgs = append(tx.queryArgs, args)
	if len(tx.rows) == 0 {
		tx.test.Fatal("unexpected queue query")
	}
	row := tx.rows[0]
	tx.rows = tx.rows[1:]
	return row
}

func (tx *queueTestTx) Exec(_ context.Context, query string, args ...any) (pgconn.CommandTag, error) {
	tx.executions = append(tx.executions, query)
	tx.execArgs = append(tx.execArgs, args)
	if tx.execFailAt == 0 || tx.execFailAt == len(tx.executions) {
		return pgconn.NewCommandTag("INSERT 0 1"), tx.execError
	}
	return pgconn.NewCommandTag("INSERT 0 1"), nil
}

func TestAssignQueueNumberReplaysWithoutAdvancingCounter(testContext *testing.T) {
	tx := &queueTestTx{test: testContext, rows: []queueTestRow{{values: []any{int64(17)}}}}
	actual, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder)
	if err != nil || actual != "017" || len(tx.rows) != 0 || len(tx.executions) != 1 {
		testContext.Fatalf("replay must reuse ticket without writes: %q, %v", actual, err)
	}
	if !strings.Contains(tx.executions[0], "pg_advisory_xact_lock") || !reflect.DeepEqual(tx.execArgs[0], []any{queueTestOrg, queueTestBranch}) {
		testContext.Fatal("allocation must serialize by organization and branch before checking replay")
	}
	if !reflect.DeepEqual(tx.queryArgs[0], []any{queueTestOrg, queueTestBranch, queueTestOrder}) {
		testContext.Fatal("replay must match the same organization, branch, and order")
	}
}

func TestAssignQueueNumberPersistsInCallerTransaction(testContext *testing.T) {
	now := queueTime(testContext, "2026-11-04T12:00:00+07:00")
	tx := &queueTestTx{test: testContext, rows: []queueTestRow{
		{err: pgx.ErrNoRows},
		{values: []any{now}},
		{err: pgx.ErrNoRows},
		{err: pgx.ErrNoRows},
		{values: []any{int64(1000)}},
	}}
	actual, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder)
	if err != nil || actual != "1000" || len(tx.rows) != 0 || len(tx.executions) != 2 {
		testContext.Fatalf("unexpected allocation: %q, %v", actual, err)
	}
	if !strings.Contains(tx.queries[1], "clock_timestamp()") || !reflect.DeepEqual(tx.queryArgs[1], []any{queueTestOrg, queueTestBranch, queueTestOrder}) {
		testContext.Fatal("allocation clock must be read after the lock and verify the parent order scope")
	}
	if !strings.Contains(tx.executions[1], "INSERT INTO restaurant_order_queue") {
		testContext.Fatal("queue ticket must be durable in the supplied transaction")
	}
	if !reflect.DeepEqual(tx.execArgs[1][:3], []any{queueTestOrg, queueTestBranch, queueTestOrder}) {
		testContext.Fatal("ticket must retain organization, branch, and order")
	}
	if tx.execArgs[1][4] != int64(1000) || !tx.execArgs[1][5].(time.Time).Equal(now) {
		testContext.Fatal("ticket must save the allocated number and issuance time")
	}
}

func TestAssignQueueNumberReusesFrozenPeriodAfterSettingsChange(testContext *testing.T) {
	now := queueTime(testContext, "2026-11-04T12:00:00+07:00")
	start := queueTime(testContext, "2026-11-03T22:00:00+07:00")
	end := queueTime(testContext, "2026-11-04T22:00:00+07:00")
	tx := &queueTestTx{test: testContext, rows: []queueTestRow{
		{err: pgx.ErrNoRows},
		{values: []any{now}},
		{values: []any{"02:00", "Asia/Bangkok", int64(2)}},
		{values: []any{start, end}},
		{values: []any{int64(2)}},
	}}
	actual, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder)
	if err != nil || actual != "002" {
		testContext.Fatalf("unexpected frozen-period allocation: %q, %v", actual, err)
	}
	arguments := tx.queryArgs[len(tx.queryArgs)-1]
	if !arguments[2].(time.Time).Equal(start) || !arguments[3].(time.Time).Equal(end) {
		testContext.Fatal("changing settings must not reset or overlap the currently issued period")
	}
}

func TestAssignQueueNumberRolloverStartsNewCounterAtClose(testContext *testing.T) {
	now := queueTime(testContext, "2026-11-04T22:00:00+07:00")
	tx := &queueTestTx{test: testContext, rows: []queueTestRow{
		{err: pgx.ErrNoRows},
		{values: []any{now}},
		{err: pgx.ErrNoRows},
		{values: []any{now.Add(-24 * time.Hour), now}},
		{values: []any{int64(1)}},
	}}
	actual, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder)
	if err != nil || actual != "001" {
		testContext.Fatalf("new period must begin at 001: %q, %v", actual, err)
	}
	arguments := tx.queryArgs[len(tx.queryArgs)-1]
	if !arguments[2].(time.Time).Equal(now) || !arguments[3].(time.Time).Equal(now.Add(24*time.Hour)) {
		testContext.Fatal("counter must use the new configured closing-time period")
	}
}

func TestAssignQueueNumberStopsOnPersistenceFailure(testContext *testing.T) {
	problem := errors.New("queue write failed")
	now := queueTime(testContext, "2026-11-04T12:00:00+07:00")
	for _, failureAt := range []int{2, 3, 4} {
		rows := []queueTestRow{
			{err: pgx.ErrNoRows}, {values: []any{now}}, {err: pgx.ErrNoRows},
			{err: pgx.ErrNoRows}, {values: []any{int64(1)}},
		}
		rows[failureAt] = queueTestRow{err: problem}
		tx := &queueTestTx{test: testContext, rows: rows}
		if _, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder); !errors.Is(err, problem) {
			testContext.Fatalf("query %d failure was swallowed: %v", failureAt, err)
		}
		if len(tx.executions) != 1 {
			testContext.Fatal("failed persistence must not write a ticket")
		}
	}
	tx := &queueTestTx{test: testContext, rows: []queueTestRow{
		{err: pgx.ErrNoRows}, {values: []any{now}}, {err: pgx.ErrNoRows},
		{err: pgx.ErrNoRows}, {values: []any{int64(1)}},
	}, execError: problem, execFailAt: 2}
	if _, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder); !errors.Is(err, problem) {
		testContext.Fatalf("ticket write failure must reach the caller for transaction rollback: %v", err)
	}
	tx = &queueTestTx{test: testContext, rows: []queueTestRow{
		{err: pgx.ErrNoRows}, {values: []any{now}}, {err: pgx.ErrNoRows},
		{err: pgx.ErrNoRows}, {err: pgx.ErrNoRows},
	}}
	if _, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder); !errors.Is(err, ErrConflict) {
		testContext.Fatalf("mismatched stored period bounds must conflict: %v", err)
	}
}

func TestAssignQueueNumberRejectsMissingOrderAndDatabaseFailures(testContext *testing.T) {
	problem := errors.New("queue persistence unavailable")
	for _, test := range []struct {
		name string
		rows []queueTestRow
		exec error
		want error
	}{
		{"lock failure", nil, problem, problem},
		{"lookup failure", []queueTestRow{{err: problem}}, nil, problem},
		{"wrong branch or missing order", []queueTestRow{{err: pgx.ErrNoRows}, {err: pgx.ErrNoRows}}, nil, ErrNotFound},
	} {
		testContext.Run(test.name, func(testContext *testing.T) {
			tx := &queueTestTx{test: testContext, rows: test.rows, execError: test.exec}
			if _, err := AssignQueueNumber(context.Background(), tx, queueTestOrg, queueTestBranch, queueTestOrder); !errors.Is(err, test.want) {
				testContext.Fatalf("unexpected error: %v", err)
			}
			if len(tx.executions) != 1 {
				testContext.Fatal("failed lookup must not create a ticket")
			}
		})
	}
	if _, err := AssignQueueNumber(context.Background(), nil, queueTestOrg, "invalid", queueTestOrder); !errors.Is(err, ErrInput) {
		testContext.Fatalf("invalid identifiers must fail before database access: %v", err)
	}
}

func TestQueueNumberFormattingPreservesLargeAndLegacyNumbers(testContext *testing.T) {
	if actual := queueNumber(nil, "WEB-123ABC"); actual != "WEB-123ABC" {
		testContext.Fatalf("legacy orders must not be backfilled or renumbered: %q", actual)
	}
	for _, test := range []struct {
		number int64
		want   string
	}{{1, "001"}, {17, "017"}, {999, "999"}, {1000, "1000"}, {12345, "12345"}} {
		if actual := queueNumber(&test.number, "WEB-123ABC"); actual != test.want {
			testContext.Fatalf("queue %d: got %q, want %q", test.number, actual, test.want)
		}
	}
}

func queueTime(testContext *testing.T, value string) time.Time {
	testContext.Helper()
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		testContext.Fatal(err)
	}
	return parsed
}

func TestQueuePeriodKeepsIssuedPeriodUntilClose(testContext *testing.T) {
	previous := BusinessPeriod{
		Start: queueTime(testContext, "2026-11-03T22:00:00+07:00"),
		End:   queueTime(testContext, "2026-11-04T22:00:00+07:00"),
	}
	settings := Settings{ClosingTime: "02:00", Timezone: "Asia/Bangkok"}
	for _, value := range []string{
		"2026-11-03T22:00:00+07:00",
		"2026-11-04T00:00:00+07:00",
		"2026-11-04T21:59:59+07:00",
	} {
		testContext.Run(value, func(testContext *testing.T) {
			actual, err := queuePeriod(queueTime(testContext, value), settings, &previous)
			if err != nil || !actual.Start.Equal(previous.Start) || !actual.End.Equal(previous.End) {
				testContext.Fatalf("issued period must survive midnight/settings changes: %+v, %v", actual, err)
			}
		})
	}
}

func TestQueuePeriodRolloverDoesNotOverlapIssuedPeriod(testContext *testing.T) {
	previous := BusinessPeriod{
		Start: queueTime(testContext, "2026-11-03T22:00:00+07:00"),
		End:   queueTime(testContext, "2026-11-04T22:00:00+07:00"),
	}
	for _, test := range []struct{ name, now, close, start, end string }{
		{"unchanged close", "2026-11-04T22:00:00+07:00", "22:00", "2026-11-04T22:00:00+07:00", "2026-11-05T22:00:00+07:00"},
		{"earlier close", "2026-11-04T22:00:00+07:00", "02:00", "2026-11-04T22:00:00+07:00", "2026-11-05T02:00:00+07:00"},
		{"later close", "2026-11-04T22:00:00+07:00", "23:00", "2026-11-04T22:00:00+07:00", "2026-11-04T23:00:00+07:00"},
		{"idle days", "2026-11-07T12:00:00+07:00", "02:00", "2026-11-07T02:00:00+07:00", "2026-11-08T02:00:00+07:00"},
	} {
		testContext.Run(test.name, func(testContext *testing.T) {
			actual, err := queuePeriod(queueTime(testContext, test.now), Settings{ClosingTime: test.close, Timezone: "Asia/Bangkok"}, &previous)
			if err != nil || !actual.Start.Equal(queueTime(testContext, test.start)) || !actual.End.Equal(queueTime(testContext, test.end)) {
				testContext.Fatalf("unexpected rollover: %+v, %v", actual, err)
			}
		})
	}
}

func TestQueuePeriodRejectsInvalidOrBackwardsBounds(testContext *testing.T) {
	now := queueTime(testContext, "2026-11-04T12:00:00+07:00")
	settings := Settings{ClosingTime: "22:00", Timezone: "Asia/Bangkok"}
	for _, previous := range []BusinessPeriod{
		{Start: now.Add(time.Hour), End: now.Add(2 * time.Hour)},
		{Start: now, End: now},
		{Start: now, End: now.Add(-time.Hour)},
	} {
		if _, err := queuePeriod(now, settings, &previous); !errors.Is(err, ErrConflict) {
			testContext.Fatalf("invalid persisted period must fail closed: %v", err)
		}
	}
	if _, err := queuePeriod(now, Settings{ClosingTime: "25:00", Timezone: "Asia/Bangkok"}, nil); !errors.Is(err, ErrInput) {
		testContext.Fatalf("invalid settings: %v", err)
	}
}

func TestQueuePeriodWithoutPreviousUsesConfiguredClose(testContext *testing.T) {
	settings := Settings{ClosingTime: "02:00", Timezone: "Asia/Bangkok"}
	now := queueTime(testContext, "2026-11-04T01:59:59+07:00")
	actual, err := queuePeriod(now, settings, nil)
	wanted, wantedErr := businessPeriod(now, settings)
	if err != nil || wantedErr != nil || !actual.Start.Equal(wanted.Start) || !actual.End.Equal(wanted.End) {
		testContext.Fatalf("unexpected first period: %+v, %v", actual, err)
	}
}

func TestQueueQueryEnforcesPaidAndReconciliationGuards(t *testing.T) {
	requiredFragments := []string{
		"payment.state='PAID'",
		"NOT payment.stock_hold_released",
		"online_refund_intents",
		"online_payment_reconciliations",
		"action='FULFILLMENT_REVIEW'",
	}
	for _, fragment := range requiredFragments {
		if !strings.Contains(queueQuery, fragment) {
			t.Fatalf("queueQuery must contain %q to enforce paid-only kitchen and prevent refunded/reconciled items from appearing", fragment)
		}
	}
}
