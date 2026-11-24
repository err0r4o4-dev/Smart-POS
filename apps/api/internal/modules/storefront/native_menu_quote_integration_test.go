package storefront

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/restaurant"
)

func TestNativeMenuQuoteIsolated(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MODIFIER_TEST_DSN")
	if os.Getenv("SMARTPOS_MODIFIER_QUOTE") != "1" || dsn == "" {
		t.Skip("requires the disposable modifier quote fixture")
	}
	config, err := pgx.ParseConfig(dsn)
	if err != nil || config.Host != "127.0.0.1" || config.Port != 15514 || config.Database != "smartpos_single_store_acceptance" || config.User != "smartpos_runtime" {
		t.Fatal("refusing an unconfirmed modifier quote target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		t.Fatal("connect to modifier quote fixture failed")
	}
	defer conn.Close(ctx)
	tx, err := conn.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var marker string
	if err = tx.QueryRow(ctx, "SELECT marker FROM modifier_acceptance_marker").Scan(&marker); err != nil || marker != "ephemeral-modifier" {
		t.Fatal("modifier fixture marker missing")
	}
	org, item, actor := os.Getenv("SMARTPOS_MODIFIER_ORG"), os.Getenv("SMARTPOS_MODIFIER_ITEM"), os.Getenv("SMARTPOS_MODIFIER_ACTOR")
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)", org, actor); err != nil {
		t.Fatal(err)
	}
	var locked string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM organizations WHERE id=$1 FOR UPDATE", org).Scan(&locked); err != nil {
		t.Fatal(err)
	}
	t.Run("stored mode admission", func(t *testing.T) {
		fixture, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer fixture.Rollback(ctx)
		if _, err := fixture.Exec(ctx, `UPDATE restaurant_profiles SET pickup=true,takeaway=true WHERE organization_id=$1`, org); err != nil {
			t.Fatal(err)
		}
		at := time.Date(2026, time.November, 23, 4, 0, 0, 0, time.UTC)
		check := func(id, mode string, sell bool, instant time.Time, want string, wantErr error) {
			t.Helper()
			got, err := restaurant.CheckLockedOrderAdmission(ctx, fixture, id, mode, sell, instant)
			if string(got) != want || !errors.Is(err, wantErr) {
				t.Fatalf("mode %s: got %q, %v; want %q, %v", mode, got, err, want, wantErr)
			}
		}
		check(org, "PICKUP", true, at, "OUTSIDE_HOURS", nil)
		if _, err := fixture.Exec(ctx, `INSERT INTO restaurant_availability
			(organization_id,timezone,weekly_windows,global_pause,dine_in_paused,takeaway_paused,pickup_paused,delivery_paused,revision,updated_by)
			VALUES ($1,'Asia/Bangkok','[{"weekday":1,"start":"10:00","end":"12:00"}]',false,false,false,true,false,1,$2)`, org, actor); err != nil {
			t.Fatal(err)
		}
		check(org, "PICKUP", true, at, "PAUSED", nil)
		check(org, "TAKEAWAY", true, at, "", nil)
		check(org, "TAKEAWAY", false, at, "UNAVAILABLE", nil)
		check(org, "TAKEAWAY", true, at.Add(time.Hour), "OUTSIDE_HOURS", nil)
		check(org, "DELIVERY", true, at, "UNAVAILABLE", nil)
	})
	var group, tofu, egg string
	if err = tx.QueryRow(ctx, `SELECT group_id::text,
	 max(id::text) FILTER (WHERE label='Tofu'),max(id::text) FILTER (WHERE label='Synthetic egg')
	 FROM restaurant_menu_modifier_options WHERE organization_id=$1 AND variant_id=$2
	 AND label IN ('Tofu','Synthetic egg') GROUP BY group_id`, org, item).Scan(&group, &tofu, &egg); err != nil {
		t.Fatal(err)
	}
	items := []nativeMenuLineInput{
		{VariantID: item, Quantity: "2", Choices: []restaurant.MenuModifierChoice{{GroupID: group, OptionIDs: []string{tofu}}}},
		{VariantID: item, Quantity: "1", Choices: []restaurant.MenuModifierChoice{{GroupID: group, OptionIDs: []string{egg}}}},
	}
	quote, err := quoteNativeMenu(ctx, tx, org, items)
	if err != nil || quote.Subtotal != "279.95" || len(quote.Items) != 2 || quote.Items[0].LineTotal != "194.70" || quote.Items[1].LineTotal != "85.25" {
		t.Fatalf("scoped stored prices: %+v, %v", quote, err)
	}
	if got, err := revalidateNativeMenuConfirmation(ctx, tx, org, items, quote.ConfirmationID); err != nil || got.ConfirmationID != quote.ConfirmationID {
		t.Fatalf("unchanged quote: %+v, %v", got, err)
	}
	checkout, err := priceNativeCheckout(quote, "DELIVERY", "15.25")
	if err != nil || checkout.Total != "295.20" {
		t.Fatalf("delivery quote: %+v, %v", checkout, err)
	}
	t.Run("mixed restaurant and empty carts", func(t *testing.T) {
		foreign := os.Getenv("SMARTPOS_MODIFIER_FOREIGN")
		if !uuidPattern.MatchString(foreign) || foreign == item {
			t.Fatal("requires a distinct foreign restaurant item")
		}
		for _, tc := range []struct {
			lines []nativeMenuLineInput
			want  error
		}{
			{nil, ErrInput},
			{[]nativeMenuLineInput{items[0], {VariantID: foreign, Quantity: "1"}}, ErrNotFound},
		} {
			preview, err := quoteNativeMenu(ctx, tx, org, tc.lines)
			if !errors.Is(err, tc.want) || preview.Subtotal != "" || preview.ConfirmationID != "" || len(preview.Items) != 0 {
				t.Fatalf("invalid cart did not fail atomically: got %v; want %v", err, tc.want)
			}
			admission, err := revalidateNativeCheckoutQuote(ctx, tx, org, tc.lines, "DELIVERY", "15.25", checkout.ConfirmationID)
			if !errors.Is(err, ErrQuote) || admission.Total != "" || admission.ConfirmationID != "" || len(admission.Menu.Items) != 0 {
				t.Fatalf("invalid cart retained a payable checkout result: %v", err)
			}
		}
	})
	t.Run("checkout admission and current quote", func(t *testing.T) {
		fixture, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer fixture.Rollback(ctx)
		if _, err := fixture.Exec(ctx, `UPDATE restaurant_profiles SET delivery=true WHERE organization_id=$1`, org); err != nil {
			t.Fatal(err)
		}
		if _, err := fixture.Exec(ctx, `INSERT INTO restaurant_availability
			(organization_id,timezone,weekly_windows,global_pause,dine_in_paused,takeaway_paused,pickup_paused,delivery_paused,revision,updated_by)
			VALUES ($1,'Asia/Bangkok','[{"weekday":1,"start":"10:00","end":"12:00"}]',false,false,false,false,false,1,$2)`, org, actor); err != nil {
			t.Fatal(err)
		}
		at := time.Date(2026, time.November, 23, 4, 0, 0, 0, time.UTC)
		check := func(t *testing.T, end *nativeDeliveryPoint, confirmed string, want error) {
			t.Helper()
			got, err := checkNativeCheckoutAdmission(ctx, fixture, org, items, "DELIVERY", confirmed, true, at, &nativeCheckoutDelivery{
				origin: &nativeDeliveryPoint{13, 100}, destination: end, radiusMeters: 1000, fee: "15.25",
			})
			if !errors.Is(err, want) {
				t.Fatalf("checkout admission: %v; want %v", err, want)
			}
			if want != nil && (got.Total != "" || got.ConfirmationID != "" || len(got.Menu.Items) != 0) {
				t.Fatal("denied checkout returned a quote")
			}
			if want == nil && (got.Total != "295.20" || got.ConfirmationID != confirmed) {
				t.Fatal("admitted checkout did not preserve the confirmed total")
			}
		}
		inside := &nativeDeliveryPoint{13.005, 100}
		check(t, inside, checkout.ConfirmationID, nil)
		check(t, nil, checkout.ConfirmationID, ErrInput)
		check(t, &nativeDeliveryPoint{13.02, 100}, checkout.ConfirmationID, errNativeDeliveryOutsideArea)
		check(t, inside, "stale", ErrQuote)
		if _, err := fixture.Exec(ctx, "UPDATE restaurant_availability SET delivery_paused=true WHERE organization_id=$1", org); err != nil {
			t.Fatal(err)
		}
		check(t, inside, checkout.ConfirmationID, ErrClosed)
	})
	t.Run("pickup pause leaves takeaway checkout open", func(t *testing.T) {
		fixture, err := tx.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer fixture.Rollback(ctx)
		if _, err := fixture.Exec(ctx, `UPDATE restaurant_profiles SET pickup=true,takeaway=true,dine_in=true WHERE organization_id=$1`, org); err != nil {
			t.Fatal(err)
		}
		if _, err := fixture.Exec(ctx, `INSERT INTO restaurant_availability
			(organization_id,timezone,weekly_windows,global_pause,dine_in_paused,takeaway_paused,pickup_paused,delivery_paused,revision,updated_by)
			VALUES ($1,'Asia/Bangkok','[{"weekday":1,"start":"10:00","end":"12:00"}]',false,false,false,true,false,1,$2)`, org, actor); err != nil {
			t.Fatal(err)
		}
		pickup, err := priceNativeCheckout(quote, "PICKUP", "")
		if err != nil {
			t.Fatal(err)
		}
		takeaway, err := priceNativeCheckout(quote, "TAKEAWAY", "")
		if err != nil {
			t.Fatal(err)
		}
		dineIn, err := priceNativeCheckout(quote, "DINE_IN", "")
		if err != nil {
			t.Fatal(err)
		}
		at := time.Date(2026, time.November, 23, 4, 0, 0, 0, time.UTC)
		for _, check := range []struct {
			mode, confirmation string
			want               error
		}{
			{"PICKUP", pickup.ConfirmationID, ErrClosed},
			{"TAKEAWAY", pickup.ConfirmationID, ErrQuote},
			{"TAKEAWAY", takeaway.ConfirmationID, nil},
			{"DINE_IN", dineIn.ConfirmationID, ErrNotFound},
		} {
			got, err := checkNativeCheckoutAdmission(ctx, fixture, org, items, check.mode, check.confirmation, true, at, nil)
			if !errors.Is(err, check.want) {
				t.Fatalf("%s admission: got %v; want %v", check.mode, err, check.want)
			}
			if check.want != nil {
				if got.Total != "" || got.ConfirmationID != "" || len(got.Menu.Items) != 0 {
					t.Fatal("denied checkout returned a quote")
				}
			} else if got.Mode != "TAKEAWAY" || got.ConfirmationID != takeaway.ConfirmationID || got.Total != "279.95" || got.DeliveryFee != "0.00" {
				t.Fatal("Takeaway did not retain its confirmed total without a delivery fee")
			}
		}
	})
	if got, err := revalidateNativeCheckoutQuote(ctx, tx, org, items, "DELIVERY", "15.25", checkout.ConfirmationID); err != nil || got.Total != checkout.Total {
		t.Fatalf("unchanged checkout quote: %+v, %v", got, err)
	}
	for _, change := range [][2]string{{"DELIVERY", "16.25"}, {"PICKUP", "15.25"}} {
		if got, err := revalidateNativeCheckoutQuote(ctx, tx, org, items, change[0], change[1], checkout.ConfirmationID); !errors.Is(err, ErrQuote) || got.Total != "" {
			t.Fatalf("stale fulfillment quote: %+v, %v", got, err)
		}
	}
	for _, tc := range []struct {
		name, statement string
		args            []any
	}{
		{"category change", `UPDATE categories SET name='Changed category' WHERE organization_id=$1 AND id=(
		 SELECT p.category_id FROM restaurant_menu_items m JOIN products p ON p.organization_id=m.organization_id AND p.id=m.product_id
		 WHERE m.organization_id=$1 AND m.variant_id=$2)`, []any{org, item}},
		{"unit change", `UPDATE units SET name='Changed unit' WHERE organization_id=$1 AND id=(
		 SELECT unit_id FROM product_variants WHERE organization_id=$1 AND id=$2)`, []any{org, item}},
		{"option disabled", "UPDATE restaurant_menu_modifier_options SET saleable=false WHERE organization_id=$1 AND variant_id=$2 AND id=$3", []any{org, item, tofu}},
		{"variant recalled", "INSERT INTO quality_recalls(organization_id,variant_id,reason,created_by) VALUES($1,$2,'Synthetic recall',$3)", []any{org, item, actor}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			change, err := tx.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer change.Rollback(ctx)
			result, err := change.Exec(ctx, tc.statement, tc.args...)
			if err != nil || result.RowsAffected() != 1 {
				t.Fatalf("synthetic mutation did not affect one row: %v, %v", result, err)
			}
			got, err := revalidateNativeMenuConfirmation(ctx, change, org, items, quote.ConfirmationID)
			if !errors.Is(err, ErrQuote) || got.ConfirmationID != "" || len(got.Items) != 0 {
				t.Fatalf("stale confirmation returned %+v, %v", got, err)
			}
			if checkoutResult, err := revalidateNativeCheckoutQuote(ctx, change, org, items, "DELIVERY", "15.25", checkout.ConfirmationID); !errors.Is(err, ErrQuote) || checkoutResult.Total != "" {
				t.Fatalf("stale checkout confirmation returned %+v, %v", checkoutResult, err)
			}
		})
	}
}
