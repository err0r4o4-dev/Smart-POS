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
				switch key {
				case "API_ADDR":
					return item.address
				case "DATABASE_URL":
					return item.url
				case "APP_ENV":
					return "development"
				case "PUBLIC_ORIGIN":
					return "http://localhost:8088"
				case "SMTP_ADDR":
					return "localhost:1025"
				case "MAIL_FROM":
					return "noreply@localhost"
				default:
					return ""
				}
			})
			if (err == nil) != item.valid {
				t.Fatalf("valid=%v error=%v", item.valid, err)
			}
		})
	}
}
