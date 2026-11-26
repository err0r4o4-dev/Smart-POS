package storefront

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/jackc/pgx/v5"
)

type organizationQuoteRows struct {
	pgx.Rows
	values []sourceRow
	index  int
}

func (rows *organizationQuoteRows) Next() bool { return rows.index < len(rows.values) }
func (rows *organizationQuoteRows) Close()     {}
func (rows *organizationQuoteRows) Err() error { return nil }
func (rows *organizationQuoteRows) Scan(destinations ...any) error {
	row := rows.values[rows.index]
	rows.index++
	return row.Scan(destinations...)
}

type organizationQuoteTx struct {
	*sourceTx
	products []sourceRow
}

func (tx *organizationQuoteTx) Query(_ context.Context, _ string, arguments ...any) (pgx.Rows, error) {
	tx.test.Helper()
	if len(arguments) != 2 || arguments[0] != "organization" {
		tx.test.Fatal("quote did not scope menu selection to its organization")
	}
	return &organizationQuoteRows{values: tx.products}, nil
}

func TestOrganizationQuoteMoneyAndQuantityRules(testContext *testing.T) {
	const variant = "11111111-1111-4111-8111-111111111111"
	for _, candidate := range []struct {
		name, price, quantity, unit, mode, fee, subtotal, shipping, total string
		want                                                              error
	}{
		{name: "pickup default", price: "55.35", quantity: "2.000", unit: "COUNT", fee: "12.35", subtotal: "110.70", shipping: "0.00", total: "110.70"},
		{name: "delivery", price: "55.35", quantity: "2.000", unit: "COUNT", mode: "DELIVERY", fee: "12.35", subtotal: "110.70", shipping: "12.35", total: "123.05"},
		{name: "half up fractional weight", price: "1.01", quantity: "0.500", unit: "WEIGHT", fee: "0.00", subtotal: "0.51", shipping: "0.00", total: "0.51"},
		{name: "fractional count", price: "1.01", quantity: "0.500", unit: "COUNT", want: ErrInput},
		{name: "fractional packaging", price: "1.01", quantity: "0.500", unit: "PACKAGING", want: ErrInput},
		{name: "zero quantity", price: "1.01", quantity: "0.000", unit: "COUNT", want: ErrInput},
		{name: "negative quantity", price: "1.01", quantity: "-1.000", unit: "COUNT", want: ErrInput},
		{name: "excess precision", price: "1.01", quantity: "1.0001", unit: "COUNT", want: ErrInput},
		{name: "zero menu price", price: "0.00", quantity: "1.000", unit: "COUNT", want: ErrInput},
		{name: "unknown fulfillment", price: "1.01", quantity: "1.000", unit: "COUNT", mode: "DRONE", want: ErrInput},
		{name: "delivery at limit", price: "999999.98", quantity: "1.000", unit: "COUNT", mode: "DELIVERY", fee: "0.01", subtotal: "999999.98", shipping: "0.01", total: "999999.99"},
		{name: "delivery over limit", price: "999999.99", quantity: "1.000", unit: "COUNT", mode: "DELIVERY", fee: "0.01", want: ErrInput},
		{name: "invalid shipping fee", price: "1.01", quantity: "1.000", unit: "COUNT", mode: "DELIVERY", fee: "-0.01", want: ErrInput},
		{name: "pickup retains legacy limit", price: "9999999999999999.99", quantity: "1.000", unit: "COUNT", subtotal: "9999999999999999.99", shipping: "0.00", total: "9999999999999999.99"},
	} {
		testContext.Run(candidate.name, func(testContext *testing.T) {
			tx := &organizationQuoteTx{sourceTx: &sourceTx{test: testContext, rows: []sourceRow{{values: []any{"RESTAURANT"}}}}, products: []sourceRow{{values: []any{variant, "Soup", "Bowl", "SOUP", "Unit", candidate.unit, candidate.price, true}}}}
			value, err := organizationQuote(context.Background(), tx, "organization", Settings{DeliveryEnabled: true, ShippingFee: candidate.fee}, []ItemInput{{VariantID: variant, Quantity: candidate.quantity}}, candidate.mode)
			if candidate.want != nil {
				if !errors.Is(err, candidate.want) {
					testContext.Fatalf("expected %v, got %v", candidate.want, err)
				}
				return
			}
			if err != nil || value.ID == "" || value.Currency != "THB" || value.Subtotal != candidate.subtotal || value.ShippingFee != candidate.shipping || value.Total != candidate.total || len(value.Items) != 1 || value.Items[0].LineTotal != candidate.subtotal {
				testContext.Fatalf("exact quote rules: %+v error=%v", value, err)
			}
		})
	}
}

func TestOrganizationQuoteRejectsInvalidMenuSelection(testContext *testing.T) {
	const variant = "11111111-1111-4111-8111-111111111111"
	for _, candidate := range []struct {
		name     string
		items    []ItemInput
		products []sourceRow
		want     error
	}{
		{name: "empty", want: ErrInput},
		{name: "invalid variant", items: []ItemInput{{VariantID: "invalid", Quantity: "1.000"}}, want: ErrInput},
		{name: "duplicate", items: []ItemInput{{VariantID: variant, Quantity: "1.000"}, {VariantID: variant, Quantity: "1.000"}}, want: ErrInput},
		{name: "missing or foreign", items: []ItemInput{{VariantID: variant, Quantity: "1.000"}}, want: ErrNotFound},
		{name: "inactive or recalled", items: []ItemInput{{VariantID: variant, Quantity: "1.000"}}, products: []sourceRow{{values: []any{variant, "Soup", "Bowl", "SOUP", "Unit", "COUNT", "55.35", false}}}, want: ErrStock},
	} {
		testContext.Run(candidate.name, func(testContext *testing.T) {
			tx := &organizationQuoteTx{sourceTx: &sourceTx{test: testContext, rows: []sourceRow{{values: []any{"RESTAURANT"}}}}, products: candidate.products}
			if _, err := organizationQuote(context.Background(), tx, "organization", Settings{}, candidate.items, "PICKUP"); !errors.Is(err, candidate.want) {
				testContext.Fatalf("expected %v, got %v", candidate.want, err)
			}
		})
	}
}

func TestOrganizationQuoteNormalizesWithoutMutatingCaller(testContext *testing.T) {
	const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
	const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
	items := []ItemInput{{VariantID: "BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB", Quantity: "1.000"}, {VariantID: first, Quantity: "2.000"}}
	original := append([]ItemInput(nil), items...)
	calculate := func(org string, revision int64, input []ItemInput) Quote {
		tx := &organizationQuoteTx{sourceTx: &sourceTx{test: testContext, rows: []sourceRow{{values: []any{"RESTAURANT"}}}}, products: []sourceRow{
			{values: []any{second, "Tea", "Cup", "TEA", "Unit", "COUNT", "10.01", true}},
			{values: []any{first, "Soup", "Bowl", "SOUP", "Unit", "COUNT", "55.35", true}},
		}}
		value, err := organizationQuote(context.Background(), tx, org, Settings{Revision: revision}, input, "PICKUP")
		if err != nil || value.Total != "120.71" || value.Items[0].VariantID != first || value.Items[1].VariantID != second {
			testContext.Fatalf("multi-item quote order and exact sum: %+v error=%v", value, err)
		}
		return value
	}
	value := calculate("organization", 1, items)
	replayed := calculate("organization", 1, []ItemInput{original[1], original[0]})
	if !reflect.DeepEqual(items, original) || value.ID != replayed.ID || value.ID == calculate("organization", 2, items).ID {
		testContext.Fatal("quote mutation, unstable order, or revision did not invalidate quote")
	}
}

func TestOrganizationQuoteCannotOpenClosedDraft(testContext *testing.T) {
	for _, shop := range []Settings{{}, {Published: true}, {AcceptingOrders: true}} {
		if _, err := quote(context.Background(), nil, "organization", shop, nil); !errors.Is(err, ErrClosed) {
			testContext.Fatalf("closed draft reached organization quote calculator: %v", err)
		}
	}
}
