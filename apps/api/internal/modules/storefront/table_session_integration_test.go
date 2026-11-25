package storefront_test

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

// verifyNativeTableSessions covers the internal Dine-in session layer on an
// editable branchless restaurant whose table has an issued QR, and a second
// restaurant with a table of the same code. tables is the restaurant's current
// table setup; the test restores QR state with a final rotation and returns
// the table's QR in force afterwards.
func verifyNativeTableSessions(t *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, tables restaurant.SetupTablesInput, table restaurant.IssuedTableQRToken, other string, otherQR restaurant.IssuedTableQRToken) restaurant.IssuedTableQRToken {
	t.Helper()
	pool := organizations.Pool
	setup := &restaurant.Service{Organization: organizations}
	// scoped mirrors the public storefront transaction: organization scope only.
	scoped := func(t *testing.T, restaurantID string, lock bool) pgx.Tx {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { tx.Rollback(ctx) })
		// Fail fast on an unexpected lock wait instead of stalling the suite.
		if _, err = tx.Exec(ctx, "SET LOCAL lock_timeout='10s'"); err != nil {
			t.Fatal(err)
		}
		if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", restaurantID); err != nil {
			t.Fatal(err)
		}
		query := "SELECT id::text FROM organizations WHERE id=$1 AND status='ACTIVE'"
		if lock {
			query += " FOR UPDATE"
		}
		var id string
		if err = tx.QueryRow(ctx, query, restaurantID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		return tx
	}
	start := func(t *testing.T, restaurantID, qr string) (restaurant.StartedTableSession, error) {
		t.Helper()
		tx := scoped(t, restaurantID, true)
		// Release the organization lock immediately on every path.
		defer tx.Rollback(ctx)
		session, err := restaurant.StartLockedTableSession(ctx, tx, restaurantID, qr, true)
		if err != nil {
			return session, err
		}
		return session, tx.Commit(ctx)
	}
	read := func(t *testing.T, restaurantID, proof string) (restaurant.TableSession, error) {
		t.Helper()
		tx := scoped(t, restaurantID, false)
		defer tx.Rollback(ctx)
		return restaurant.ReadTableSession(ctx, tx, restaurantID, proof)
	}
	end := func(t *testing.T, restaurantID, proof string) error {
		t.Helper()
		tx := scoped(t, restaurantID, false)
		defer tx.Rollback(ctx)
		if err := restaurant.EndTableSession(ctx, tx, restaurantID, proof); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	type row struct{ status, reason, created, expires string }
	stored := func(t *testing.T, restaurantID string) map[string]row {
		t.Helper()
		tx := scoped(t, restaurantID, false)
		defer tx.Rollback(ctx)
		rows, err := tx.Query(ctx, `SELECT proof_digest,status,COALESCE(end_reason,''),created_at::text,expires_at::text
			FROM restaurant_table_sessions WHERE organization_id=$1`, restaurantID)
		if err != nil {
			t.Fatal(err)
		}
		result := map[string]row{}
		for rows.Next() {
			var digest string
			var value row
			if err = rows.Scan(&digest, &value.status, &value.reason, &value.created, &value.expires); err != nil {
				t.Fatal(err)
			}
			result[digest] = value
		}
		if err = rows.Err(); err != nil {
			t.Fatal(err)
		}
		return result
	}
	notFound := func(t *testing.T, name string, session restaurant.TableSession, err error) {
		t.Helper()
		if !errors.Is(err, restaurant.ErrNotFound) || session != (restaurant.TableSession{}) {
			t.Fatalf("%s: want not found without data, got %+v %v", name, session, err)
		}
	}
	// Dine-in is enabled by setup; open the schedule so admission is evaluated.
	openAllWeek := func(t *testing.T, restaurantID string) {
		t.Helper()
		tx := scoped(t, restaurantID, true)
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `INSERT INTO restaurant_availability
			(organization_id,timezone,weekly_windows,global_pause,dine_in_paused,takeaway_paused,pickup_paused,delivery_paused,revision,updated_by)
			SELECT $1,'Asia/Bangkok',jsonb_agg(jsonb_build_object('weekday',d,'start','00:00','end','24:00')),false,false,false,false,false,1,$2
			FROM generate_series(1,7) d
			ON CONFLICT (organization_id) DO UPDATE SET weekly_windows=excluded.weekly_windows,global_pause=false,dine_in_paused=false`, restaurantID, owner); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
	}
	openAllWeek(t, org)

	var first, second restaurant.StartedTableSession
	if !t.Run("start issues independent private sessions", func(t *testing.T) {
		var err error
		first, err = start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		second, err = start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		if !restaurant.ValidTableSessionProof(first.Proof) || first.Proof == second.Proof || first.Table.Code != table.Code || first.Table.TableID != "" && first.Table.TableID != table.TableID {
			t.Fatalf("issued sessions: %+v %+v", first.TableSession, second.TableSession)
		}
		lifetime := first.ExpiresAt.Sub(time.Now().UTC())
		if lifetime <= restaurant.TableSessionLifetime-time.Minute || lifetime > restaurant.TableSessionLifetime+time.Minute {
			t.Fatalf("session lifetime %s", lifetime)
		}
		rows := stored(t, org)
		if len(rows) != 2 {
			t.Fatalf("stored sessions: %d", len(rows))
		}
		for digest, value := range rows {
			if strings.Contains(first.Proof+second.Proof, digest) || value.status != "ACTIVE" || value.reason != "" {
				t.Fatalf("stored session state %+v", value)
			}
		}
		for _, session := range []restaurant.StartedTableSession{first, second} {
			got, err := read(t, org, session.Proof)
			if err != nil || got.Table.Code != table.Code || got.Table.Name != session.Table.Name || !got.ExpiresAt.Equal(session.ExpiresAt) || got.Table.TableID != "" {
				t.Fatalf("read own session: %+v %v", got, err)
			}
		}
	}) {
		t.FailNow()
	}
	t.Run("start timestamps use one instant", func(t *testing.T) {
		// The CHECK requires expires_at = created_at + 2h exactly.
		for attempt := 0; attempt < 20; attempt++ {
			if _, err := start(t, org, table.QRToken); err != nil {
				t.Fatalf("start %d: %v", attempt, err)
			}
		}
		tx := scoped(t, org, false)
		defer tx.Rollback(ctx)
		var mismatched int
		if err := tx.QueryRow(ctx, "SELECT count(*) FROM restaurant_table_sessions WHERE organization_id=$1 AND expires_at<>created_at+interval '2 hours'", org).Scan(&mismatched); err != nil || mismatched != 0 {
			t.Fatalf("mismatched lifetimes=%d err=%v", mismatched, err)
		}
	})
	t.Run("start denials create no session", func(t *testing.T) {
		before := stored(t, org)
		for name, qr := range map[string]string{
			"malformed":      "not-a-qr",
			"unknown":        strings.Repeat("0", 64),
			"foreign":        otherQR.QRToken,
			"session proof":  first.Proof,
			"uppercase hash": strings.ToUpper(table.QRToken),
		} {
			if _, err := start(t, org, qr); !errors.Is(err, restaurant.ErrNotFound) {
				t.Fatalf("%s QR started a session: %v", name, err)
			}
		}
		denied := func(name, statement string, canSell bool) {
			t.Helper()
			tx := scoped(t, org, true)
			defer tx.Rollback(ctx)
			if statement != "" {
				if _, err := tx.Exec(ctx, statement, org); err != nil {
					t.Fatalf("%s fixture: %v", name, err)
				}
			}
			if _, err := restaurant.StartLockedTableSession(ctx, tx, org, table.QRToken, canSell); !errors.Is(err, restaurant.ErrClosed) {
				t.Fatalf("%s admitted Dine-in: %v", name, err)
			}
		}
		denied("unsellable restaurant", "", false)
		for name, statement := range map[string]string{
			"dine-in paused":   "UPDATE restaurant_availability SET dine_in_paused=true WHERE organization_id=$1",
			"global pause":     "UPDATE restaurant_availability SET global_pause=true WHERE organization_id=$1",
			"dine-in disabled": "UPDATE restaurant_profiles SET dine_in=false,takeaway=true WHERE organization_id=$1",
			"closed hours":     "UPDATE restaurant_availability SET weekly_windows='[]' WHERE organization_id=$1",
		} {
			denied(name, statement, true)
		}
		if after := stored(t, org); len(after) != len(before) {
			t.Fatalf("denied starts stored sessions: %d -> %d", len(before), len(after))
		}
	})
	t.Run("proof is scoped to its restaurant", func(t *testing.T) {
		openAllWeek(t, other)
		foreign, err := start(t, other, otherQR.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		if foreign.Table.Code != table.Code {
			t.Fatal("fixture requires the same table code in both restaurants")
		}
		got, err := read(t, org, foreign.Proof)
		notFound(t, "foreign proof", got, err)
		got, err = read(t, other, first.Proof)
		notFound(t, "proof read in another restaurant", got, err)
		if err = end(t, org, foreign.Proof); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("foreign proof ended a session: %v", err)
		}
		// Even without the RLS scope guard, the predicate binds the addressed org.
		tx := scoped(t, other, false)
		got, err = restaurant.ReadTableSession(ctx, tx, org, first.Proof)
		tx.Rollback(ctx)
		notFound(t, "mismatched scope", got, err)
		if got, err = read(t, other, foreign.Proof); err != nil || got.Table.Code != table.Code {
			t.Fatalf("own foreign session: %+v %v", got, err)
		}
	})
	t.Run("malformed and unknown proofs", func(t *testing.T) {
		for name, proof := range map[string]string{
			"empty":    "",
			"qr token": table.QRToken,
			"padded":   first.Proof[:42] + "=",
			"unknown":  strings.Repeat("A", 43),
		} {
			got, err := read(t, org, proof)
			notFound(t, name, got, err)
			if err = end(t, org, proof); !errors.Is(err, restaurant.ErrNotFound) {
				t.Fatalf("%s proof ended a session: %v", name, err)
			}
		}
	})
	t.Run("end affects only the selected session", func(t *testing.T) {
		if err := end(t, org, first.Proof); err != nil {
			t.Fatal(err)
		}
		got, err := read(t, org, first.Proof)
		notFound(t, "ended proof", got, err)
		if err = end(t, org, first.Proof); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("second end: %v", err)
		}
		if got, err = read(t, org, second.Proof); err != nil || got.Table.Code != table.Code {
			t.Fatalf("other session at the table changed: %+v %v", got, err)
		}
		digest, ok := restaurant.TableSessionProofDigest(first.Proof)
		if !ok || stored(t, org)[digest].status != "ENDED" || stored(t, org)[digest].reason != "CUSTOMER" {
			t.Fatal("ended session row not recorded with reason CUSTOMER")
		}
	})
	expire := func(t *testing.T, proof string) string {
		t.Helper()
		digest, ok := restaurant.TableSessionProofDigest(proof)
		if !ok {
			t.Fatal("invalid issued proof")
		}
		// Shift the whole lifetime into the past, keeping the exact 2-hour CHECK.
		tx := scoped(t, org, true)
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, `UPDATE restaurant_table_sessions SET created_at=created_at-interval '3 hours',expires_at=expires_at-interval '3 hours'
			WHERE organization_id=$1 AND proof_digest=$2`, org, digest); err != nil {
			t.Fatal(err)
		}
		if err := tx.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		return digest
	}
	t.Run("expired proof is unusable", func(t *testing.T) {
		expiring, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		expire(t, expiring.Proof)
		got, err := read(t, org, expiring.Proof)
		notFound(t, "expired proof", got, err)
		if err = end(t, org, expiring.Proof); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("expired proof ended: %v", err)
		}
	})
	digestOf := func(t *testing.T, proof string) string {
		t.Helper()
		digest, ok := restaurant.TableSessionProofDigest(proof)
		if !ok {
			t.Fatal("invalid issued proof")
		}
		return digest
	}
	key := 0
	save := func(t *testing.T, input restaurant.SetupTablesInput) restaurant.SetupState {
		t.Helper()
		key++
		state, err := setup.SaveTables(ctx, owner, org, fmt.Sprintf("a08%05d-1111-4111-8111-111111111111", key), input)
		if err != nil {
			t.Fatal(err)
		}
		return state
	}
	edit := tables
	edit.GenerateQR, edit.QREnabled = false, true
	t.Run("normal enabled edit keeps sessions", func(t *testing.T) {
		live, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		if state := save(t, edit); len(state.IssuedTableQRTokens) != 0 {
			t.Fatal("normal edit issued QR")
		}
		if got, err := read(t, org, live.Proof); err != nil || got.Table.Code != table.Code {
			t.Fatalf("normal edit ended a session: %+v %v", got, err)
		}
	})
	t.Run("QR rotation ends that table's sessions", func(t *testing.T) {
		live, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		stale, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		staleDigest := expire(t, stale.Proof)
		staleBefore := stored(t, org)[staleDigest]
		rotate := tables
		rotate.GenerateQR = true
		state := save(t, rotate)
		if len(state.IssuedTableQRTokens) == 0 {
			t.Fatal("rotation issued no QR")
		}
		for _, issued := range state.IssuedTableQRTokens {
			if issued.Code == table.Code {
				table = issued
			}
		}
		got, err := read(t, org, live.Proof)
		notFound(t, "rotated table session", got, err)
		if value := stored(t, org)[digestOf(t, live.Proof)]; value.status != "ENDED" || value.reason != "QR_ROTATED" {
			t.Fatalf("rotated session row: %+v", value)
		}
		if after := stored(t, org)[staleDigest]; after != staleBefore {
			t.Fatalf("setup changed an expired session: %+v -> %+v", staleBefore, after)
		}
		if _, err = start(t, org, table.QRToken); err != nil {
			t.Fatalf("new QR could not start a session: %v", err)
		}
	})
	t.Run("QR disable ends all open sessions", func(t *testing.T) {
		live, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		disable := tables
		disable.GenerateQR, disable.QREnabled = false, false
		save(t, disable)
		got, err := read(t, org, live.Proof)
		notFound(t, "QR-disabled session", got, err)
		if value := stored(t, org)[digestOf(t, live.Proof)]; value.status != "ENDED" || value.reason != "QR_DISABLED" {
			t.Fatalf("disabled session row: %+v", value)
		}
		if _, err = start(t, org, table.QRToken); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("disabled QR started a session: %v", err)
		}
	})
	// Re-enable with a fresh QR, then close the table by omitting it.
	enable := tables
	enable.GenerateQR = true
	var neighbour restaurant.IssuedTableQRToken
	for _, issued := range save(t, enable).IssuedTableQRTokens {
		if issued.Code == table.Code {
			table = issued
		} else {
			neighbour = issued
		}
	}
	t.Run("closing a table ends its sessions", func(t *testing.T) {
		live, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		var kept restaurant.StartedTableSession
		if neighbour.QRToken != "" {
			if kept, err = start(t, org, neighbour.QRToken); err != nil {
				t.Fatal(err)
			}
		}
		closed := edit
		closed.Tables = nil
		for _, candidate := range edit.Tables {
			if candidate.Code != table.Code {
				closed.Tables = append(closed.Tables, candidate)
			}
		}
		if len(closed.Tables) == len(edit.Tables) {
			t.Fatal("fixture table missing from setup input")
		}
		if len(closed.Tables) == 0 {
			closed.Tables = []restaurant.SetupTableInput{{Code: "SPARE", Name: "Spare table", Seats: 2, ZoneCode: edit.Zones[0].Code}}
		}
		save(t, closed)
		got, err := read(t, org, live.Proof)
		notFound(t, "closed table session", got, err)
		if value := stored(t, org)[digestOf(t, live.Proof)]; value.status != "ENDED" || value.reason != "TABLE_CLOSED" {
			t.Fatalf("closed table session row: %+v", value)
		}
		if _, err = start(t, org, table.QRToken); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("closed table started a session: %v", err)
		}
		if kept.Proof != "" {
			if got, err := read(t, org, kept.Proof); err != nil || got.Table.Code != neighbour.Code {
				t.Fatalf("closing one table ended another table's session: %+v %v", got, err)
			}
		}
	})
	// Reopening a closed table issues a new QR: only active tables keep theirs.
	for _, issued := range save(t, edit).IssuedTableQRTokens {
		if issued.Code == table.Code {
			table = issued
		}
	}
	t.Run("setup and end serialize without the organization lock on end", func(t *testing.T) {
		live, err := start(t, org, table.QRToken)
		if err != nil {
			t.Fatal(err)
		}
		// Hold the organization lock, as Owner setup does, then end with both a
		// fake and the real proof. End must not wait on the organization row.
		holder := scoped(t, org, true)
		defer holder.Rollback(ctx)
		// Goroutines must not call t.Fatal; they report errors on the channel.
		endAsync := func(proof string) error {
			bounded, cancel := context.WithTimeout(ctx, 5*time.Second)
			defer cancel()
			tx, err := pool.Begin(bounded)
			if err != nil {
				return err
			}
			defer tx.Rollback(ctx)
			if _, err = tx.Exec(bounded, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", org); err != nil {
				return err
			}
			if err = restaurant.EndTableSession(bounded, tx, org, proof); err != nil {
				return err
			}
			return tx.Commit(bounded)
		}
		done := make(chan error, 2)
		go func() { done <- endAsync(strings.Repeat("B", 43)) }()
		go func() { done <- endAsync(live.Proof) }()
		results := map[bool]int{}
		for range 2 {
			err := <-done
			if err != nil && !errors.Is(err, restaurant.ErrNotFound) {
				t.Fatalf("end while the organization lock is held: %v", err)
			}
			results[err == nil]++
		}
		if results[true] != 1 || results[false] != 1 {
			t.Fatalf("want one real end and one fake-proof denial, got %v", results)
		}
		if err = holder.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		got, err := read(t, org, live.Proof)
		notFound(t, "ended while locked", got, err)
	})
	t.Run("start serializes with a QR-disabling save", func(t *testing.T) {
		// A start holding the organization lock commits before the save runs,
		// so the save must end it; a start after the save sees QR disabled.
		tx := scoped(t, org, true)
		defer tx.Rollback(ctx)
		pending, err := restaurant.StartLockedTableSession(ctx, tx, org, table.QRToken, true)
		if err != nil {
			t.Fatal(err)
		}
		saved := make(chan error, 1)
		key++
		disableKey := fmt.Sprintf("a08%05d-1111-4111-8111-111111111111", key)
		go func() {
			disable := tables
			disable.GenerateQR, disable.QREnabled = false, false
			_, problem := setup.SaveTables(ctx, owner, org, disableKey, disable)
			saved <- problem
		}()
		waited := false
		select {
		case err = <-saved:
		case <-time.After(300 * time.Millisecond):
			waited = true
		}
		if commitErr := tx.Commit(ctx); commitErr != nil {
			t.Fatal(commitErr)
		}
		if !waited {
			t.Fatalf("setup did not wait for the start's organization lock: %v", err)
		}
		if err = <-saved; err != nil {
			t.Fatal(err)
		}
		got, err := read(t, org, pending.Proof)
		notFound(t, "session started before disable", got, err)
		if _, err = start(t, org, table.QRToken); !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("start after disable: %v", err)
		}
	})
	t.Run("start waiting on a QR-disabling save admits nothing", func(t *testing.T) {
		for _, issued := range save(t, enable).IssuedTableQRTokens {
			if issued.Code == table.Code {
				table = issued
			}
		}
		before := len(stored(t, org))
		// Hold the organization lock, apply the disabling change the way setup
		// does, and let a start queue behind it on the organization row.
		holder := scoped(t, org, true)
		defer holder.Rollback(ctx)
		if _, err := holder.Exec(ctx, "UPDATE restaurant_profiles SET table_qr_enabled=false WHERE organization_id=$1", org); err != nil {
			t.Fatal(err)
		}
		started := make(chan error, 1)
		go func() {
			bounded, cancel := context.WithTimeout(ctx, 10*time.Second)
			defer cancel()
			tx, err := pool.Begin(bounded)
			if err != nil {
				started <- err
				return
			}
			defer tx.Rollback(ctx)
			if _, err = tx.Exec(bounded, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", org); err != nil {
				started <- err
				return
			}
			var id string
			if err = tx.QueryRow(bounded, "SELECT id::text FROM organizations WHERE id=$1 AND status='ACTIVE' FOR UPDATE", org).Scan(&id); err != nil {
				started <- err
				return
			}
			if _, err = restaurant.StartLockedTableSession(bounded, tx, org, table.QRToken, true); err != nil {
				started <- err
				return
			}
			started <- tx.Commit(bounded)
		}()
		select {
		case err := <-started:
			t.Fatalf("start did not wait for the save's organization lock: %v", err)
		case <-time.After(300 * time.Millisecond):
		}
		if err := holder.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		if err := <-started; !errors.Is(err, restaurant.ErrNotFound) {
			t.Fatalf("start after a committed QR disable: %v", err)
		}
		if after := len(stored(t, org)); after != before {
			t.Fatalf("waiting start stored a session: %d -> %d", before, after)
		}
	})
	t.Run("runtime role cannot write another restaurant's session", func(t *testing.T) {
		// Foreign keys bypass RLS; the WITH CHECK policy must refuse the row.
		tx := scoped(t, other, false)
		defer tx.Rollback(ctx)
		_, err := tx.Exec(ctx, `INSERT INTO restaurant_table_sessions(organization_id,table_id,proof_digest,qr_token_hash,created_at,expires_at)
			VALUES($1,$2,$3,$3,clock_timestamp(),clock_timestamp()+interval '2 hours')`, org, table.TableID, strings.Repeat("c", 64))
		var problem *pgconn.PgError
		if !errors.As(err, &problem) || problem.Code != "42501" {
			t.Fatalf("cross-restaurant session insert: %v", err)
		}
	})
	// Leave the restaurant with QR enabled and a fresh token for later checks.
	for _, issued := range save(t, enable).IssuedTableQRTokens {
		if issued.Code == table.Code {
			table = issued
		}
	}
	return table
}
