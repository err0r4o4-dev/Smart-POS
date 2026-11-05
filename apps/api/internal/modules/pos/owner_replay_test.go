package pos

import (
	"os"
	"strings"
	"testing"
)

func TestCompletedReplayBypassesCurrentApproverOnly(test *testing.T) {
	for _, file := range []string{"checkouts.go", "sales.go"} {
		source, err := os.ReadFile(file)
		if err != nil {
			test.Fatal(err)
		}
		text := string(source)
		if file == "sales.go" {
			start := strings.Index(text, `if item.Status == "COMPLETED" {`)
			end := strings.Index(text[start:], `if !allowed([]string`)
			if start < 0 || end < 0 {
				test.Fatal("completion replay branch missing")
			}
			if strings.Contains(text[start:start+end], "CurrentApprover") {
				test.Error("completed checkout rechecks historical approver")
			}
		} else {
			if !strings.Contains(text, `result.Status != "COMPLETED"`) || !strings.Contains(text, `item.Status != "COMPLETED"`) {
				test.Error("prepare and payment retries must exempt completed checkout only")
			}
		}
	}
}
