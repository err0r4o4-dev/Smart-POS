package storefront_test

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/stripe"
)

type refundGatewayFixture struct {
	*stripe.CustomerClient
	createRefund func(context.Context, stripe.CustomerRefundCharge) (stripe.CustomerRefund, error)
	getRefund    func(context.Context, stripe.CustomerRefundCharge, string) (stripe.CustomerRefund, error)
}

func (gateway *refundGatewayFixture) CreateCustomerRefund(ctx context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
	return gateway.createRefund(ctx, charge)
}
func (gateway *refundGatewayFixture) RetrieveCustomerRefund(ctx context.Context, charge stripe.CustomerRefundCharge, id string) (stripe.CustomerRefund, error) {
	return gateway.getRefund(ctx, charge, id)
}

func deliveryAcceptance(test *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, shop storefront.Settings, foreignOrg, unauthorizedUser string) {
	test.Helper()
	service := &storefront.Service{Organization: organizations}
	variant := seedSourceProduct(test, ctx, organizations, owner, org, shop.BranchID, shop.LocationID, shop.LocationID)
	settings, err := service.SaveSettings(ctx, owner, org, storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, TerminalID: shop.TerminalID, Published: true, AcceptingOrders: true, DeliveryEnabled: true, ShippingFee: "30.00", Revision: shop.Revision})
	if err != nil {
		test.Fatal(err)
	}
	test.Run("delivery quote and order freeze store-owned fee without changing pickup", func(test *testing.T) {
		items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items, Fulfillment: "DELIVERY"})
		if problem != nil || quote.Fulfillment != "DELIVERY" || quote.Subtotal != "10.00" || quote.ShippingFee != "30.00" || quote.Total != "40.00" {
			test.Fatalf("delivery quote: %+v error %v", quote, problem)
		}
		pickup, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items})
		if problem != nil || pickup.Total != "10.00" || pickup.ShippingFee != "0.00" {
			test.Fatalf("pickup changed: %+v error %v", pickup, problem)
		}
		order, problem := service.CreateOrder(ctx, shop.Slug, "5a222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, Fulfillment: "DELIVERY", DeliveryAddress: "Synthetic address 123 Bangkok 10100", CustomerName: "Synthetic delivery buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("5", 64)})
		if problem != nil || order.EstimatedTotal != "40.00" || order.ShippingFee != "30.00" || order.Subtotal != "10.00" {
			test.Fatalf("delivery snapshot: %+v error %v", order, problem)
		}
		_, problem = service.SaveSettings(ctx, owner, org, storefront.SettingsInput{Slug: shop.Slug, Name: shop.Name, TerminalID: shop.TerminalID, Published: true, AcceptingOrders: true, DeliveryEnabled: true, ShippingFee: "50.00", Revision: settings.Revision})
		if problem != nil {
			test.Fatal(problem)
		}
		tracked, problem := service.Track(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("5", 64)})
		if problem != nil || tracked.ShippingFee != "30.00" || tracked.EstimatedTotal != "40.00" || tracked.DeliveryAddress != "" {
			test.Fatalf("frozen charge or public address redaction: %+v error %v", tracked, problem)
		}
	})
	test.Run("pre-shipment full refund is durable and only success cancels and releases stock", func(test *testing.T) {
		base, problem := stripe.NewSandbox("sk_test_syntheticDeliveryRefund", "http://localhost:8088")
		if problem != nil {
			test.Fatal(problem)
		}
		client, problem := stripe.NewCustomerClient(base, persistenceSigningSecret, true)
		if problem != nil {
			test.Fatal(problem)
		}
		gateway := &refundGatewayFixture{CustomerClient: client}
		service.CustomerPayments = gateway
		orderID := "5a222222-2222-4222-8222-222222222222"
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: orderID, AccessToken: strings.Repeat("5", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		body := paymentFixtureEvent(test, "evt_deliveryRefundPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_deliveryRefundPaid", "complete", "paid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
		key := "5a333333-3333-4333-8333-333333333333"
		creates, retrieves := 0, 0
		var frozen stripe.CustomerRefundCharge
		gateway.createRefund = func(network context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
			creates++
			deadline, valid := network.Deadline()
			if !valid || time.Until(deadline) > 11*time.Second {
				return stripe.CustomerRefund{}, errors.New("refund network deadline missing")
			}
			tx, _, failure := organizations.Authorized(network, owner, org, "storefront.manage")
			if failure != nil {
				return stripe.CustomerRefund{}, failure
			}
			defer tx.Rollback(network)
			var durable bool
			failure = tx.QueryRow(network, "SELECT EXISTS(SELECT 1 FROM online_refund_intents WHERE organization_id=$1 AND order_id=$2 AND id=$3 AND amount_minor=4000)", org, orderID, charge.RefundID).Scan(&durable)
			if failure != nil || !durable {
				return stripe.CustomerRefund{}, errors.New("refund dispatched before committed full-charge intent")
			}
			if charge.AmountMinor != 4000 {
				return stripe.CustomerRefund{}, errors.New("shipping omitted or changed settings fee used")
			}
			if creates == 1 {
				frozen = charge
				return stripe.CustomerRefund{}, stripe.ErrUnavailable
			}
			if charge != frozen {
				return stripe.CustomerRefund{}, errors.New("retry changed identity")
			}
			return stripe.CustomerRefund{ID: "re_deliveryRefund", Object: "refund", Status: "pending", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": orderID, "refund_id": charge.RefundID}}, nil
		}
		gateway.getRefund = func(_ context.Context, charge stripe.CustomerRefundCharge, id string) (stripe.CustomerRefund, error) {
			retrieves++
			return stripe.CustomerRefund{ID: id, Object: "refund", Status: "succeeded", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": orderID, "refund_id": charge.RefundID}}, nil
		}
		if _, problem = service.CancelPaidCustomerOrder(ctx, unauthorizedUser, org, orderID, key); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("nonmember refund: %v", problem)
		}
		if _, problem = service.CancelPaidCustomerOrder(ctx, owner, foreignOrg, orderID, key); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("foreign refund: %v", problem)
		}
		if creates != 0 || retrieves != 0 {
			test.Fatal("unauthorized refund called provider")
		}
		if _, problem = service.CancelPaidCustomerOrder(ctx, owner, org, orderID, key); !errors.Is(problem, stripe.ErrUnavailable) {
			test.Fatalf("unknown refund result: %v", problem)
		}
		assertHeld := func(expectedStatus string, released bool) {
			test.Helper()
			tx, _, failure := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if failure != nil {
				test.Fatal(failure)
			}
			defer tx.Rollback(ctx)
			var actualStatus string
			var actualReleased bool
			failure = tx.QueryRow(ctx, "SELECT doc.status,attempt.stock_hold_released FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2", org, orderID).Scan(&actualStatus, &actualReleased)
			if failure != nil || actualStatus != expectedStatus || actualReleased != released {
				test.Fatalf("refund release mismatch: %s %v %v", actualStatus, actualReleased, failure)
			}
		}
		assertHeld("PENDING", false)
		for _, statement := range []string{
			"UPDATE online_refund_intents SET amount_minor=amount_minor-1,revision=revision+1 WHERE organization_id=$1 AND order_id=$2",
			"UPDATE online_refund_intents SET state='SUCCEEDED',provider_id='re_fake',revision=revision+1 WHERE organization_id=$1 AND order_id=$2",
			"UPDATE online_payment_attempts SET stock_hold_released=true,revision=revision+1 WHERE organization_id=$1 AND order_id=$2",
			"UPDATE online_orders SET status='CANCELLED',revision=revision+1 WHERE organization_id=$1 AND id=$2",
		} {
			tx, _, failure := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if failure != nil {
				test.Fatal(failure)
			}
			_, failure = tx.Exec(ctx, statement, org, orderID)
			tx.Rollback(ctx)
			if failure == nil {
				test.Fatal("bare SQL bypassed refund/hold evidence")
			}
		}
		assertHeld("PENDING", false)
		pending, problem := service.CancelPaidCustomerOrder(ctx, owner, org, orderID, key)
		if problem != nil || pending.State != "PENDING" || pending.ProviderID == nil {
			test.Fatalf("pending refund: %+v %v", pending, problem)
		}
		assertHeld("PENDING", false)
		completed, problem := service.CancelPaidCustomerOrder(ctx, owner, org, orderID, key)
		if problem != nil || completed.State != "SUCCEEDED" || completed.ID != pending.ID || creates != 2 || retrieves != 1 {
			test.Fatalf("known refund recovery: %+v %v calls %d/%d", completed, problem, creates, retrieves)
		}
		assertHeld("CANCELLED", true)
		review, problem := service.CustomerPaymentReview(ctx, owner, org, orderID)
		if problem != nil || review.Status != "REFUNDED" {
			test.Fatalf("refund review status: %+v %v", review, problem)
		}
		replay, problem := service.CancelPaidCustomerOrder(ctx, owner, org, orderID, key)
		if problem != nil || replay.ID != completed.ID || retrieves != 1 || creates != 2 {
			test.Fatalf("refund replay: %+v %v", replay, problem)
		}
		if _, problem = service.CancelPaidCustomerOrder(ctx, owner, org, orderID, "5a444444-4444-4444-8444-444444444444"); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("replacement refund identity: %v", problem)
		}
	})
	test.Run("mismatched and failed refund evidence never releases stock", func(test *testing.T) {
		gateway := service.CustomerPayments.(*refundGatewayFixture)
		items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items, Fulfillment: "DELIVERY"})
		if problem != nil {
			test.Fatal(problem)
		}
		order, problem := service.CreateOrder(ctx, shop.Slug, "5b222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, Fulfillment: "DELIVERY", DeliveryAddress: "Synthetic refund address", CustomerName: "Synthetic refund buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("b", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("b", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		body := paymentFixtureEvent(test, "evt_deliveryRefundFailedPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_deliveryRefundFailedPaid", "complete", "paid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
		calls := 0
		gateway.createRefund = func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
			calls++
			refund := stripe.CustomerRefund{ID: "re_deliveryRefundFailed", Object: "refund", Status: "failed", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": charge.RefundID}}
			if calls == 1 {
				refund.AmountMinor--
			}
			return refund, nil
		}
		key := "5b333333-3333-4333-8333-333333333333"
		if _, problem = service.CancelPaidCustomerOrder(ctx, owner, org, order.ID, key); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("mismatched refund charge: %v", problem)
		}
		failed, problem := service.CancelPaidCustomerOrder(ctx, owner, org, order.ID, key)
		if problem != nil || failed.State != "FAILED" || failed.AmountMinor != 6000 {
			test.Fatalf("failed refund: %+v %v", failed, problem)
		}
		replay, problem := service.CancelPaidCustomerOrder(ctx, owner, org, order.ID, key)
		if problem != nil || replay.State != "FAILED" || calls != 2 {
			test.Fatalf("terminal failed refund reissued: %+v %v", replay, problem)
		}
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var observations int
		var status string
		var released bool
		problem = tx.QueryRow(ctx, "SELECT doc.status,attempt.stock_hold_released,(SELECT count(*) FROM online_refund_observations WHERE organization_id=$1 AND order_id=$2) FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2", org, order.ID).Scan(&status, &released, &observations)
		if problem != nil || released || status != "PENDING" || observations != 1 {
			test.Fatalf("failed/mismatched refund changed hold: %s %v %d %v", status, released, observations, problem)
		}
	})
	test.Run("concurrent stale refund observations cannot regress a successful cancellation", func(test *testing.T) {
		gateway := service.CustomerPayments.(*refundGatewayFixture)
		items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items, Fulfillment: "DELIVERY"})
		if problem != nil {
			test.Fatal(problem)
		}
		order, problem := service.CreateOrder(ctx, shop.Slug, "5d222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, Fulfillment: "DELIVERY", DeliveryAddress: "Synthetic concurrent address", CustomerName: "Synthetic concurrent buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("d", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("d", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		body := paymentFixtureEvent(test, "evt_deliveryRefundConcurrentPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_deliveryRefundConcurrentPaid", "complete", "paid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
		value := func(charge stripe.CustomerRefundCharge, status string) stripe.CustomerRefund {
			return stripe.CustomerRefund{ID: "re_concurrentRefund", Object: "refund", Status: status, AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": charge.RefundID}}
		}
		creates := 0
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		_, problem = tx.Exec(ctx, "INSERT INTO online_refund_intents(id,organization_id,order_id,actor_id,purpose,amount_minor,payment_intent,request_fingerprint,created_at) SELECT '5d444444-4444-4444-8444-444444444444',organization_id,order_id,$3,'CANCEL_BEFORE_SHIPMENT',amount_minor,payment_intent,repeat('a',64),now()+interval '1 day' FROM online_payment_attempts WHERE organization_id=$1 AND order_id=$2", org, order.ID, owner)
		tx.Rollback(ctx)
		if problem == nil {
			test.Fatal("future refund timestamp extended unknown-dispatch retry window")
		}
		gateway.createRefund = func(_ context.Context, charge stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
			creates++
			return value(charge, "pending"), nil
		}
		key := "5d333333-3333-4333-8333-333333333333"
		if _, problem = service.CancelPaidCustomerOrder(ctx, owner, org, order.ID, key); problem != nil {
			test.Fatal(problem)
		}
		ready := make(chan struct{}, 2)
		success := make(chan struct{})
		stale := make(chan struct{})
		var retrieves atomic.Int32
		gateway.getRefund = func(network context.Context, charge stripe.CustomerRefundCharge, _ string) (stripe.CustomerRefund, error) {
			position := retrieves.Add(1)
			ready <- struct{}{}
			gate, status := success, "succeeded"
			if position == 2 {
				gate, status = stale, "pending"
			}
			select {
			case <-gate:
				return value(charge, status), nil
			case <-network.Done():
				return stripe.CustomerRefund{}, network.Err()
			}
		}
		type outcome struct {
			intent storefront.RefundIntent
			err    error
		}
		results := make(chan outcome, 2)
		for range 2 {
			go func() {
				intent, failure := service.CancelPaidCustomerOrder(ctx, owner, org, order.ID, key)
				results <- outcome{intent, failure}
			}()
		}
		for range 2 {
			select {
			case <-ready:
			case <-ctx.Done():
				test.Fatal("concurrent refund lookup did not start")
			}
		}
		close(success)
		first := <-results
		close(stale)
		second := <-results
		if first.err != nil || second.err != nil || first.intent.State != "SUCCEEDED" || second.intent.State != "SUCCEEDED" || creates != 1 || retrieves.Load() != 2 {
			test.Fatalf("concurrent recovery: %+v %+v calls %d/%d", first, second, creates, retrieves.Load())
		}
		tx, _, problem = organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			test.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var observations, cancelledEvents int
		var status string
		var released bool
		problem = tx.QueryRow(ctx, "SELECT doc.status,attempt.stock_hold_released,(SELECT count(*) FROM online_refund_observations WHERE organization_id=$1 AND order_id=$2),(SELECT count(*) FROM online_order_events WHERE organization_id=$1 AND order_id=$2 AND status='CANCELLED') FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2", org, order.ID).Scan(&status, &released, &observations, &cancelledEvents)
		if problem != nil || status != "CANCELLED" || !released || observations != 3 || cancelledEvents != 1 {
			test.Fatalf("concurrent refund journals: %s %v %d/%d %v", status, released, observations, cancelledEvents, problem)
		}
	})
	test.Run("discovered refund recovery verifies provider evidence without replacement dispatch", func(test *testing.T) {
		gateway := service.CustomerPayments.(*refundGatewayFixture)
		items := []storefront.ItemInput{{VariantID: variant, Quantity: "1.000"}}
		quote, problem := service.Quote(ctx, shop.Slug, storefront.QuoteInput{Items: items, Fulfillment: "DELIVERY"})
		if problem != nil {
			test.Fatal(problem)
		}
		order, problem := service.CreateOrder(ctx, shop.Slug, "5c222222-2222-4222-8222-222222222222", storefront.OrderInput{Items: items, QuoteID: quote.ID, Fulfillment: "DELIVERY", DeliveryAddress: "Synthetic recovery address", CustomerName: "Synthetic recovery buyer", ContactPhone: "0800000000", AccessToken: strings.Repeat("c", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		key := "5c333333-3333-4333-8333-333333333333"
		if _, problem = service.ReconcileCustomerRefund(ctx, owner, org, order.ID, key, "re_discoveredRefund"); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("recovery invented refund intent: %v", problem)
		}
		attempt, problem := service.BeginCustomerPayment(ctx, shop.Slug, storefront.TrackingInput{OrderID: order.ID, AccessToken: strings.Repeat("c", 64)})
		if problem != nil {
			test.Fatal(problem)
		}
		body := paymentFixtureEvent(test, "evt_deliveryRefundRecoveryPaid", "checkout.session.completed", paymentFixtureSession(attempt, "cs_test_deliveryRefundRecoveryPaid", "complete", "paid"))
		now := time.Now()
		if _, problem = service.AcceptCustomerWebhook(ctx, body, paymentSignature(body, now), now); problem != nil {
			test.Fatal(problem)
		}
		creates, retrieves := 0, 0
		gateway.createRefund = func(context.Context, stripe.CustomerRefundCharge) (stripe.CustomerRefund, error) {
			creates++
			return stripe.CustomerRefund{}, stripe.ErrUnavailable
		}
		if _, problem = service.CancelPaidCustomerOrder(ctx, owner, org, order.ID, key); !errors.Is(problem, stripe.ErrUnavailable) {
			test.Fatalf("unknown recovery fixture: %v", problem)
		}
		gateway.getRefund = func(_ context.Context, charge stripe.CustomerRefundCharge, id string) (stripe.CustomerRefund, error) {
			retrieves++
			refund := stripe.CustomerRefund{ID: id, Object: "refund", Status: "succeeded", AmountMinor: charge.AmountMinor, Currency: "thb", PaymentIntent: charge.PaymentIntent, Metadata: map[string]string{"smartpos_purpose": stripe.CustomerRefundPurpose, "organization_id": org, "order_id": order.ID, "refund_id": charge.RefundID}}
			if retrieves == 1 {
				refund.Metadata["refund_id"] = order.ID
			}
			return refund, nil
		}
		if _, problem = service.ReconcileCustomerRefund(ctx, owner, org, order.ID, key, "re_discoveredRefund"); !errors.Is(problem, storefront.ErrNotFound) {
			test.Fatalf("staff refund ID bypassed provider scope: %v", problem)
		}
		result, problem := service.ReconcileCustomerRefund(ctx, owner, org, order.ID, key, "re_discoveredRefund")
		if problem != nil || result.State != "SUCCEEDED" || creates != 1 || retrieves != 2 {
			test.Fatalf("discovered refund: %+v %v calls %d/%d", result, problem, creates, retrieves)
		}
		if _, problem = service.ReconcileCustomerRefund(ctx, owner, org, order.ID, key, "re_anotherRefund"); !errors.Is(problem, storefront.ErrConflict) {
			test.Fatalf("refund ID rebound: %v", problem)
		}
	})
}
