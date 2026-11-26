package inventory

import "testing"

func TestBatchInputDatesAndIdentity(t *testing.T) {
	variant := "10000000-0000-4000-8000-000000000001"
	manufactured, expires := "2026-10-01", "2026-10-31"
	valid := BatchInput{VariantID: variant, LotNumber: " LOT-1 ", ManufacturedOn: &manufactured, ExpiresOn: &expires, Reason: "Observed receipt label"}
	if err := valid.validate(); err != nil || valid.Status != "ACTIVE" || valid.LotNumber != "LOT-1" {
		t.Fatalf("valid batch rejected: %v", err)
	}
	unknown := BatchInput{VariantID: variant, LotNumber: "UNKNOWN-DATES", Reason: "Dates absent on physical lot label"}
	if err := unknown.validate(); err != nil || unknown.ExpiresOn != nil || unknown.ManufacturedOn != nil {
		t.Fatalf("unknown dates fabricated or rejected: %v", err)
	}
	badDate := "2026-02-30"
	for _, invalid := range []BatchInput{
		{VariantID: variant, LotNumber: "X", Reason: "x", ExpiresOn: &badDate},
		{VariantID: variant, LotNumber: "X", Reason: "x", ManufacturedOn: &expires, ExpiresOn: &manufactured},
		{VariantID: variant, LotNumber: "X", Reason: "x", Status: "RELEASED"},
		{VariantID: variant, LotNumber: " ", Reason: "x"},
		{VariantID: variant, LotNumber: "X", Reason: ""},
		{VariantID: "foreign", LotNumber: "X", Reason: "x"},
	} {
		if invalid.validate() == nil {
			t.Fatalf("invalid batch accepted: %+v", invalid)
		}
	}
}

func TestBatchMovementRequiresExplicitVerification(t *testing.T) {
	batch := "10000000-0000-4000-8000-000000000002"
	command := Command{LocationID: "10000000-0000-4000-8000-000000000003", ReasonCode: "OBSERVED_RECEIPT", Items: []Item{{VariantID: "10000000-0000-4000-8000-000000000001", Quantity: "2", BatchID: &batch}}}
	if command.validate("OPENING") == nil {
		t.Fatal("unverified batch accepted")
	}
	command.Items[0].BatchVerified = true
	if err := command.validate("OPENING"); err != nil {
		t.Fatalf("verified batch rejected: %v", err)
	}
	if command.validate("COUNT") == nil {
		t.Fatal("aggregate count can overwrite tracked batch")
	}
	command.Items[0].BatchID = nil
	if err := command.validate("OPENING"); err != nil {
		t.Fatalf("legacy untracked rejected: %v", err)
	}
}
