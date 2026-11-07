package storefront_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"testing"

	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/restaurant"
)

func onboardingAcceptance(testContext *testing.T, ctx context.Context, accounts *identity.Service, multi, single *organization.Service, owner, guest string, foreign organization.Context) {
	testContext.Helper()
	unverified, err := accounts.Register(ctx, "onboarding-unverified@example.test", "Synthetic-unverified-password-2026", "Unverified")
	if err != nil {
		testContext.Fatal(err)
	}
	input := organization.CreateInput{OrganizationInput: organization.OrganizationInput{Name: "Synthetic restaurant", BusinessType: "RESTAURANT"}}
	const key = "fa111111-1111-4111-8111-111111111111"
	if _, err = multi.Create(ctx, unverified.ID, key, input); !errors.Is(err, organization.ErrDenied) {
		testContext.Fatalf("unverified creation: %v", err)
	}
	if _, err = single.Create(ctx, owner, key, input); !errors.Is(err, organization.ErrDenied) {
		testContext.Fatalf("single-store creation: %v", err)
	}
	created, err := multi.Create(ctx, owner, key, input)
	if err != nil {
		testContext.Fatal(err)
	}
	uuid := regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
	code := regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,49}$`)
	if !uuid.MatchString(created.Organization.ID) || !code.MatchString(created.Organization.Code) || len(created.Branches) != 1 {
		testContext.Fatalf("invalid generated organization or branches: %+v", created)
	}
	branch := created.Branches[0]
	if !uuid.MatchString(branch.ID) || !branch.IsMain || branch.Code != "MAIN" || branch.OrganizationID != created.Organization.ID {
		testContext.Fatalf("invalid generated main branch: %+v", branch)
	}
	replayed, err := multi.Create(ctx, owner, key, input)
	if err != nil || replayed.Organization.ID != created.Organization.ID || replayed.Organization.Code != created.Organization.Code || len(replayed.Branches) != 1 || replayed.Branches[0].ID != branch.ID {
		testContext.Fatalf("creation replay: %+v, %v", replayed, err)
	}
	changed := input
	changed.Name = "Different restaurant"
	if _, err = multi.Create(ctx, owner, key, changed); !errors.Is(err, organization.ErrConflict) {
		testContext.Fatalf("changed creation replay: %v", err)
	}
	second, err := multi.Create(ctx, owner, "fa222222-2222-4222-8222-222222222222", input)
	if err != nil || second.Organization.ID == created.Organization.ID || second.Organization.Code == created.Organization.Code || !code.MatchString(second.Organization.Code) {
		testContext.Fatalf("distinct generated organization: %+v, %v", second, err)
	}
	all, err := multi.List(ctx, owner)
	if err != nil {
		testContext.Fatal(err)
	}
	count := 0
	for _, org := range all {
		if org.ID == created.Organization.ID || org.Code == created.Organization.Code {
			count++
		}
	}
	if count != 1 {
		testContext.Fatalf("creation replay produced %d matching organizations", count)
	}
	type creationResult struct {
		value organization.Context
		err   error
	}
	start := make(chan struct{})
	results := make(chan creationResult, 2)
	for attempt := 0; attempt < 2; attempt++ {
		go func() {
			<-start
			value, problem := multi.Create(ctx, owner, "fa666666-6666-4666-8666-666666666666", input)
			results <- creationResult{value, problem}
		}()
	}
	close(start)
	firstConcurrent, secondConcurrent := <-results, <-results
	if firstConcurrent.err != nil || secondConcurrent.err != nil {
		testContext.Fatalf("concurrent creation: %v / %v", firstConcurrent.err, secondConcurrent.err)
	}
	firstCreated, secondCreated := firstConcurrent.value, secondConcurrent.value
	if firstCreated.Organization.ID == "" || firstCreated.Organization.ID != secondCreated.Organization.ID || firstCreated.Organization.Code != secondCreated.Organization.Code || len(firstCreated.Branches) != 1 || len(secondCreated.Branches) != 1 || firstCreated.Branches[0].ID != secondCreated.Branches[0].ID || !firstCreated.Branches[0].IsMain || firstCreated.Branches[0].Code != "MAIN" {
		testContext.Fatalf("concurrent creation produced different results: %+v / %+v", firstCreated, secondCreated)
	}
	all, err = multi.List(ctx, owner)
	if err != nil {
		testContext.Fatal(err)
	}
	count = 0
	for _, org := range all {
		if org.ID == firstCreated.Organization.ID || org.Code == firstCreated.Organization.Code {
			count++
		}
	}
	if count != 1 {
		testContext.Fatalf("concurrent creation produced %d matching organizations", count)
	}
	branch.BranchInput.Name, branch.BranchInput.Code = "Custom branch", "CUSTOM"
	branch.Address, branch.Phone, branch.Email = "Branch address", "123456789", "branch@example.test"
	if _, err = multi.SaveBranch(ctx, owner, created.Organization.ID, branch.ID, branch.BranchInput); err != nil {
		testContext.Fatal(err)
	}
	var profile restaurant.SetupProfileInput
	if err = json.Unmarshal([]byte(`{"organization":{"name":"Saved restaurant","business_type":"RESTAURANT","contact_email":"owner@example.test","contact_phone":"123","address":"Bangkok"},"service_modes":{"dine_in":true}}`), &profile); err != nil {
		testContext.Fatal(err)
	}
	setup := &restaurant.Service{Organization: multi}
	const profileKey = "fa333333-3333-4333-8333-333333333333"
	saved, err := setup.SaveProfile(ctx, owner, created.Organization.ID, profileKey, profile)
	if err != nil {
		testContext.Fatal(err)
	}
	if saved.BranchID != branch.ID {
		testContext.Fatalf("default main branch: got %q, want %q", saved.BranchID, branch.ID)
	}
	readRevision := func() int {
		testContext.Helper()
		tx, _, problem := multi.Authorized(ctx, owner, created.Organization.ID, "organization.update")
		if problem != nil {
			testContext.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var revision int
		if problem = tx.QueryRow(ctx, "SELECT revision FROM restaurant_service_modes WHERE organization_id=$1 AND branch_id=$2 AND mode='DINE_IN'", created.Organization.ID, branch.ID).Scan(&revision); problem != nil {
			testContext.Fatal(problem)
		}
		return revision
	}
	revision := readRevision()
	again, err := setup.SaveProfile(ctx, owner, created.Organization.ID, profileKey, profile)
	firstJSON, firstErr := json.Marshal(saved)
	againJSON, againErr := json.Marshal(again)
	if err != nil || firstErr != nil || againErr != nil || !bytes.Equal(firstJSON, againJSON) || readRevision() != revision {
		testContext.Fatalf("profile replay differs: %v", err)
	}
	current, err := multi.Context(ctx, owner, created.Organization.ID)
	if err != nil || current.Organization.Code != created.Organization.Code || current.Organization.Name != "Saved restaurant" || len(current.Branches) != 1 || current.Branches[0] != branch {
		testContext.Fatalf("profile changed internal metadata: %+v, %v", current, err)
	}
	changedProfile := profile
	changedOrganization := *profile.Organization
	changedOrganization.Name = "Different saved restaurant"
	changedProfile.Organization = &changedOrganization
	if _, err = setup.SaveProfile(ctx, owner, created.Organization.ID, profileKey, changedProfile); !errors.Is(err, restaurant.ErrConflict) {
		testContext.Fatalf("changed profile replay: %v", err)
	}
	for _, invalid := range []string{`{}`, `{"name":"Custom branch"}`, `{"code":"CUSTOM"}`} {
		var candidate restaurant.SetupProfileInput
		if err = json.Unmarshal([]byte(`{"organization":{"name":"Saved restaurant","business_type":"RESTAURANT"},"branch":`+invalid+`}`), &candidate); err != nil {
			testContext.Fatal(err)
		}
		if _, err = setup.SaveProfile(ctx, owner, created.Organization.ID, "fa777777-7777-4777-8777-777777777777", candidate); !errors.Is(err, restaurant.ErrInput) {
			testContext.Fatalf("invalid branch %s: %v", invalid, err)
		}
		current, err = multi.Context(ctx, owner, created.Organization.ID)
		if err != nil || len(current.Branches) != 1 || current.Branches[0] != branch {
			testContext.Fatalf("invalid branch %s changed saved data: %+v, %v", invalid, current, err)
		}
	}
	var legacy restaurant.SetupProfileInput
	if err = json.Unmarshal([]byte(`{"organization":{"name":"Saved restaurant","business_type":"RESTAURANT"},"branch":{"name":"Custom branch","code":"CUSTOM","address":"","phone":"","email":""},"service_modes":{"dine_in":true}}`), &legacy); err != nil {
		testContext.Fatal(err)
	}
	const legacyKey = "fa888888-8888-4888-8888-888888888888"
	legacySaved, err := setup.SaveProfile(ctx, owner, created.Organization.ID, legacyKey, legacy)
	if err != nil {
		testContext.Fatal(err)
	}
	legacyRevision := readRevision()
	legacyAgain, err := setup.SaveProfile(ctx, owner, created.Organization.ID, legacyKey, legacy)
	legacyJSON, legacyErr := json.Marshal(legacySaved)
	legacyAgainJSON, legacyAgainErr := json.Marshal(legacyAgain)
	if err != nil || legacyErr != nil || legacyAgainErr != nil || !bytes.Equal(legacyJSON, legacyAgainJSON) || readRevision() != legacyRevision {
		testContext.Fatalf("legacy profile replay differs: %v", err)
	}
	branch.Address, branch.Phone, branch.Email = "", "", ""
	current, err = multi.Context(ctx, owner, created.Organization.ID)
	if err != nil || len(current.Branches) != 1 || current.Branches[0] != branch || current.Organization.Code != created.Organization.Code {
		testContext.Fatalf("legacy branch clearing: %+v, %v", current, err)
	}
	if _, err = setup.SaveProfile(ctx, guest, created.Organization.ID, "fa444444-4444-4444-8444-444444444444", profile); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
		testContext.Fatalf("foreign user profile: %v", err)
	}
	profile.BranchID = foreign.Branches[0].ID
	if _, err = setup.SaveProfile(ctx, owner, created.Organization.ID, "fa555555-5555-4555-8555-555555555555", profile); !errors.Is(err, organization.ErrNotFound) && !errors.Is(err, restaurant.ErrNotFound) && !errors.Is(err, organization.ErrDenied) {
		testContext.Fatalf("foreign branch profile: %v", err)
	}
}
