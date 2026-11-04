package storefront_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

func restaurantQueueAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg string) {
	test.Helper()
	gateway, err := stripe.NewSandbox("sk_test_synthetic", "http://localhost:8088")
	if err != nil {
		test.Fatal(err)
	}
	payments, err := stripe.NewCustomerClient(gateway, persistenceSigningSecret, true)
	if err != nil {
		test.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations, CustomerPayments: payments}
	queues := &restaurant.Service{Organization: organizations}
	var closingTime string
	if err = organizations.Pool.QueryRow(ctx, `SELECT to_char((clock_timestamp()+interval '12 hours') AT TIME ZONE 'UTC','HH24:MI')`).Scan(&closingTime); err != nil {
		test.Fatal(err)
	}
	if _, err = queues.SaveSettings(ctx, owner, org, restaurant.SettingsInput{BranchID: shop.BranchID, ClosingTime: closingTime, Timezone: "UTC"}); err != nil {
		test.Fatal(err)
	}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
	quote, err := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
	if err != nil {
		test.Fatal(err)
	}
	input := storefront.OrderInput{Items: items, QuoteID: quote.ID, CustomerName: "Synthetic queue buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("9", 64)}
	keys := []string{"9c222222-2222-4222-8222-222222222222", "9c333333-3333-4333-8333-333333333333", "9c444444-4444-4444-8444-444444444444"}
	first, err := service.CreateOrder(ctx, shop.Slug, keys[0], input)
	if err != nil {
		test.Fatal(err)
	}
	orders := []storefront.Order{first, {}, {}}
	failures := make([]error, 2)
	var workers sync.WaitGroup
	start := make(chan struct{})
	for index := 1; index < len(keys); index++ {
		workers.Add(1)
		go func(index int) {
			defer workers.Done()
			<-start
			orders[index], failures[index-1] = service.CreateOrder(ctx, shop.Slug, keys[index], input)
		}(index)
	}
	close(start)
	workers.Wait()
	for _, failure := range failures {
		if failure != nil {
			test.Fatal(failure)
		}
	}
	readTickets := func(test *testing.T) map[string]int64 {
		test.Helper()
		tx, _, problem := organizations.Authorized(ctx, owner, org, "online_orders.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		rows, problem := tx.Query(ctx, `SELECT order_id::text,queue_number FROM restaurant_order_queue WHERE organization_id=$1 AND branch_id=$2`, org, shop.BranchID)
		if problem != nil {
			test.Fatal(problem)
		}
		defer rows.Close()
		result := map[string]int64{}
		for rows.Next() {
			var id string
			var number int64
			if problem = rows.Scan(&id, &number); problem != nil {
				test.Fatal(problem)
			}
			result[id] = number
		}
		if problem = rows.Err(); problem != nil {
			test.Fatal(problem)
		}
		return result
	}
	tickets := readTickets(test)
	test.Run("concurrent orders receive unique durable numbers and retry does not advance", func(test *testing.T) {
		if len(tickets) != 3 || tickets[first.ID] != 1 || tickets[orders[1].ID]+tickets[orders[2].ID] != 5 || tickets[orders[1].ID] == tickets[orders[2].ID] {
			test.Fatalf("unexpected concurrent allocation: %+v", tickets)
		}
		if replay, problem := service.CreateOrder(ctx, shop.Slug, keys[0], input); problem != nil || replay.ID != first.ID {
			test.Fatalf("order replay failed: %v", problem)
		}
		if actual := readTickets(test); len(actual) != 3 || actual[first.ID] != 1 {
			test.Fatalf("replay changed tickets: %+v", actual)
		}
		assertSourceStock(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, variant, "3.000", "3.000", "0.000")
	})
	test.Run("rollback removes counter advance and ticket with the parent order", func(test *testing.T) {
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var temporary string
		problem = tx.QueryRow(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint) SELECT gen_random_uuid(),organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint FROM online_orders WHERE organization_id=$1 AND id=$2 RETURNING id::text`, org, first.ID).Scan(&temporary)
		if problem != nil {
			test.Fatal(problem)
		}
		if number, allocationErr := restaurant.AssignQueueNumber(ctx, tx, org, shop.BranchID, temporary); allocationErr != nil || number != "004" {
			test.Fatalf("temporary allocation: %q, %v", number, allocationErr)
		}
		if problem = tx.Rollback(ctx); problem != nil {
			test.Fatal(problem)
		}
		check, _, problem := organizations.Authorized(ctx, owner, org, "online_orders.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer check.Rollback(ctx)
		var number int64
		var remaining int
		if problem = check.QueryRow(ctx, `SELECT last_number,(SELECT count(*) FROM online_orders WHERE organization_id=$1 AND id=$3) FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, org, shop.BranchID, temporary).Scan(&number, &remaining); problem != nil || number != 3 || remaining != 0 {
			test.Fatalf("rollback retained order or counter: %d, %d, %v", number, remaining, problem)
		}
	})
	test.Run("tenant and branch mismatch cannot allocate or expose tickets", func(test *testing.T) {
		tx, _, problem := organizations.Authorized(ctx, owner, org, "online_orders.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var count int
		if problem = tx.QueryRow(ctx, `SELECT count(*) FROM restaurant_order_queue WHERE organization_id=$1`, foreignOrg).Scan(&count); problem != nil || count != 0 {
			test.Fatalf("foreign tickets exposed: %d, %v", count, problem)
		}
		if _, problem = restaurant.AssignQueueNumber(ctx, tx, foreignOrg, shop.BranchID, first.ID); !errors.Is(problem, restaurant.ErrNotFound) {
			test.Fatalf("foreign order accepted: %v", problem)
		}
		if _, problem = restaurant.AssignQueueNumber(ctx, tx, org, "9c555555-5555-4555-8555-555555555555", first.ID); !errors.Is(problem, restaurant.ErrNotFound) {
			test.Fatalf("wrong branch accepted: %v", problem)
		}
	})
	test.Run("runtime cannot mutate ticket or period snapshots or rewind the counter", func(test *testing.T) {
		for _, statement := range []struct{ sql, code string }{
			{`UPDATE restaurant_order_queue SET queue_number=99 WHERE organization_id=$1`, "42501"},
			{`DELETE FROM restaurant_order_queue WHERE organization_id=$1`, "42501"},
			{`UPDATE restaurant_queue_periods SET period_end=period_end+interval '1 hour' WHERE organization_id=$1`, "42501"},
			{`UPDATE restaurant_queue_periods SET last_number=last_number-1 WHERE organization_id=$1`, "23514"},
		} {
			func() {
				tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
				if problem != nil {
					test.Fatal(problem)
				}
				defer tx.Rollback(ctx)
				_, problem = tx.Exec(ctx, statement.sql, org)
				var databaseError *pgconn.PgError
				if !errors.As(problem, &databaseError) || databaseError.Code != statement.code {
					test.Fatalf("queue guard did not reject write: %v", problem)
				}
			}()
		}
	})
	test.Run("paid queue uses saved numbers instead of ranking visible orders", func(test *testing.T) {
		if _, problem := service.Transition(ctx, owner, org, first.ID, storefront.TransitionInput{Revision: first.Revision, Status: "CANCELLED", Message: "Synthetic queue cancellation"}); problem != nil {
			test.Fatal(problem)
		}
		for index := 1; index < len(orders); index++ {
			attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: orders[index].ID, AccessToken: input.AccessToken})
			if problem != nil {
				test.Fatal(problem)
			}
			session := paymentFixtureSession(attempt, fmt.Sprintf("cs_test_queue%d", index), "open", "unpaid")
			if _, problem = service.BindCustomerPayment(ctx, org, orders[index].ID, session); problem != nil {
				test.Fatal(problem)
			}
			session = paymentFixtureSession(attempt, session.ID, "complete", "paid")
			body := paymentFixtureEvent(test, fmt.Sprintf("evt_queue%d", index), "checkout.session.completed", session)
			now := time.Now()
			if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
				test.Fatal(problem)
			}
		}
		actual, problem := queues.Queue(ctx, owner, org, shop.BranchID)
		if problem != nil || len(actual) != 2 {
			test.Fatalf("paid queue: %+v, %v", actual, problem)
		}
		for _, item := range actual {
			if item.QueueNumber != fmt.Sprintf("%03d", tickets[item.OrderID]) || item.QueueNumber == "001" {
				test.Fatalf("visible queue renumbered: %+v", item)
			}
		}
		write, _, problem := organizations.Authorized(ctx, owner, org, "online_orders.read")
		if problem != nil {
			test.Fatal(problem)
		}
		defer write.Rollback(ctx)
		var number int64
		if problem = write.QueryRow(ctx, `SELECT queue_number FROM restaurant_order_queue WHERE organization_id=$1 AND order_id=$2`, org, first.ID).Scan(&number); problem != nil || number != 1 {
			test.Fatalf("cancelled order lost its historical number: %d, %v", number, problem)
		}
	})
	test.Run("direct allocators contend and rollback permits replay", func(test *testing.T) {
		queueAllocatorContention(test, ctx, organizations, owner, org, shop, first.ID)
	})
	test.Run("settings freeze current period and rollover clamps overlap", func(test *testing.T) {
		queuePeriodPersistence(test, ctx, organizations, owner, org, shop, first.ID)
	})
	test.Run("paid legacy ticketless order keeps WEB number", func(test *testing.T) {
		tx, problem := queueScopedTransaction(ctx, organizations, owner, org)
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var periodStart time.Time
		if problem = tx.QueryRow(ctx, `SELECT date_trunc('minute',clock_timestamp()-interval '12 hours')`).Scan(&periodStart); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, `INSERT INTO restaurant_settings(organization_id,branch_id,closing_time,timezone,updated_by) VALUES($1,$2,($3::timestamptz AT TIME ZONE 'UTC')::time,'UTC',$4) ON CONFLICT(organization_id,branch_id) DO UPDATE SET closing_time=EXCLUDED.closing_time,timezone=EXCLUDED.timezone,revision=restaurant_settings.revision+1,updated_by=EXCLUDED.updated_by`, org, shop.BranchID, periodStart, owner); problem != nil {
			test.Fatal(problem)
		}
		var operation string
		if problem = tx.QueryRow(ctx, `INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,'queue.legacy.fixture',gen_random_uuid(),$3) RETURNING id::text`, org, owner, strings.Repeat("0", 64)).Scan(&operation); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, `INSERT INTO stock_movements(organization_id,branch_id,location_id,variant_id,movement_type,quantity_delta,operation_id,reason_code,performed_by) VALUES($1,$2,$3,$4,'ADJUSTMENT_IN',1,$5,'SYNTHETIC_QUEUE',$6)`, org, shop.BranchID, shop.LocationID, variant, operation, owner); problem != nil {
			test.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, `UPDATE inventory_operations SET result='{}' WHERE organization_id=$1 AND id=$2`, org, operation); problem != nil {
			test.Fatal(problem)
		}
		legacy, problem := queueCopyOrder(ctx, tx, org, first.ID, shop.BranchID, shop.TerminalID, shop.LocationID, true, nil)
		if problem != nil {
			test.Fatal(problem)
		}
		historicalCreated := periodStart.Add(-time.Second)
		historical, problem := queueCopyOrder(ctx, tx, org, first.ID, shop.BranchID, shop.TerminalID, shop.LocationID, true, &historicalCreated)
		if problem != nil {
			test.Fatal(problem)
		}
		var legacyNumber string
		if problem = tx.QueryRow(ctx, `SELECT number FROM online_orders WHERE organization_id=$1 AND id=$2`, org, legacy).Scan(&legacyNumber); problem != nil {
			test.Fatal(problem)
		}
		if problem = tx.Commit(ctx); problem != nil {
			test.Fatal(problem)
		}
		for index, orderID := range []string{legacy, historical} {
			attempt, paymentErr := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: orderID, AccessToken: input.AccessToken})
			if paymentErr != nil {
				test.Fatal(paymentErr)
			}
			session := paymentFixtureSession(attempt, fmt.Sprintf("cs_test_queuelegacy%d", index), "open", "unpaid")
			if _, paymentErr = service.BindCustomerPayment(ctx, org, orderID, session); paymentErr != nil {
				test.Fatal(paymentErr)
			}
			session = paymentFixtureSession(attempt, session.ID, "complete", "paid")
			body := paymentFixtureEvent(test, fmt.Sprintf("evt_queuelegacy%d", index), "checkout.session.completed", session)
			now := time.Now()
			if _, paymentErr = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); paymentErr != nil {
				test.Fatal(paymentErr)
			}
		}
		check, problem := queueScopedTransaction(ctx, organizations, owner, org)
		if problem != nil {
			test.Fatal(problem)
		}
		defer check.Rollback(ctx)
		var eligible bool
		if problem = check.QueryRow(ctx, `SELECT doc.created_at=$3::timestamptz AND storefront_order_live(doc.organization_id,doc.id) AND payment.state='PAID' AND NOT EXISTS(SELECT 1 FROM restaurant_order_queue ticket WHERE ticket.organization_id=doc.organization_id AND ticket.order_id=doc.id) FROM online_orders doc JOIN online_payment_attempts payment ON payment.organization_id=doc.organization_id AND payment.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2`, org, historical, historicalCreated).Scan(&eligible); problem != nil || !eligible {
			test.Fatalf("historical order is not a paid, live, ticketless fixture: %v, %v", eligible, problem)
		}
		actual, problem := queues.Queue(ctx, owner, org, shop.BranchID)
		if problem != nil {
			test.Fatal(problem)
		}
		found := false
		for _, item := range actual {
			if item.OrderID == historical {
				test.Fatalf("paid legacy order before period appeared in queue: %+v", item)
			}
			if item.OrderID == legacy {
				found = true
				if !strings.HasPrefix(legacyNumber, "WEB-") || item.QueueNumber != legacyNumber {
					test.Fatalf("legacy number changed: %+v, %q", item, legacyNumber)
				}
			}
		}
		if !found {
			test.Fatalf("paid legacy order missing from queue: %+v", actual)
		}
	})
}

func queueScopedTransaction(ctx context.Context, organizations *organization.Service, owner, org string) (pgx.Tx, error) {
	tx, err := organizations.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	if _, err = tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.organization_id',$2,true)`, owner, org); err != nil {
		_ = tx.Rollback(ctx)
		return nil, err
	}
	return tx, nil
}

func queueCopyOrder(ctx context.Context, tx pgx.Tx, org, source, branch, terminal, location string, live bool, createdAt *time.Time) (string, error) {
	var order string
	err := tx.QueryRow(ctx, `INSERT INTO online_orders(id,organization_id,branch_id,terminal_id,stock_location_id,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint,fulfillment,shipping_fee,delivery_address,expires_at,created_at)
 SELECT gen_random_uuid(),organization_id,$3,$4,$5,customer_name,contact_phone,store_name,estimated_total,access_hash,request_fingerprint,fulfillment,shipping_fee,delivery_address,CASE WHEN $6 THEN now()+interval '48 hours' ELSE now()-interval '1 hour' END,COALESCE($7::timestamptz,now()) FROM online_orders WHERE organization_id=$1 AND id=$2 RETURNING id::text`, org, source, branch, terminal, location, live, createdAt).Scan(&order)
	if err != nil {
		return "", err
	}
	_, err = tx.Exec(ctx, `INSERT INTO online_order_items(organization_id,order_id,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total)
 SELECT organization_id,$3,variant_id,product_name,variant_name,sku,unit,quantity,unit_price,line_total FROM online_order_items WHERE organization_id=$1 AND order_id=$2`, org, source, order)
	return order, err
}

func queueAllocatorContention(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, source string) {
	test.Helper()
	setup, err := queueScopedTransaction(ctx, organizations, owner, org)
	if err != nil {
		test.Fatal(err)
	}
	defer setup.Rollback(ctx)
	firstOrder, err := queueCopyOrder(ctx, setup, org, source, shop.BranchID, shop.TerminalID, shop.LocationID, false, nil)
	if err != nil {
		test.Fatal(err)
	}
	secondOrder, err := queueCopyOrder(ctx, setup, org, source, shop.BranchID, shop.TerminalID, shop.LocationID, false, nil)
	if err != nil {
		test.Fatal(err)
	}
	if err = setup.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	firstTx, err := queueScopedTransaction(ctx, organizations, owner, org)
	if err != nil {
		test.Fatal(err)
	}
	defer firstTx.Rollback(ctx)
	if number, problem := restaurant.AssignQueueNumber(ctx, firstTx, org, shop.BranchID, firstOrder); problem != nil || number != "004" {
		test.Fatalf("first allocation: %q, %v", number, problem)
	}
	secondTx, err := queueScopedTransaction(ctx, organizations, owner, org)
	if err != nil {
		test.Fatal(err)
	}
	var backendPID int
	if err = secondTx.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&backendPID); err != nil {
		_ = secondTx.Rollback(ctx)
		test.Fatal(err)
	}
	type allocationResult struct {
		number string
		err    error
	}
	result := make(chan allocationResult, 1)
	allocationContext, cancelAllocation := context.WithCancel(ctx)
	resultReceived := false
	defer func() {
		cancelAllocation()
		_ = firstTx.Rollback(ctx)
		if !resultReceived {
			<-result
		}
		_ = secondTx.Rollback(ctx)
	}()
	go func() {
		number, problem := restaurant.AssignQueueNumber(allocationContext, secondTx, org, shop.BranchID, secondOrder)
		result <- allocationResult{number: number, err: problem}
	}()
	observer, err := queueScopedTransaction(ctx, organizations, owner, org)
	if err != nil {
		test.Fatal(err)
	}
	defer observer.Rollback(ctx)
	waitContext, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	for {
		var waiting bool
		if err = observer.QueryRow(waitContext, `SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted)`, backendPID).Scan(&waiting); err != nil {
			test.Fatalf("allocator did not wait for advisory lock: %v", err)
		}
		if waiting {
			break
		}
		select {
		case outcome := <-result:
			resultReceived = true
			test.Fatalf("allocator finished without waiting: %+v", outcome)
		default:
		}
	}
	if err = firstTx.Rollback(ctx); err != nil {
		test.Fatal(err)
	}
	outcome := <-result
	resultReceived = true
	if outcome.err != nil || outcome.number != "004" {
		test.Fatalf("rollback did not release allocation: %+v", outcome)
	}
	if err = secondTx.Commit(ctx); err != nil {
		test.Fatal(err)
	}
	replay, err := queueScopedTransaction(ctx, organizations, owner, org)
	if err != nil {
		test.Fatal(err)
	}
	defer replay.Rollback(ctx)
	if number, problem := restaurant.AssignQueueNumber(ctx, replay, org, shop.BranchID, secondOrder); problem != nil || number != "004" {
		test.Fatalf("replay: %q, %v", number, problem)
	}
	var lastNumber int64
	var rolledBackTickets int
	if err = replay.QueryRow(ctx, `SELECT last_number,(SELECT count(*) FROM restaurant_order_queue WHERE organization_id=$1 AND order_id=$3) FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2 ORDER BY period_start DESC LIMIT 1`, org, shop.BranchID, firstOrder).Scan(&lastNumber, &rolledBackTickets); err != nil || lastNumber != 4 || rolledBackTickets != 0 {
		test.Fatalf("rollback or replay changed persisted state: %d %d %v", lastNumber, rolledBackTickets, err)
	}
}

func queuePeriodPersistence(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, source string) {
	test.Helper()
	tx, err := queueScopedTransaction(ctx, organizations, owner, org)
	if err != nil {
		test.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var originalStart, originalEnd time.Time
	if err = tx.QueryRow(ctx, `SELECT period_start,period_end FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2 ORDER BY period_start DESC LIMIT 1`, org, shop.BranchID).Scan(&originalStart, &originalEnd); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_settings(organization_id,branch_id,closing_time,timezone,updated_by) VALUES($1,$2,'03:17','UTC',$3) ON CONFLICT(organization_id,branch_id) DO UPDATE SET closing_time=EXCLUDED.closing_time,timezone=EXCLUDED.timezone,revision=restaurant_settings.revision+1,updated_by=EXCLUDED.updated_by`, org, shop.BranchID, owner); err != nil {
		test.Fatal(err)
	}
	order, err := queueCopyOrder(ctx, tx, org, source, shop.BranchID, shop.TerminalID, shop.LocationID, false, nil)
	if err != nil {
		test.Fatal(err)
	}
	if number, problem := restaurant.AssignQueueNumber(ctx, tx, org, shop.BranchID, order); problem != nil || number != "005" {
		test.Fatalf("allocation after settings change: %q, %v", number, problem)
	}
	var savedStart, savedEnd time.Time
	if err = tx.QueryRow(ctx, `SELECT period.period_start,period.period_end FROM restaurant_order_queue ticket JOIN restaurant_queue_periods period USING(organization_id,branch_id,period_start) WHERE ticket.organization_id=$1 AND ticket.order_id=$2`, org, order).Scan(&savedStart, &savedEnd); err != nil || !savedStart.Equal(originalStart) || !savedEnd.Equal(originalEnd) {
		test.Fatalf("active period changed: %v %v, %v", savedStart, savedEnd, err)
	}

	var branch, location, terminal string
	if err = tx.QueryRow(ctx, `INSERT INTO branches(id,organization_id,code,name) VALUES(gen_random_uuid(),$1,'QUEUE-ROLLOVER','Queue rollover') RETURNING id::text`, org).Scan(&branch); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO stock_locations(organization_id,branch_id,code,name,type,created_by,updated_by) VALUES($1,$2,'QUEUE','Queue fixture','SALES_FLOOR',$3,$3) RETURNING id::text`, org, branch, owner).Scan(&location); err != nil {
		test.Fatal(err)
	}
	if err = tx.QueryRow(ctx, `INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES($1,$2,'QUEUE','Queue fixture',$3) RETURNING id::text`, org, branch, location).Scan(&terminal); err != nil {
		test.Fatal(err)
	}
	var previousEnd time.Time
	if err = tx.QueryRow(ctx, `INSERT INTO restaurant_queue_periods(organization_id,branch_id,period_start,period_end,last_number) VALUES($1,$2,clock_timestamp()-interval '26 hours',clock_timestamp()-interval '2 hours',7) RETURNING period_end`, org, branch).Scan(&previousEnd); err != nil {
		test.Fatal(err)
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_settings(organization_id,branch_id,closing_time,timezone,updated_by) VALUES($1,$2,((clock_timestamp()-interval '4 hours') AT TIME ZONE 'UTC')::time,'UTC',$3)`, org, branch, owner); err != nil {
		test.Fatal(err)
	}
	rolloverOrder, err := queueCopyOrder(ctx, tx, org, source, branch, terminal, location, false, nil)
	if err != nil {
		test.Fatal(err)
	}
	if number, problem := restaurant.AssignQueueNumber(ctx, tx, org, branch, rolloverOrder); problem != nil || number != "001" {
		test.Fatalf("rollover allocation: %q, %v", number, problem)
	}
	var issuedAt time.Time
	if err = tx.QueryRow(ctx, `SELECT period.period_start,period.period_end,ticket.issued_at FROM restaurant_order_queue ticket JOIN restaurant_queue_periods period USING(organization_id,branch_id,period_start) WHERE ticket.organization_id=$1 AND ticket.order_id=$2`, org, rolloverOrder).Scan(&savedStart, &savedEnd, &issuedAt); err != nil || !savedStart.Equal(previousEnd) || !issuedAt.Before(savedEnd) || issuedAt.Before(savedStart) {
		test.Fatalf("rollover did not clamp persisted bounds: %v %v %v %v", savedStart, savedEnd, issuedAt, err)
	}
	var periods int
	if err = tx.QueryRow(ctx, `SELECT count(*) FROM restaurant_queue_periods WHERE organization_id=$1 AND branch_id=$2`, org, branch).Scan(&periods); err != nil || periods != 2 {
		test.Fatalf("rollover periods: %d, %v", periods, err)
	}
}
