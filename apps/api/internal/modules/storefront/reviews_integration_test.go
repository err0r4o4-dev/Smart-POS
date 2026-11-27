package storefront_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"smartpos/api/internal/modules/storefront"
)

func storefrontRatingsAcceptance(t *testing.T, ctx context.Context, multi, pinned, foreign *storefront.Service, slug, foreignSlug string, tracking storefront.TrackingInput) {
	t.Helper()
	tracked, err := pinned.Track(ctx, slug, tracking)
	if err != nil || !tracked.ReviewEligible || tracked.Review != nil {
		t.Fatalf("completed order is not eligible for its first rating: %v", err)
	}
	wrongToken := tracking
	wrongToken.AccessToken = strings.Repeat("b", 64)
	for _, tc := range []struct {
		name    string
		service *storefront.Service
		slug    string
		input   storefront.ReviewInput
		want    error
	}{
		{"out of range", multi, slug, storefront.ReviewInput{TrackingInput: tracking, Rating: 6}, storefront.ErrInput},
		{"wrong token", multi, slug, storefront.ReviewInput{TrackingInput: wrongToken, Rating: 4}, storefront.ErrNotFound},
		{"wrong storefront", multi, foreignSlug, storefront.ReviewInput{TrackingInput: tracking, Rating: 4}, storefront.ErrNotFound},
		{"foreign pinned storefront", foreign, slug, storefront.ReviewInput{TrackingInput: tracking, Rating: 4}, storefront.ErrNotFound},
	} {
		if _, err := tc.service.ReviewOrder(ctx, tc.slug, tc.input); !errors.Is(err, tc.want) {
			t.Fatalf("%s: got %v, want %v", tc.name, err, tc.want)
		}
	}

	type result struct {
		rating int
		err    error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	for _, score := range []int{4, 5} {
		go func() {
			<-start
			review, err := pinned.ReviewOrder(ctx, slug, storefront.ReviewInput{TrackingInput: tracking, Rating: score})
			results <- result{rating: review.Rating, err: err}
		}()
	}
	close(start)
	first, second := <-results, <-results
	if first.err != nil || second.err != nil || first.rating != second.rating || (first.rating != 4 && first.rating != 5) {
		t.Fatalf("concurrent submissions: got %+v and %+v, want one stored rating", first, second)
	}
	retry, err := multi.ReviewOrder(ctx, slug, storefront.ReviewInput{TrackingInput: tracking, Rating: 1})
	if err != nil || retry.Rating != first.rating {
		t.Fatalf("retry changed the stored rating: %+v, %v", retry, err)
	}
	tracked, err = multi.Track(ctx, slug, tracking)
	if err != nil || !tracked.ReviewEligible || tracked.Review == nil || tracked.Review.Rating != first.rating {
		t.Fatalf("tracking did not return stored rating: %v", err)
	}

	for _, tc := range []struct {
		service *storefront.Service
		slug    string
		count   int
	}{
		{multi, slug, 1},
		{multi, foreignSlug, 0},
		{pinned, slug, 1},
		{foreign, foreignSlug, 0},
	} {
		raw, err := tc.service.Directory(ctx)
		if err != nil {
			t.Fatal(err)
		}
		var entries []map[string]any
		if err := json.Unmarshal(raw, &entries); err != nil {
			t.Fatal(err)
		}
		if tc.service != multi && len(entries) != 1 {
			t.Fatal("pinned storefront directory exposed another store")
		}
		found := false
		for _, entry := range entries {
			if entry["slug"] != tc.slug {
				continue
			}
			found = true
			var average any
			if tc.count > 0 {
				average = float64(first.rating)
			}
			if len(entry) != 7 || entry["review_count"] != float64(tc.count) || entry["average_rating"] != average {
				t.Fatalf("unexpected aggregate for %s: %+v", tc.slug, entry)
			}
		}
		if !found {
			t.Fatalf("storefront %s missing from directory", tc.slug)
		}
	}
}
