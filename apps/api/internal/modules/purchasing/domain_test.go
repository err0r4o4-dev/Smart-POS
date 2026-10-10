package purchasing

import "testing"

func TestExactAmounts(t *testing.T) {
	for _, value := range []string{"1e2", "-1", "1.0001", "NaN", "", "1000000000000000"} {
		if _, err := decimal(value, 3); err == nil {
			t.Fatalf("accepted quantity %s", value)
		}
	}
	quantity, err := decimal("5", 3)
	if err != nil {
		t.Fatal(err)
	}
	base, err := convert(quantity, "24.000000")
	if err != nil || base != 120000 {
		t.Fatalf("case conversion %d %v", base, err)
	}
	if _, err = convert(1000, "0.000001"); err == nil {
		t.Fatal("accepted sub-milli base quantity")
	}
	if _, err = convert(999999999999999999, "100000000000.000000"); err == nil {
		t.Fatal("accepted conversion overflow")
	}
	cost, err := lineCost(1250, 101)
	if err != nil || cost != 126 {
		t.Fatalf("HALF_UP %d %v", cost, err)
	}
	if fixed(120000, 3) != "120.000" || fixed(126, 2) != "1.26" {
		t.Fatal("wrong exact formatting")
	}
	if _, err = lineCost(999999999999999999, 999999999999999999); err == nil {
		t.Fatal("accepted cost overflow")
	}
}
func TestDocumentTransitions(t *testing.T) {
	cases := []struct{ Kind, State, Action, Next string }{{"ORDER", "DRAFT", "submit", "PENDING_APPROVAL"}, {"ORDER", "APPROVED", "issue", "ORDERED"}, {"ORDER", "PARTIALLY_RECEIVED", "close", "CLOSED"}, {"RECEIPT", "PENDING_REVIEW", "correct", "DRAFT"}, {"RECEIPT", "APPROVED", "post", "POSTED"}, {"RETURN", "APPROVED", "dispatch", "DISPATCHED"}, {"TASK", "IN_PROGRESS", "complete", "COMPLETED"}}
	for _, item := range cases {
		next, err := transition(item.Kind, item.State, item.Action)
		if err != nil || next != item.Next {
			t.Fatalf("%+v %s %v", item, next, err)
		}
	}
	for _, kind := range []string{"ORDER", "RECEIPT", "RETURN", "TASK"} {
		for _, state := range []string{"POSTED", "DISPATCHED", "CLOSED", "CANCELLED", "REJECTED", "COMPLETED"} {
			if _, err := transition(kind, state, "approve"); err == nil {
				t.Fatal("terminal transition accepted")
			}
		}
	}
	if _, err := transition("ORDER", "DRAFT", "issue"); err == nil {
		t.Fatal("issued unapproved PO")
	}
	if _, err := transition("RECEIPT", "DRAFT", "post"); err == nil {
		t.Fatal("posted unreviewed receipt")
	}
}
func TestActionPermissions(t *testing.T) {
	if documentPermission("ORDER", "reject") != "purchasing.order.approve" || documentPermission("RECEIPT", "approve") != "purchasing.receive.review" || documentPermission("RETURN", "dispatch") != "purchasing.return.dispatch" {
		t.Fatal("wrong permission mapping")
	}
}
