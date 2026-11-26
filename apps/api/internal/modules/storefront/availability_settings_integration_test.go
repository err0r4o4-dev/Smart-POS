package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func verifyAvailabilityRLS(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner, org, other string) {
	t.Helper()
	const insert = `INSERT INTO restaurant_availability
		(organization_id, timezone, weekly_windows, global_pause, dine_in_paused,
		 takeaway_paused, pickup_paused, delivery_paused, revision, updated_by)
		VALUES ($1, 'Asia/Bangkok', '[]', false, false, false, false, false, 1, $2)`
	run := func(t *testing.T, scope string, check func(t *testing.T, tx pgx.Tx)) {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer func() {
			cleanupCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := tx.Rollback(cleanupCtx); err != nil {
				t.Errorf("rollback availability probe: %v", err)
			}
		}()
		// Also exercise runtime policies when the disposable suite connects as its migration role.
		if _, err = tx.Exec(ctx, "SET LOCAL ROLE smartpos_runtime"); err != nil {
			t.Fatal(err)
		}
		var runtime bool
		if err = tx.QueryRow(ctx, `SELECT rolname = 'smartpos_runtime' AND NOT rolsuper AND NOT rolbypassrls
			FROM pg_roles WHERE rolname = current_user`).Scan(&runtime); err != nil || !runtime {
			t.Fatalf("expected runtime role subject to RLS: %v", err)
		}
		if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id', $1, true)", scope); err != nil {
			t.Fatal(err)
		}
		check(t, tx)
	}
	snapshot := func(t *testing.T, tx pgx.Tx, id string) string {
		t.Helper()
		var row string
		err := tx.QueryRow(ctx, `SELECT COALESCE(
			(SELECT to_jsonb(a)::text FROM restaurant_availability a WHERE organization_id = $1), '')`, id).Scan(&row)
		if err != nil {
			t.Fatal(err)
		}
		return row
	}
	expectDenied := func(t *testing.T, err error) {
		t.Helper()
		var problem *pgconn.PgError
		if !errors.As(err, &problem) || problem.Code != "42501" {
			t.Fatalf("expected insufficient privilege, got %v", err)
		}
	}
	var before string
	run(t, org, func(t *testing.T, tx pgx.Tx) {
		before = snapshot(t, tx, org)
		if before == "" {
			t.Fatal("expected saved availability fixture")
		}
	})
	t.Run("no organization cannot read", func(t *testing.T) {
		run(t, "", func(t *testing.T, tx pgx.Tx) {
			if snapshot(t, tx, org) != "" {
				t.Fatal("availability is visible without an organization")
			}
		})
	})
	t.Run("foreign organization cannot read or update", func(t *testing.T) {
		run(t, other, func(t *testing.T, tx pgx.Tx) {
			if snapshot(t, tx, org) != "" {
				t.Fatal("foreign availability is visible")
			}
			tag, err := tx.Exec(ctx, "UPDATE restaurant_availability SET revision = revision + 1 WHERE organization_id = $1", org)
			if err != nil || tag.RowsAffected() != 0 {
				t.Fatalf("foreign update affected %d rows: %v", tag.RowsAffected(), err)
			}
		})
	})
	t.Run("foreign organization cannot insert", func(t *testing.T) {
		run(t, org, func(t *testing.T, tx pgx.Tx) {
			_, err := tx.Exec(ctx, insert, other, owner)
			expectDenied(t, err)
		})
	})
	t.Run("matching organization can insert", func(t *testing.T) {
		run(t, other, func(t *testing.T, tx pgx.Tx) {
			if _, err := tx.Exec(ctx, insert, other, owner); err != nil {
				t.Fatal(err)
			}
			if snapshot(t, tx, other) == "" {
				t.Fatal("matching organization cannot see its insert")
			}
		})
	})
	t.Run("matching organization can update but cannot delete", func(t *testing.T) {
		run(t, org, func(t *testing.T, tx pgx.Tx) {
			tag, err := tx.Exec(ctx, "UPDATE restaurant_availability SET revision = revision + 1 WHERE organization_id = $1", org)
			if err != nil || tag.RowsAffected() != 1 {
				t.Fatalf("matching update affected %d rows: %v", tag.RowsAffected(), err)
			}
			if updated := snapshot(t, tx, org); updated == "" || updated == before {
				t.Fatal("matching organization cannot see its update")
			}
			_, err = tx.Exec(ctx, "DELETE FROM restaurant_availability WHERE organization_id = $1", org)
			expectDenied(t, err)
		})
	})
	run(t, org, func(t *testing.T, tx pgx.Tx) {
		if snapshot(t, tx, org) != before {
			t.Fatal("availability fixture changed after rollback")
		}
	})
	run(t, other, func(t *testing.T, tx pgx.Tx) {
		if snapshot(t, tx, other) != "" {
			t.Fatal("new availability survived rollback")
		}
	})
}

func verifyAvailabilityHTTP(t *testing.T, auth identity.Handler, orgs *organization.Service, owner, manager, foreignOwner, primaryOnly testsupport.MFASession, org string) {
	t.Helper()
	router := chi.NewRouter()
	organization.Handler{Service: orgs, Authentication: auth}.Routes(router, restaurant.Handler{Service: &restaurant.Service{Organization: orgs}}.TenantRoutes)
	type response struct {
		Data  *restaurant.AvailabilitySettings `json:"data"`
		Error struct{ Code string }            `json:"error"`
	}
	call := func(t *testing.T, method, token, csrf string, body []byte, wantStatus int, wantCode string) response {
		t.Helper()
		req := httptest.NewRequest(method, "/organizations/"+org+"/restaurant/availability", bytes.NewReader(body))
		req.Header.Set("Origin", testsupport.MFAOrigin)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-CSRF-Token", csrf)
		if token != "" {
			req.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		var data response
		err := json.Unmarshal(rec.Body.Bytes(), &data)
		if err != nil || rec.Code != wantStatus || data.Error.Code != wantCode || (data.Data != nil) != (wantStatus == 200) {
			t.Fatalf("%s status=%d code=%q hasData=%t decode=%v", method, rec.Code, data.Error.Code, data.Data != nil, err)
		}
		if rec.Header().Get("Cache-Control") != "no-store" {
			t.Fatal("availability response must not be cached")
		}
		return data
	}
	call(t, http.MethodGet, "", "", nil, 401, "UNAUTHENTICATED")
	call(t, http.MethodGet, manager.Token, "", nil, 403, "FORBIDDEN")
	call(t, http.MethodGet, primaryOnly.Token, "", nil, 403, "MFA_REQUIRED")
	current := call(t, http.MethodGet, owner.Token, "", nil, 200, "").Data
	current.GlobalPause = !current.GlobalPause
	body, err := json.Marshal(current)
	if err != nil {
		t.Fatal(err)
	}
	call(t, http.MethodPut, owner.Token, "", body, 403, "INVALID_CSRF")
	call(t, http.MethodPut, owner.Token, owner.CSRF, []byte("{}"), 400, "INVALID_INPUT")
	call(t, http.MethodPut, primaryOnly.Token, primaryOnly.CSRF, body, 403, "MFA_REQUIRED")
	saved := call(t, http.MethodPut, owner.Token, owner.CSRF, body, 200, "").Data
	if saved.Revision != current.Revision+1 || saved.GlobalPause != current.GlobalPause {
		t.Fatalf("saved availability differs: %+v", saved)
	}
	call(t, http.MethodPut, owner.Token, owner.CSRF, body, 409, "CONFLICT")
	got := call(t, http.MethodGet, owner.Token, "", nil, 200, "").Data
	if !reflect.DeepEqual(got, saved) {
		t.Fatalf("round trip differs: %+v", got)
	}
	t.Run("foreign Owner cannot read or change availability", func(t *testing.T) {
		service := &restaurant.Service{Organization: orgs}
		ownerID := identity.SessionFromContext(owner.Context).User.ID
		assertAvailabilityAudits(t, owner.Context, service, ownerID, org, saved.Revision)
		update := *saved
		update.GlobalPause = !update.GlobalPause
		currentBody, err := json.Marshal(update)
		if err != nil {
			t.Fatal(err)
		}
		call(t, http.MethodGet, foreignOwner.Token, "", nil, 404, "NOT_FOUND")
		call(t, http.MethodPut, foreignOwner.Token, foreignOwner.CSRF, currentBody, 404, "NOT_FOUND")
		const key = "dc474d6d-00d3-4107-8097-c3876db8b815"
		foreignID := identity.SessionFromContext(foreignOwner.Context).User.ID
		if result, err := service.RestoreAvailabilitySettings(foreignOwner.Context, foreignID, org, key, 1, 1); !errors.Is(err, organization.ErrNotFound) || !reflect.DeepEqual(result, restaurant.AvailabilitySettings{}) {
			t.Fatalf("foreign Owner restore: %+v, %v", result, err)
		}
		primaryCtx := testsupport.Authenticate(t, owner.Context, auth, primaryOnly.Token)
		if result, err := service.RestoreAvailabilitySettings(primaryCtx, ownerID, org, key, 1, 1); !errors.Is(err, identity.ErrMFARequired) || !reflect.DeepEqual(result, restaurant.AvailabilitySettings{}) {
			t.Fatalf("Owner without MFA restore: %+v, %v", result, err)
		}
		current := call(t, http.MethodGet, owner.Token, "", nil, 200, "").Data
		if !reflect.DeepEqual(current, saved) {
			t.Fatal("foreign Owner changed saved availability")
		}
		assertAvailabilityAudits(t, owner.Context, service, ownerID, org, saved.Revision)
	})
}

func verifyAvailabilitySettings(t *testing.T, ctx, guestCtx context.Context, service *restaurant.Service, owner, guest, org string) {
	t.Helper()
	history := func(t *testing.T, before, after restaurant.AvailabilitySettings) (int64, bool) {
		t.Helper()
		tx, _, err := service.Organization.Authorized(ctx, owner, org, "organization.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		oldState, err := json.Marshal(map[string]any{"ordering_availability": before})
		if err != nil {
			t.Fatal(err)
		}
		newState, err := json.Marshal(map[string]any{"ordering_availability": after})
		if err != nil {
			t.Fatal(err)
		}
		var revision int64
		var matches bool
		err = tx.QueryRow(ctx, `SELECT COALESCE(max(revision),0),
			COALESCE(bool_or(actor_id=$2 AND before_state=$3::jsonb AND after_state=$4::jsonb AND created_at IS NOT NULL),false)
			FROM restaurant_menu_revisions WHERE organization_id=$1`, org, owner, oldState, newState).Scan(&revision, &matches)
		if err != nil {
			t.Fatal(err)
		}
		return revision, matches
	}
	initial, err := service.AvailabilitySettings(ctx, owner, org)
	if err != nil || initial.Revision != 0 || initial.Timezone != "Asia/Bangkok" || initial.WeeklyWindows == nil || len(initial.WeeklyWindows) != 0 {
		t.Fatalf("initial availability: %+v, %v", initial, err)
	}
	input := restaurant.AvailabilitySettings{
		Timezone: "Asia/Bangkok", PickupPaused: true,
		WeeklyWindows: []restaurant.AvailabilityWindow{{Weekday: 1, Start: "09:00", End: "18:00"}},
	}
	if _, err := service.SaveAvailabilitySettings(guestCtx, guest, org, input); !errors.Is(err, organization.ErrDenied) {
		t.Fatalf("non-owner save: %v", err)
	}
	baseRevision, _ := history(t, initial, input)
	saved, err := service.SaveAvailabilitySettings(ctx, owner, org, input)
	if err != nil || saved.Revision != 1 || !saved.PickupPaused {
		t.Fatalf("first save: %+v, %v", saved, err)
	}
	if revision, matches := history(t, initial, saved); revision != baseRevision+1 || !matches {
		t.Fatalf("availability save did not append its before/after state: revision=%d base=%d matches=%t", revision, baseRevision, matches)
	}
	if _, err := service.SaveAvailabilitySettings(ctx, owner, org, input); !errors.Is(err, restaurant.ErrConflict) {
		t.Fatalf("stale save: %v", err)
	}
	saved.PickupPaused = false
	saved.GlobalPause = true
	next, err := service.SaveAvailabilitySettings(ctx, owner, org, saved)
	if err != nil || next.Revision != 2 {
		t.Fatalf("second save: %+v, %v", next, err)
	}
	read, err := service.AvailabilitySettings(ctx, owner, org)
	if err != nil || read.Revision != 2 || read.PickupPaused || !read.GlobalPause || len(read.WeeklyWindows) != 1 || read.WeeklyWindows[0] != input.WeeklyWindows[0] {
		t.Fatalf("read after save: %+v, %v", read, err)
	}
	assertAvailabilityAudits(t, ctx, service, owner, org, 2)
	t.Run("concurrent_writers", func(t *testing.T) {
		baseRevision, _ := history(t, read, read)
		raceCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
		defer cancel()
		type result struct {
			value restaurant.AvailabilitySettings
			err   error
		}
		start := make(chan struct{})
		results := make(chan result, 2)
		first, second := read, read
		first.PickupPaused = true
		second.TakeawayPaused = true
		for _, update := range []restaurant.AvailabilitySettings{first, second} {
			go func() {
				<-start
				value, err := service.SaveAvailabilitySettings(raceCtx, owner, org, update)
				results <- result{value, err}
			}()
		}
		close(start)
		var winner restaurant.AvailabilitySettings
		var commits, conflicts int
		for range 2 {
			select {
			case <-raceCtx.Done():
				t.Fatal(raceCtx.Err())
			case got := <-results:
				switch {
				case got.err == nil:
					commits++
					winner = got.value
				case errors.Is(got.err, restaurant.ErrConflict):
					conflicts++
				default:
					t.Fatal(got.err)
				}
			}
		}
		if commits != 1 || conflicts != 1 || winner.Revision != read.Revision+1 || winner.PickupPaused == winner.TakeawayPaused {
			t.Fatalf("unexpected race: commits=%d conflicts=%d winner=%+v", commits, conflicts, winner)
		}
		stored, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil || !reflect.DeepEqual(stored, winner) {
			t.Fatalf("stored race winner: %+v, %v", stored, err)
		}
		if revision, matches := history(t, read, winner); revision != baseRevision+1 || !matches {
			t.Fatalf("availability race did not record exactly the winner: revision=%d base=%d matches=%t", revision, baseRevision, matches)
		}
		assertAvailabilityAudits(t, ctx, service, owner, org, 3)
	})
	t.Run("unchanged_settings_do_not_change_menu_revision", func(t *testing.T) {
		before, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil {
			t.Fatal(err)
		}
		baseRevision, _ := history(t, before, before)
		saved, err := service.SaveAvailabilitySettings(ctx, owner, org, before)
		expected := before
		expected.Revision++
		if err != nil || !reflect.DeepEqual(saved, expected) {
			t.Fatalf("unchanged save did not preserve settings and advance the settings revision: %v", err)
		}
		if revision, _ := history(t, before, saved); revision != baseRevision {
			t.Fatalf("unchanged availability advanced the menu revision: got %d, want %d", revision, baseRevision)
		}
		assertAvailabilityAudits(t, ctx, service, owner, org, saved.Revision)
	})
	t.Run("audit_rollback", func(t *testing.T) {
		before, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil {
			t.Fatal(err)
		}
		update := before
		update.GlobalPause = !before.GlobalPause
		baseRevision, _ := history(t, before, update)
		// PostgreSQL rejects NUL in text. Only the audit insert uses this fixture value.
		badAudit := organization.WithRequestID(ctx, "fixture\x00audit")
		result, err := service.SaveAvailabilitySettings(badAudit, owner, org, update)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "22021" || !reflect.DeepEqual(result, restaurant.AvailabilitySettings{}) {
			t.Fatalf("forced audit failure: %+v, %v", result, err)
		}
		stored, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil || !reflect.DeepEqual(stored, before) {
			t.Fatalf("audit failure changed settings: %+v, %v", stored, err)
		}
		if revision, _ := history(t, before, update); revision != baseRevision {
			t.Fatalf("audit failure committed an availability history revision: got %d, want %d", revision, baseRevision)
		}
		assertAvailabilityAudits(t, ctx, service, owner, org, before.Revision)
		saved, err := service.SaveAvailabilitySettings(ctx, owner, org, update)
		if err != nil || saved.Revision != before.Revision+1 || saved.GlobalPause != update.GlobalPause {
			t.Fatalf("retry after rollback: %+v, %v", saved, err)
		}
		assertAvailabilityAudits(t, ctx, service, owner, org, saved.Revision)
	})
	t.Run("session_expires_at_audit", func(t *testing.T) {
		before, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil {
			t.Fatal(err)
		}
		update := before
		update.GlobalPause = !before.GlobalPause
		verifyPrivateWriteAuditWait(t, ctx, service.Organization.Pool, testsupport.MFASession{Context: ctx}, true,
			func(traced *storefront.Service, request context.Context) (any, error) {
				return (&restaurant.Service{Organization: traced.Organization}).SaveAvailabilitySettings(request, owner, org, update)
			})
		stored, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil || !reflect.DeepEqual(stored, before) {
			t.Fatalf("session expiry changed availability: %+v, %v", stored, err)
		}
		assertAvailabilityAudits(t, ctx, service, owner, org, before.Revision)
	})
	t.Run("open_hours_do_not_publish_draft", func(t *testing.T) {
		before, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil {
			t.Fatal(err)
		}
		open := restaurant.AvailabilitySettings{Timezone: "Asia/Bangkok", Revision: before.Revision}
		for day := 1; day <= 7; day++ {
			open.WeeklyWindows = append(open.WeeklyWindows, restaurant.AvailabilityWindow{Weekday: day, Start: "00:00", End: "24:00"})
		}
		saved, err := service.SaveAvailabilitySettings(ctx, owner, org, open)
		if err != nil || saved.Revision != before.Revision+1 {
			t.Fatalf("save open schedule: revision=%d, err=%v", saved.Revision, err)
		}
		shop := &storefront.Service{Organization: service.Organization}
		draft, err := shop.Settings(ctx, owner, org)
		if err != nil || draft == nil || draft.Published || draft.AcceptingOrders {
			t.Fatalf("saving an open schedule changed the draft's publication: %v", err)
		}
		directory, err := shop.Directory(ctx)
		if err != nil || bytes.Contains(directory, []byte(draft.Slug)) {
			t.Fatalf("draft appeared in the public directory after saving open hours: %v", err)
		}
		items := []storefront.ItemInput{{VariantID: "11111111-1111-4111-8111-111111111111", Quantity: "1"}}
		if _, err := shop.Quote(ctx, draft.Slug, storefront.QuoteInput{Fulfillment: "PICKUP", Items: items}); !errors.Is(err, storefront.ErrNotFound) {
			t.Fatalf("legacy public quote accepted an unpublished draft: %v", err)
		}
		order, err := shop.CreateOrder(ctx, draft.Slug, "11111111-1111-4111-8111-111111111111", storefront.OrderInput{
			Fulfillment: "PICKUP", Items: items, QuoteID: strings.Repeat("a", 64),
			CustomerName: "Synthetic customer", ContactPhone: "0000000000", AccessToken: strings.Repeat("b", 64),
		})
		if !errors.Is(err, storefront.ErrNotFound) || !reflect.DeepEqual(order, storefront.Order{}) {
			t.Fatalf("public order did not deny an unpublished draft: %v", err)
		}
		auth, err := service.Organization.AuthorizeMFA(ctx, owner, org, "organization.update")
		if err != nil {
			t.Fatal(err)
		}
		defer auth.Tx.Rollback(ctx)
		var orders, attempts int
		err = auth.Tx.QueryRow(ctx, `SELECT
			(SELECT count(*) FROM online_orders WHERE organization_id=$1),
			(SELECT count(*) FROM online_payment_attempts WHERE organization_id=$1)`, org).Scan(&orders, &attempts)
		if err != nil || orders != 0 || attempts != 0 {
			t.Fatalf("draft has orders=%d or attempts=%d, err=%v", orders, attempts, err)
		}
	})
	t.Run("pause_serializes_with_admission", func(t *testing.T) {
		verifyAvailabilityAdmissionRace(t, ctx, service, owner, org)
	})
	t.Run("restore_availability_appends_revision", func(t *testing.T) {
		before, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil {
			t.Fatal(err)
		}
		base, _ := history(t, before, before)
		const key = "476a655d-8c46-4660-bcbf-581d84ec970f"
		source := baseRevision + 1 // First saved settings, with Pickup paused.
		restore := func(ctx context.Context, actor string, target, expected int64) (restaurant.AvailabilitySettings, error) {
			return service.RestoreAvailabilitySettings(ctx, actor, org, key, target, expected)
		}
		if result, err := restore(guestCtx, guest, source, base); !errors.Is(err, organization.ErrDenied) || !reflect.DeepEqual(result, restaurant.AvailabilitySettings{}) {
			t.Fatalf("non-owner restore: %+v, %v", result, err)
		}
		if _, err := restore(ctx, owner, source, base-1); !errors.Is(err, restaurant.ErrConflict) {
			t.Fatalf("stale restore: %v", err)
		}
		if _, err := restore(ctx, owner, base+1, base); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("missing restore source: %v", err)
		}
		if _, err := restore(organization.WithRequestID(ctx, "fixture\x00restore"), owner, source, base); err == nil {
			t.Fatal("restore committed despite audit failure")
		}
		interrupt := func(t *testing.T, query string) {
			t.Helper()
			catalogReadInterrupted(t, ctx, service.Organization.Pool, testsupport.MFASession{Context: ctx}, query, 1, false,
				func(request context.Context, traced *catalog.Service) (any, error) {
					return (&restaurant.Service{Organization: traced.Organization}).RestoreAvailabilitySettings(request, owner, org, key, source, base)
				}, true)
		}
		t.Run("session_expires_after_restore_audit", func(t *testing.T) {
			interrupt(t, "INSERT INTO organization_audit_events")
			tx, _, err := service.Organization.Authorized(ctx, owner, org, "organization.read")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var saved, audits int
			err = tx.QueryRow(ctx, `SELECT
				(SELECT count(*) FROM restaurant_menu_revisions WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3),
				(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1 AND event_type='RESTAURANT_AVAILABILITY_RESTORED')`,
				org, owner, key).Scan(&saved, &audits)
			if err != nil || saved != 0 || audits != 0 {
				t.Fatalf("expired restore persisted replay=%d audit=%d: %v", saved, audits, err)
			}
		})
		if t.Failed() {
			return
		}
		unchanged, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil || !reflect.DeepEqual(unchanged, before) {
			t.Fatalf("failed restore changed settings: %+v, %v", unchanged, err)
		}
		if latest, _ := history(t, before, before); latest != base {
			t.Fatalf("failed restore advanced history to %d", latest)
		}
		want := input
		want.Revision = before.Revision + 1
		t.Run("concurrent_same_key_restore", func(t *testing.T) {
			request, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			type outcome struct {
				settings restaurant.AvailabilitySettings
				err      error
			}
			start := make(chan struct{})
			ready := make(chan struct{}, 2)
			results := make(chan outcome, 2)
			for range 2 {
				go func() {
					ready <- struct{}{}
					<-start
					settings, err := restore(request, owner, source, base)
					results <- outcome{settings, err}
				}()
			}
			<-ready
			<-ready
			close(start)
			for range 2 {
				got := <-results
				if got.err != nil || !reflect.DeepEqual(got.settings, want) {
					t.Errorf("concurrent restore: %+v, want %+v, err=%v", got.settings, want, got.err)
				}
			}
		})
		if t.Failed() {
			return
		}
		stored, err := service.AvailabilitySettings(ctx, owner, org)
		if err != nil || !reflect.DeepEqual(stored, want) {
			t.Fatalf("persisted restore: %+v, %v", stored, err)
		}
		t.Run("session_expires_after_restore_replay_lookup", func(t *testing.T) {
			interrupt(t, "SELECT fingerprint,after_state FROM restaurant_menu_revisions")
		})
		if t.Failed() {
			return
		}
		if replay, err := restore(ctx, owner, source, base); err != nil || !reflect.DeepEqual(replay, want) {
			t.Fatalf("restore replay: %+v, %v", replay, err)
		}
		if _, err := restore(ctx, owner, source+1, base); !errors.Is(err, restaurant.ErrConflict) {
			t.Fatalf("changed restore replay: %v", err)
		}
		if latest, _ := history(t, before, want); latest != base+1 {
			t.Fatalf("restore/replay advanced history to %d, want %d", latest, base+1)
		}
		if _, intact := history(t, initial, restaurant.AvailabilitySettings{
			Timezone: input.Timezone, WeeklyWindows: input.WeeklyWindows, PickupPaused: true, Revision: 1,
		}); !intact {
			t.Fatal("restore changed its source revision")
		}
		beforeJSON, err := json.Marshal(before)
		if err != nil {
			t.Fatal(err)
		}
		afterJSON, err := json.Marshal(want)
		if err != nil {
			t.Fatal(err)
		}
		tx, _, err := service.Organization.Authorized(ctx, owner, org, "organization.read")
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var matches bool
		var audits int
		err = tx.QueryRow(ctx, `SELECT actor_id=$3 AND idempotency_key=$4
			AND before_state->'ordering_availability'=$5::jsonb
			AND after_state->'ordering_availability'=$6::jsonb
			AND after_state->'restored_from_revision'=to_jsonb($7::bigint),
			(SELECT count(*) FROM organization_audit_events
			 WHERE organization_id=$1 AND event_type='RESTAURANT_AVAILABILITY_RESTORED')
			FROM restaurant_menu_revisions WHERE organization_id=$1 AND revision=$2`,
			org, base+1, owner, key, beforeJSON, afterJSON, source).Scan(&matches, &audits)
		if err != nil || !matches || audits != 1 {
			t.Fatalf("restore history or audit: match=%t, audits=%d, err=%v", matches, audits, err)
		}
		if err := tx.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		t.Run("concurrent_distinct_keys_at_same_revision", func(t *testing.T) {
			request, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			keys := [2]string{"476a655d-8c46-4660-bcbf-581d84ec9710", "476a655d-8c46-4660-bcbf-581d84ec9711"}
			type outcome struct {
				key      string
				settings restaurant.AvailabilitySettings
				err      error
			}
			ready, start := make(chan struct{}, 2), make(chan struct{})
			results := make(chan outcome, 2)
			for _, key := range keys {
				go func() {
					ready <- struct{}{}
					<-start
					settings, err := service.RestoreAvailabilitySettings(request, owner, org, key, source, base+1)
					results <- outcome{key, settings, err}
				}()
			}
			<-ready
			<-ready
			close(start)
			expected := want
			expected.Revision++
			var winner, loser string
			for range keys {
				got := <-results
				switch {
				case got.err == nil && reflect.DeepEqual(got.settings, expected):
					winner = got.key
				case errors.Is(got.err, restaurant.ErrConflict) && reflect.DeepEqual(got.settings, restaurant.AvailabilitySettings{}):
					loser = got.key
				default:
					t.Errorf("competing restore: settings=%+v err=%v", got.settings, got.err)
				}
			}
			if winner == "" || loser == "" {
				t.Fatal("expected one successful restore and one stale revision conflict")
			}
			stored, err := service.AvailabilitySettings(ctx, owner, org)
			if err != nil || !reflect.DeepEqual(stored, expected) {
				t.Fatalf("competing restores persisted %+v, want %+v: %v", stored, expected, err)
			}
			tx, _, err := service.Organization.Authorized(ctx, owner, org, "organization.read")
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var latest int64
			var winnerRows, loserRows, auditRows int
			err = tx.QueryRow(ctx, `SELECT max(revision),
				count(*) FILTER (WHERE revision=$2 AND actor_id=$3 AND idempotency_key=$4),
				count(*) FILTER (WHERE actor_id=$3 AND idempotency_key=$5),
				(SELECT count(*) FROM organization_audit_events WHERE organization_id=$1
				 AND event_type='RESTAURANT_AVAILABILITY_RESTORED')
				FROM restaurant_menu_revisions WHERE organization_id=$1`,
				org, base+2, owner, winner, loser).Scan(&latest, &winnerRows, &loserRows, &auditRows)
			if err != nil || latest != base+2 || winnerRows != 1 || loserRows != 0 || auditRows != 2 {
				t.Fatalf("competing restores: revision=%d winner=%d loser=%d audits=%d err=%v", latest, winnerRows, loserRows, auditRows, err)
			}
		})
	})
}

func verifyAvailabilityAdmissionRace(t *testing.T, ctx context.Context, service *restaurant.Service, owner, org string) {
	t.Helper()
	pool := service.Organization.Pool
	for _, pauseFirst := range []bool{false, true} {
		name := "admission_first"
		if pauseFirst {
			name = "pause_first"
		}
		t.Run(name, func(t *testing.T) {
			request, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			current, err := service.AvailabilitySettings(request, owner, org)
			if err != nil {
				t.Fatal(err)
			}
			if current.GlobalPause {
				current.GlobalPause = false
				current, err = service.SaveAvailabilitySettings(request, owner, org, current)
				if err != nil {
					t.Fatal(err)
				}
			}
			pause := current
			pause.GlobalPause = true
			writer := service
			var trace *privateReadTrace
			if pauseFirst {
				trace = &privateReadTrace{prefix: "INSERT INTO organization_audit_events", remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
				config := pool.Config()
				config.ConnConfig.Tracer = trace
				tracedPool, err := pgxpool.NewWithConfig(request, config)
				if err != nil {
					t.Fatal(err)
				}
				defer func() {
					cancel()
					tracedPool.Close()
				}()
				writer = &restaurant.Service{Organization: &organization.Service{Pool: tracedPool}}
			}
			tx, err := pool.Begin(request)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			var pid int32
			if err = tx.QueryRow(request, "SELECT pg_backend_pid(),set_config('app.organization_id',$1,true)", org).Scan(&pid, new(string)); err != nil {
				t.Fatal(err)
			}
			lock := func() error {
				var id string
				return tx.QueryRow(request, "SELECT id FROM organizations WHERE id=$1 AND status='ACTIVE' FOR UPDATE", org).Scan(&id)
			}
			check := func(want string) {
				t.Helper()
				got, err := restaurant.CheckLockedOrderAdmission(request, tx, org, "TAKEAWAY", true, time.Now())
				if err != nil || got != want {
					t.Fatalf("admission = %q, %v; want %q", got, err, want)
				}
			}
			paused := make(chan error, 1)
			startPause := func() {
				go func() {
					saved, err := writer.SaveAvailabilitySettings(request, owner, org, pause)
					if err == nil && (!saved.GlobalPause || saved.Revision != current.Revision+1) {
						err = errors.New("pause did not commit its next revision")
					}
					paused <- err
				}()
			}
			await := func(result <-chan error) {
				t.Helper()
				select {
				case err := <-result:
					if err != nil {
						t.Fatal(err)
					}
				case <-request.Done():
					t.Fatal(request.Err())
				}
			}
			waitBlocked := func(query string) {
				t.Helper()
				for {
					var waiting bool
					if err := pool.QueryRow(request, query, pid).Scan(&waiting); err != nil {
						t.Fatal(err)
					}
					if waiting {
						return
					}
					select {
					case <-request.Done():
						t.Fatal(request.Err())
					case <-time.After(10 * time.Millisecond):
					}
				}
			}
			if pauseFirst {
				startPause()
				select {
				case <-trace.arrived:
				case <-request.Done():
					t.Fatal("pause did not reach audit while holding the restaurant lock")
				}
				locked := make(chan error, 1)
				lockDone := make(chan struct{})
				go func() {
					defer close(lockDone)
					locked <- lock()
				}()
				defer func() {
					cancel()
					<-lockDone
				}()
				// Wait for the database to observe this connection blocked before letting the pause commit.
				waitBlocked("SELECT cardinality(pg_blocking_pids($1)) > 0")
				close(trace.release)
				await(paused)
				await(locked)
				check("PAUSED")
			} else {
				if err = lock(); err != nil {
					t.Fatal(err)
				}
				startPause()
				waitBlocked("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)))")
				check("")
				if err = tx.Commit(request); err != nil {
					t.Fatal(err)
				}
				await(paused)
			}
		})
	}
}

func assertAvailabilityAudits(t *testing.T, ctx context.Context, service *restaurant.Service, owner, org string, want int64) {
	t.Helper()
	auth, err := service.Organization.AuthorizeMFA(ctx, owner, org, "organization.update")
	if err != nil {
		t.Fatal(err)
	}
	defer auth.Tx.Rollback(ctx)
	var count int64
	err = auth.Tx.QueryRow(ctx, `SELECT count(*) FROM organization_audit_events
		WHERE organization_id=$1 AND object_id=$1 AND actor_id=$2
		AND event_type IN ('RESTAURANT_AVAILABILITY_UPDATED','RESTAURANT_AVAILABILITY_RESTORED')`, org, owner).Scan(&count)
	if err != nil || count != want {
		t.Fatalf("availability audit count = %d, want %d, err = %v", count, want, err)
	}
}
