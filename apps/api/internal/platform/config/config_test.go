package config

import "testing"

func TestParse(t *testing.T) {
	cases := []struct {
		name, address, url string
		valid              bool
	}{
		{"valid", "127.0.0.1:8080", "postgres://dev:local@localhost/smartpos", true},
		{"default address", "", "postgres://dev:local@localhost/smartpos", true},
		{"missing database", "", "", false},
		{"invalid port", ":70000", "postgres://localhost/smartpos", false},
		{"invalid URL", "", "postgres://%not-a-url", false},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			_, err := Parse(func(key string) string {
				if key == "API_ADDR" {
					return item.address
				}
				return item.url
			})
			if (err == nil) != item.valid {
				t.Fatalf("valid=%v error=%v", item.valid, err)
			}
		})
	}
}
