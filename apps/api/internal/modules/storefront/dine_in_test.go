package storefront

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type tableLookupTx struct {
	pgx.Tx
	args []any
	row  pgx.Row
}

func (tx *tableLookupTx) QueryRow(_ context.Context, _ string, args ...any) pgx.Row {
	tx.args = args
	return tx.row
}

type tableLookupRow struct{ err error }

func (row tableLookupRow) Scan(destinations ...any) error {
	if row.err != nil {
		return row.err
	}
	*destinations[0].(*string) = "table-id"
	*destinations[1].(*string) = "T01"
	return nil
}

func TestDineInTableLookup(t *testing.T) {
	token := strings.Repeat("a", 64)
	tx := &tableLookupTx{row: tableLookupRow{}}
	id, code, err := dineInTable(context.Background(), tx, "org", "branch", token)
	if err != nil || id != "table-id" || code != "T01" {
		t.Fatalf("unexpected lookup: %s %s %v", id, code, err)
	}
	if len(tx.args) != 3 || tx.args[0] != "org" || tx.args[1] != "branch" || tx.args[2] != accessHash(token) {
		t.Fatal("table lookup must scope organization/branch and hash the token")
	}
	tx = &tableLookupTx{row: tableLookupRow{err: pgx.ErrNoRows}}
	if _, _, err = dineInTable(context.Background(), tx, "org", "branch", token); !errors.Is(err, ErrInput) {
		t.Fatalf("unknown table token: %v", err)
	}
	for _, invalid := range []string{"short", strings.Repeat("G", 64)} {
		tx = &tableLookupTx{}
		if _, _, err = dineInTable(context.Background(), tx, "org", "branch", invalid); !errors.Is(err, ErrInput) || tx.args != nil {
			t.Fatal("invalid token must fail before query")
		}
	}
	if id, code, err = dineInTable(context.Background(), nil, "org", "branch", ""); err != nil || id != "" || code != "" {
		t.Fatal("ordinary pickup must not require table lookup")
	}
}

func TestQuoteRejectsInvalidTableContextBeforeDatabase(t *testing.T) {
	service := &Service{}
	for _, input := range []QuoteInput{
		{TableToken: "invalid"},
		{TableToken: strings.Repeat("a", 64), Fulfillment: "DELIVERY"},
	} {
		if _, err := service.Quote(context.Background(), "test-shop", input); !errors.Is(err, ErrInput) {
			t.Fatalf("invalid table context accepted: %v", err)
		}
	}
}

func TestOrderTableContextValidation(t *testing.T) {
	input := OrderInput{Items: []ItemInput{{VariantID: "11111111-1111-4111-8111-111111111111", Quantity: "1.000"}}, QuoteID: strings.Repeat("a", 64), AccessToken: strings.Repeat("b", 64), CustomerName: "Guest", ContactPhone: "0800000000", TableToken: strings.Repeat("c", 64)}
	if err := input.validate(); err != nil {
		t.Fatal(err)
	}
	original := digest(input)
	input.TableToken = strings.Repeat("d", 64)
	if digest(input) == original {
		t.Fatal("table token must participate in order replay fingerprint")
	}
	input.Fulfillment = "DELIVERY"
	input.DeliveryAddress = "Synthetic test address"
	if err := input.validate(); !errors.Is(err, ErrInput) {
		t.Fatal("table order must not allow delivery")
	}
}
