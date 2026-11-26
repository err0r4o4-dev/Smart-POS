package pricing

import "testing"

func TestRewardIsDiscountNotPayment(t *testing.T) {
	quote := Quote{Lines: []Line{{VariantID: "a", Gross: "30.00", Net: "30.00", Discount: "0.00"}, {VariantID: "b", Gross: "70.00", Net: "70.00", Discount: "0.00"}}, Subtotal: "100.00", Discount: "0.00", Total: "100.00", Revision: "base"}
	reward := Reward{AccountID: "10000000-0000-4000-8000-000000000001", ProgramID: "10000000-0000-4000-8000-000000000002", ProgramRevision: 1, PointValue: "1.00", Points: 10, Amount: "10.00"}
	result, err := ApplyReward(quote, reward)
	if err != nil || result.Total != "90.00" || result.Discount != "10.00" || result.ApprovalID != "" || result.Lines[0].Net != "27.00" || result.Lines[1].Net != "63.00" {
		t.Fatal(result, err)
	}
	quote.Discount = "1.00"
	if _, err = ApplyReward(quote, reward); err == nil {
		t.Fatal("stacking accepted")
	}
	quote.Discount = "0.00"
	reward.Amount = "9.99"
	if _, err = ApplyReward(quote, reward); err == nil {
		t.Fatal("tampered reward accepted")
	}
}
