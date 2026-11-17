package storefront_test

import (
	"context"
	"errors"
	"reflect"
	"strings"
	"testing"
	"time"

	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/storefront"
)

func verifyOrganizationQuote(testContext *testing.T, ctx context.Context, organizations *organization.Service, owner, guest, org, slug string) {
	testContext.Helper()
	service := &storefront.Service{Organization: organizations}
	snapshot := func() [7]int {
		testContext.Helper()
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			testContext.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var counts [7]int
		problem = tx.QueryRow(ctx, `SELECT
		 (SELECT count(*) FROM branches WHERE organization_id=$1),
		 (SELECT count(*) FROM stock_locations WHERE organization_id=$1),
		 (SELECT count(*) FROM pos_terminals WHERE organization_id=$1),
		 (SELECT count(*) FROM online_orders WHERE organization_id=$1),
		 (SELECT count(*) FROM sales WHERE organization_id=$1),
		 (SELECT count(*) FROM receipts WHERE organization_id=$1),
		 (SELECT count(*) FROM organization_audit_events WHERE organization_id=$1)`, org).Scan(&counts[0], &counts[1], &counts[2], &counts[3], &counts[4], &counts[5], &counts[6])
		if problem != nil {
			testContext.Fatal(problem)
		}
		return counts
	}
	before := snapshot()
	page, err := service.Products(ctx, owner, org, "", "", 1)
	if err != nil || len(page.Items) != 1 {
		testContext.Fatalf("organization quote menu fixture: %v", err)
	}
	input := storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: page.Items[0].VariantID, Quantity: "2.000"}}, Fulfillment: "DELIVERY"}
	value, err := service.QuoteOrganization(ctx, owner, org, input)
	if err != nil || len(value.Items) != 1 || value.ID == "" || value.Currency != "THB" || value.Fulfillment != "DELIVERY" || value.Subtotal != "110.70" || value.ShippingFee != "12.35" || value.Total != "123.05" {
		testContext.Fatalf("exact branchless organization quote: quote=%+v error=%v", value, err)
	}
	line := value.Items[0]
	if line.VariantID != input.Items[0].VariantID || line.ProductName != "Soup updated" || line.UnitPrice != "55.35" || line.Quantity != "2.000" || line.LineTotal != "110.70" {
		testContext.Fatalf("organization quote did not freeze menu details: %+v", line)
	}
	if replayed, problem := service.QuoteOrganization(ctx, owner, org, input); problem != nil || !reflect.DeepEqual(value, replayed) {
		testContext.Fatalf("unchanged quote was not deterministic: %v", problem)
	}
	pickup := input
	pickup.Fulfillment = ""
	if result, problem := service.QuoteOrganization(ctx, owner, org, pickup); problem != nil || result.Fulfillment != "PICKUP" || result.Subtotal != "110.70" || result.ShippingFee != "0.00" || result.Total != "110.70" || result.ID == value.ID {
		testContext.Fatalf("pickup quote default or fee incorrect: %+v error=%v", result, problem)
	}
	for _, candidate := range []struct {
		name, user string
		want       error
	}{
		{"manager", guest, organization.ErrDenied},
		{"foreign user", "11111111-1111-4111-8111-111111111111", storefront.ErrNotFound},
	} {
		testContext.Run("organization quote denies "+candidate.name, func(testContext *testing.T) {
			if _, problem := service.QuoteOrganization(ctx, candidate.user, org, input); !errors.Is(problem, candidate.want) {
				testContext.Fatalf("expected %v, got %v", candidate.want, problem)
			}
		})
	}
	pinned := &storefront.Service{Organization: &organization.Service{Pool: organizations.Pool, SingleStoreOrganizationID: "11111111-1111-4111-8111-111111111111"}}
	if _, problem := pinned.QuoteOrganization(ctx, owner, org, input); !errors.Is(problem, storefront.ErrNotFound) {
		testContext.Fatalf("quote crossed pinned organization: %v", problem)
	}
	for _, candidate := range []struct {
		name  string
		input storefront.QuoteInput
		want  error
	}{
		{"table token", storefront.QuoteInput{Items: input.Items, TableToken: strings.Repeat("a", 64)}, storefront.ErrInput},
		{"duplicate", storefront.QuoteInput{Items: append(append([]storefront.ItemInput(nil), input.Items...), input.Items...)}, storefront.ErrInput},
		{"fractional count", storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: line.VariantID, Quantity: "0.500"}}}, storefront.ErrInput},
		{"missing variant", storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: "11111111-1111-4111-8111-111111111111", Quantity: "1.000"}}}, storefront.ErrNotFound},
	} {
		testContext.Run("organization quote rejects "+candidate.name, func(testContext *testing.T) {
			if _, problem := service.QuoteOrganization(ctx, owner, org, candidate.input); !errors.Is(problem, candidate.want) {
				testContext.Fatalf("expected %v, got %v", candidate.want, problem)
			}
		})
	}
	for name, update := range map[string]string{
		"inactive variant":  "UPDATE product_variants SET status='INACTIVE' WHERE organization_id=$1 AND id=$2",
		"inactive product":  "UPDATE products SET status='INACTIVE' WHERE organization_id=$1 AND id=(SELECT product_id FROM product_variants WHERE organization_id=$1 AND id=$2)",
		"inactive category": "UPDATE categories SET status='INACTIVE' WHERE organization_id=$1 AND id=(SELECT category_id FROM products WHERE organization_id=$1 AND id=(SELECT product_id FROM product_variants WHERE organization_id=$1 AND id=$2))",
		"inactive unit":     "UPDATE units SET status='INACTIVE' WHERE organization_id=$1 AND id=(SELECT unit_id FROM product_variants WHERE organization_id=$1 AND id=$2)",
		"non THB currency":  "UPDATE product_variants SET currency='USD' WHERE organization_id=$1 AND id=$2",
	} {
		testContext.Run("organization quote blocks "+name, func(testContext *testing.T) {
			tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if problem != nil {
				testContext.Fatal(problem)
			}
			defer tx.Rollback(ctx)
			if _, problem = tx.Exec(ctx, update, org, line.VariantID); problem != nil {
				testContext.Fatal(problem)
			}
			result, problem := storefront.OrganizationQuoteForTest(ctx, tx, org, storefront.Settings{DeliveryEnabled: true, ShippingFee: "12.35"}, input.Items, "DELIVERY")
			if !errors.Is(problem, storefront.ErrStock) || result.ID != "" {
				testContext.Fatalf("unsafe menu quote accepted: %v", problem)
			}
		})
	}
	testContext.Run("organization quote requires verified owner", func(testContext *testing.T) {
		tx, _, problem := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if problem != nil {
			testContext.Fatal(problem)
		}
		defer tx.Rollback(ctx)
		var verifiedAt time.Time
		if problem = tx.QueryRow(ctx, "SELECT email_verified_at FROM users WHERE id=$1", owner).Scan(&verifiedAt); problem != nil {
			testContext.Fatal(problem)
		}
		if _, problem = tx.Exec(ctx, "UPDATE users SET email_verified_at=NULL WHERE id=$1", owner); problem != nil {
			testContext.Fatal(problem)
		}
		if problem = tx.Commit(ctx); problem != nil {
			testContext.Fatal(problem)
		}
		defer func() {
			restore, _, restoreError := organizations.Authorized(ctx, owner, org, "storefront.manage")
			if restoreError != nil {
				testContext.Fatal(restoreError)
			}
			defer restore.Rollback(ctx)
			if _, restoreError = restore.Exec(ctx, "UPDATE users SET email_verified_at=$2 WHERE id=$1", owner, verifiedAt); restoreError != nil {
				testContext.Fatal(restoreError)
			}
			if restoreError = restore.Commit(ctx); restoreError != nil {
				testContext.Fatal(restoreError)
			}
		}()
		if _, problem = service.QuoteOrganization(ctx, owner, org, input); !errors.Is(problem, organization.ErrDenied) {
			testContext.Fatalf("unverified owner quoted draft: %v", problem)
		}
	})
	if _, problem := service.Quote(ctx, slug, input); !errors.Is(problem, storefront.ErrNotFound) {
		testContext.Fatalf("private quote opened public draft quotes: %v", problem)
	}
	if after := snapshot(); after != before {
		testContext.Fatalf("quote wrote infrastructure/order/sale/receipt/audit: before=%v after=%v", before, after)
	}
	verifyOrganizationQuoteFreshness(testContext, ctx, organizations, owner, org, input, value.ID)
}

func verifyOrganizationQuoteFreshness(testContext *testing.T, ctx context.Context, organizations *organization.Service, owner, org string, input storefront.QuoteInput, previousID string) {
	testContext.Helper()
	service := &storefront.Service{Organization: organizations}
	tx, _, err := organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		testContext.Fatal(err)
	}
	defer tx.Rollback(ctx)
	var legacyVariant string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM product_variants WHERE organization_id=$1 AND sku='LEGACY'", org).Scan(&legacyVariant); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.Rollback(ctx); err != nil {
		testContext.Fatal(err)
	}
	if _, err = service.QuoteOrganization(ctx, owner, org, storefront.QuoteInput{Items: []storefront.ItemInput{{VariantID: legacyVariant, Quantity: "1.000"}}}); !errors.Is(err, storefront.ErrNotFound) {
		testContext.Fatalf("unregistered legacy variant quoted: %v", err)
	}
	tx, _, err = organizations.Authorized(ctx, owner, org, "storefront.manage")
	if err != nil {
		testContext.Fatal(err)
	}
	defer tx.Rollback(ctx)
	lockedContext, cancel := context.WithTimeout(ctx, 100*time.Millisecond)
	defer cancel()
	_, err = service.QuoteOrganization(lockedContext, owner, org, input)
	if err == nil || !errors.Is(lockedContext.Err(), context.DeadlineExceeded) {
		testContext.Fatalf("quote bypassed organization mutation lock: %v", err)
	}
	if _, err = tx.Exec(ctx, "UPDATE product_variants SET selling_price=56.35 WHERE organization_id=$1 AND id=$2", org, input.Items[0].VariantID); err != nil {
		testContext.Fatal(err)
	}
	if err = tx.Commit(ctx); err != nil {
		testContext.Fatal(err)
	}
	defer func() {
		restore, _, restoreError := organizations.Authorized(ctx, owner, org, "storefront.manage")
		if restoreError != nil {
			testContext.Fatal(restoreError)
		}
		defer restore.Rollback(ctx)
		if _, restoreError = restore.Exec(ctx, "UPDATE product_variants SET selling_price=55.35 WHERE organization_id=$1 AND id=$2", org, input.Items[0].VariantID); restoreError != nil {
			testContext.Fatal(restoreError)
		}
		if restoreError = restore.Commit(ctx); restoreError != nil {
			testContext.Fatal(restoreError)
		}
	}()
	value, err := service.QuoteOrganization(ctx, owner, org, input)
	if err != nil || value.Items[0].UnitPrice != "56.35" || value.Subtotal != "112.70" || value.Total != "125.05" || value.ID == previousID {
		testContext.Fatalf("quote did not refresh after serialized menu update: %+v error=%v", value, err)
	}
}
