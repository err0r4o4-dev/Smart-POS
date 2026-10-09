package config

import (
	"testing"
)

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

func TestTrustedProxyConfiguration(t *testing.T) {
	for _, item := range []struct {
		name, environment, proxy string
		valid                    bool
	}{
		{"development direct", "development", "", true},
		{"development proxy", "development", "172.30.42.2", true},
		{"production missing proxy", "production", "", false},
		{"production exact proxy", "production", "2001:db8::2", true},
		{"loopback proxy", "development", "127.0.0.1", false},
		{"network prefix", "development", "172.30.42.0/28", false},
		{"multiple proxies", "development", "172.30.42.2,172.30.42.3", false},
	} {
		t.Run(item.name, func(t *testing.T) {
			settings, err := Parse(func(key string) string {
				switch key {
				case "DATABASE_URL":
					return "postgres://dev:local@localhost/smartpos"
				case "APP_ENV":
					return item.environment
				case "PUBLIC_ORIGIN":
					return "https://example.test"
				case "SMTP_ADDR":
					return "localhost:1025"
				case "MAIL_FROM":
					return "noreply@example.test"
				case "SMTP_USER", "SMTP_PASSWORD":
					return "test-only"
				case "AUTH_TRUSTED_PROXY_IP":
					return item.proxy
				default:
					return ""
				}
			})
			if (err == nil) != item.valid {
				t.Fatalf("valid=%v error=%v", item.valid, err)
			}
			if item.valid && item.proxy != "" && settings.TrustedProxyIP.String() != item.proxy {
				t.Fatalf("trusted proxy = %q", settings.TrustedProxyIP)
			}
		})
	}
}
