package identity

import (
	"strings"
	"testing"
)

func TestPlatformAdminRequestValidation(t *testing.T) {
	valid := PlatformAdminRequest{OperationID: "43000000-0000-4000-8000-000000000031", UserID: "43000000-0000-4000-8000-000000000032", Action: "GRANT", Operator: "synthetic-operator", Reason: "Verified synthetic identity"}
	if err := valid.Validate(); err != nil {
		t.Fatal(err)
	}
	for name, change := range map[string]func(*PlatformAdminRequest){
		"missing identity":   func(v *PlatformAdminRequest) { v.UserID = "" },
		"zero operation":     func(v *PlatformAdminRequest) { v.OperationID = "00000000-0000-0000-0000-000000000000" },
		"unsupported action": func(v *PlatformAdminRequest) { v.Action = "OWNER" },
		"missing operator":   func(v *PlatformAdminRequest) { v.Operator = "" },
		"blank reason":       func(v *PlatformAdminRequest) { v.Reason = " " },
		"oversized reason":   func(v *PlatformAdminRequest) { v.Reason = strings.Repeat("x", 501) },
		"control characters": func(v *PlatformAdminRequest) { v.Operator = "synthetic\noperator" },
		"invalid utf8":       func(v *PlatformAdminRequest) { v.Reason = string([]byte{0xff}) },
	} {
		t.Run(name, func(t *testing.T) {
			input := valid
			change(&input)
			if input.Validate() == nil {
				t.Fatal("invalid authority input accepted")
			}
		})
	}
}
