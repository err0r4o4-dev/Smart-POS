package storefront_test

import (
	"context"
	"errors"
	"reflect"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/testsupport"
)

func privateQuoteMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, auth identity.Handler, organizations *organization.Service, owner, guest testsupport.MFASession, legacyOrg string) {
	t.Helper()
	user := identity.SessionFromContext(owner.Context).User.ID
	foreign := identity.SessionFromContext(guest.Context).User.ID
	draft, err := organizations.CreateRestaurant(ctx, user, "d5000000-0000-4000-8000-000000000001", organization.OrganizationInput{Name: "Private quote draft", BusinessType: "RESTAURANT"})
	if err != nil {
		t.Fatal(err)
	}
	org := draft.Organization.ID
	setup := &restaurant.Service{Organization: organizations}
	if _, err = setup.SaveProfile(ctx, user, org, "d5000000-0000-4000-8000-000000000002", restaurant.SetupProfileInput{Name: "Private quote draft", BusinessType: "RESTAURANT"}); err != nil {
		t.Fatal(err)
	}
	if _, err = setup.SaveMenu(ctx, user, org, "d5000000-0000-4000-8000-000000000003", restaurant.SetupMenuInput{Categories: []restaurant.SetupCategoryInput{{Name: "Meals"}}, Items: []restaurant.SetupMenuItemInput{{Category: "Meals", Name: "Soup", SKU: "SOUP", Price: "45.25"}}}); err != nil {
		t.Fatal(err)
	}
	service := &storefront.Service{Organization: organizations}
	shop, err := service.SaveSettings(ctx, user, org, storefront.SettingsInput{Name: "Private quote draft", ShippingFee: "12.35", DeliveryEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	products, err := service.Products(ctx, user, org, "", "", 1)
	if err != nil || len(products.Items) != 1 {
		t.Fatalf("private quote fixture: %v", err)
	}
	input := storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: products.Items[0].VariantID, Quantity: "2.000"}}, Fulfillment: "DELIVERY"}
	_, primaryToken, _, err := auth.Service.Login(ctx, "single-store-owner@example.test", "Synthetic-owner-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	primary := testsupport.Authenticate(t, ctx, auth, primaryToken)
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	for _, denial := range []struct {
		request context.Context
		actor   string
		want    error
	}{
		{context.Background(), user, identity.ErrInvalidToken}, {primary, user, identity.ErrMFARequired},
		{guest.Context, user, identity.ErrInvalidToken}, {guest.Context, foreign, storefront.ErrNotFound},
	} {
		value, problem := service.QuoteOrganization(denial.request, denial.actor, org, input)
		if !errors.Is(problem, denial.want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private quote authentication/tenant denial: %v", problem)
		}
	}
	for _, status := range []string{"ACTIVE", "SUSPENDED"} {
		privateReadMembership(t, ctx, organizations, user, org, foreign, status)
		want := organization.ErrDenied
		if status == "SUSPENDED" {
			want = storefront.ErrNotFound
		}
		value, problem := service.QuoteOrganization(guest.Context, foreign, org, input)
		if !errors.Is(problem, want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private quote non-Owner denial: %v", problem)
		}
	}
	privateReadMembership(t, ctx, organizations, user, org, foreign, "")
	shop, err = service.SaveSettings(ctx, user, org, storefront.SettingsInput{Name: shop.Name, Slug: shop.Slug, Revision: shop.Revision, ShippingFee: "12.35"})
	if err != nil {
		t.Fatal(err)
	}
	closed := privateCatalogSnapshot(t, ctx, organizations, user, org)
	if value, problem := service.QuoteOrganization(owner.Context, user, org, input); !errors.Is(problem, storefront.ErrClosed) || !reflect.ValueOf(value).IsZero() || privateCatalogSnapshot(t, ctx, organizations, user, org) != closed {
		t.Fatalf("disabled delivery quote changed state or returned data: %v", problem)
	}
	shop, err = service.SaveSettings(ctx, user, org, storefront.SettingsInput{Name: shop.Name, Slug: shop.Slug, Revision: shop.Revision, ShippingFee: "12.35", DeliveryEnabled: true})
	if err != nil {
		t.Fatal(err)
	}
	legacy := privateCatalogSnapshot(t, ctx, organizations, user, legacyOrg)
	if value, problem := service.QuoteOrganization(owner.Context, user, legacyOrg, storefront.QuoteInput{Items: input.Items}); !errors.Is(problem, storefront.ErrConflict) || !reflect.ValueOf(value).IsZero() || privateCatalogSnapshot(t, ctx, organizations, user, legacyOrg) != legacy {
		t.Fatalf("organization quote accepted legacy source or changed state: %v", problem)
	}
	before := privateCatalogSnapshot(t, ctx, organizations, user, org)
	proof := privateQuoteProof(t, ctx, pool, user)
	for _, expired := range []bool{true, false} {
		verifyPrivateReadWait(t, ctx, pool, owner, "storefronts", expired, func(request context.Context) (any, error) {
			return service.QuoteOrganization(request, user, org, input)
		})
	}
	partial := input
	partial.Items = append(append([]storefront.ItemInput(nil), input.Items...), storefront.ItemInput{VariantID: "11111111-1111-4111-8111-111111111111", Quantity: "1.000"})
	for _, candidate := range []struct {
		name  string
		input storefront.QuoteInput
	}{
		{"valid quote", input}, {"partial helper error", partial},
	} {
		for _, expired := range []bool{true, false} {
			t.Run(candidate.name+map[bool]string{true: " expiry", false: " cancellation"}[expired], func(t *testing.T) {
				verifyPrivateQuoteMenuWait(t, ctx, pool, owner, org, candidate.input, expired)
			})
		}
	}
	for _, candidate := range []struct {
		input storefront.QuoteInput
		want  error
	}{
		{partial, storefront.ErrNotFound},
		{storefront.QuoteInput{}, storefront.ErrInput},
		{storefront.QuoteInput{Items: input.Items, TableToken: "private-token"}, storefront.ErrInput},
		{storefront.QuoteInput{Items: input.Items, Fulfillment: "DINE_IN"}, storefront.ErrInput},
	} {
		value, problem := service.QuoteOrganization(owner.Context, user, org, candidate.input)
		if !errors.Is(problem, candidate.want) || !reflect.ValueOf(value).IsZero() {
			t.Fatalf("private quote leaked a partial error result: %v", problem)
		}
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
	if value, problem := pinned.QuoteOrganization(owner.Context, user, org, input); !errors.Is(problem, storefront.ErrNotFound) || !reflect.ValueOf(value).IsZero() {
		t.Fatalf("private quote crossed pinned organization: %v", problem)
	}
	value, err := service.QuoteOrganization(owner.Context, user, org, input)
	if err != nil || value.ID == "" || value.Subtotal != "90.50" || value.ShippingFee != "12.35" || value.Total != "102.85" || len(value.Items) != 1 || value.Items[0].UnitPrice != "45.25" {
		t.Fatalf("exact private quote changed: %v", err)
	}
	if replay, problem := service.QuoteOrganization(owner.Context, user, org, input); problem != nil || !reflect.DeepEqual(value, replay) {
		t.Fatalf("private quote digest changed without a menu revision: %v", problem)
	}
	if _, problem := service.Quote(context.Background(), shop.Slug, input); !errors.Is(problem, storefront.ErrNotFound) {
		t.Fatalf("private quote exposed public draft: %v", problem)
	}
	if privateCatalogSnapshot(t, ctx, organizations, user, org) != before || privateQuoteProof(t, ctx, pool, user) != proof {
		t.Fatal("private quoting changed business state or consumed MFA proof")
	}
}

func verifyPrivateQuoteMenuWait(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner testsupport.MFASession, org string, input storefront.QuoteInput, expired bool) {
	t.Helper()
	trace := &privateReadTrace{prefix: "SELECT variant.id::text,product.name,variant.name", remaining: 1, arrived: make(chan struct{}), release: make(chan struct{})}
	configuration := pool.Config()
	configuration.ConnConfig.Tracer = trace
	tracedPool, err := pgxpool.NewWithConfig(ctx, configuration)
	if err != nil {
		t.Fatal(err)
	}
	defer tracedPool.Close()
	service := &storefront.Service{Organization: &organization.Service{Pool: tracedPool}}
	user, session := identity.SessionFromContext(owner.Context).User.ID, identity.SessionFromContext(owner.Context).ID
	var cutoff time.Time
	if expired {
		if err = pool.QueryRow(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at", session).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		defer func() {
			if _, failure := pool.Exec(ctx, "UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", session); failure != nil {
				t.Error(failure)
			}
		}()
	}
	request, stop := context.WithCancel(owner.Context)
	defer stop()
	result := make(chan error, 1)
	go func() {
		value, failure := service.QuoteOrganization(request, user, org, input)
		if !reflect.ValueOf(value).IsZero() {
			result <- errors.New("interrupted quote disclosed private data")
			return
		}
		result <- failure
	}()
	select {
	case <-trace.arrived:
	case <-time.After(5 * time.Second):
		stop()
		close(trace.release)
		<-result
		t.Fatal("private quote did not reach menu query")
	}
	if expired {
		for {
			var elapsed bool
			if err = pool.QueryRow(ctx, "SELECT clock_timestamp()>=$1", cutoff).Scan(&elapsed); err != nil {
				stop()
				close(trace.release)
				<-result
				t.Fatal(err)
			}
			if elapsed {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
	} else {
		stop()
	}
	close(trace.release)
	err = <-result
	want := identity.ErrInvalidToken
	if !expired {
		want = context.Canceled
	}
	if !errors.Is(err, want) {
		t.Fatalf("private menu interruption returned a domain result: %v", err)
	}
}

func privateQuoteProof(t *testing.T, ctx context.Context, pool *pgxpool.Pool, user string) string {
	t.Helper()
	var proof string
	if err := pool.QueryRow(ctx, `SELECT jsonb_build_array(
	 (SELECT jsonb_agg(jsonb_build_array(id,last_step,activated_at,revoked_at) ORDER BY id) FROM auth_mfa_factors WHERE user_id=$1),
	 (SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=$1 AND used_at IS NOT NULL),
	 (SELECT count(*) FROM auth_audit_events WHERE user_id=$1 AND event_type LIKE 'MFA_%'))::text`, user).Scan(&proof); err != nil {
		t.Fatal(err)
	}
	return proof
}
