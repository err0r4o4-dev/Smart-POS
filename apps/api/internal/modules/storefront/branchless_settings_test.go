package storefront

import "testing"

func TestOrganizationStorefrontDraftInput(testContext *testing.T) {
	input := SettingsInput{Name: "Restaurant draft", ShippingFee: "12.35"}
	if err := input.validate(); err != nil {
		testContext.Fatalf("organization draft requires legacy infrastructure: %v", err)
	}
	for name, change := range map[string]func(*SettingsInput){
		"malformed terminal":                    func(candidate *SettingsInput) { candidate.TerminalID = "bad" },
		"orphan online source":                  func(candidate *SettingsInput) { candidate.OnlineTerminalID = "11111111-1111-4111-8111-111111111111" },
		"publishing before operational cutover": func(candidate *SettingsInput) { candidate.Published = true },
		"accepting before operational cutover":  func(candidate *SettingsInput) { candidate.AcceptingOrders = true },
	} {
		testContext.Run(name, func(testContext *testing.T) {
			candidate := input
			change(&candidate)
			if candidate.validate() == nil {
				testContext.Fatal("invalid draft accepted")
			}
		})
	}
}
