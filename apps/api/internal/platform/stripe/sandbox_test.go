package stripe

import (
	"strings"
	"testing"
)

func TestSandboxRejectsLiveKeysAndUnsafeOrigins(t *testing.T) {
	for _, test := range []struct {
		name, key, origin string
		valid             bool
	}{
		{"disabled", "", "http://localhost:8088", true},
		{"test key", "sk_test_synthetic", "http://localhost:8088", true},
		{"live key", "sk_live_synthetic", "http://localhost:8088", false},
		{"publishable key", "pk_test_synthetic", "http://localhost:8088", false},
		{"remote http", "sk_test_synthetic", "http://example.com", false},
		{"origin credentials", "sk_test_synthetic", "https://user:pass@example.com", false},
		{"origin path", "sk_test_synthetic", "https://example.com/path", false},
		{"origin query", "sk_test_synthetic", "https://example.com?next=evil", false},
		{"origin fragment", "sk_test_synthetic", "https://example.com#evil", false},
		{"https", "sk_test_synthetic", "https://example.com", true},
	} {
		t.Run(test.name, func(t *testing.T) {
			client, err := NewSandbox(test.key, test.origin)
			if (err == nil) != test.valid {
				t.Fatalf("valid=%v error=%v", test.valid, err)
			}
			if err != nil && strings.Contains(err.Error(), test.key) && test.key != "" {
				t.Fatal("error exposed key")
			}
			if err == nil && client.Configured() != (test.key != "") {
				t.Fatal("unexpected configured status")
			}
		})
	}
}
