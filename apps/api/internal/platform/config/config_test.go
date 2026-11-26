package config

import (
	"encoding/base64"
	"net/url"
	"strings"
	"testing"
)

func TestStoreAssistantConfigurationIsDevelopmentOnly(t *testing.T) {
	values := map[string]string{
		"STORE_ASSISTANT_ENABLED": "true", "STORE_ASSISTANT_AI_URL": "http://ai:8001",
		"AI_STORE_ASSISTANT_TOKEN": strings.Repeat("x", 40),
	}
	get := func(name string) string { return values[name] }
	loopback, _ := url.Parse("http://localhost:8088")
	remote, _ := url.Parse("https://store.example.test")
	if _, _, err := storeAssistantConfig("production", loopback, get); err == nil {
		t.Fatal("production was allowed")
	}
	if _, _, err := storeAssistantConfig("development", remote, get); err == nil {
		t.Fatal("remote origin was allowed")
	}
	if endpoint, _, err := storeAssistantConfig("development", loopback, get); err != nil || endpoint != "http://ai:8001" {
		t.Fatalf("loopback development not enabled: %v", err)
	}
	values["STORE_ASSISTANT_AI_URL"] = "http://127.0.0.1:8001"
	values["API_ADDR"] = "0.0.0.0:8080"
	if _, _, err := storeAssistantConfig("development", loopback, get); err == nil {
		t.Fatal("native assistant accepted a non-loopback API listener")
	}
	values["API_ADDR"] = "127.0.0.1:8080"
	if _, _, err := storeAssistantConfig("development", loopback, get); err != nil {
		t.Fatalf("native loopback listener rejected: %v", err)
	}
	values["AI_STORE_ASSISTANT_TOKEN"] = ""
	if _, _, err := storeAssistantConfig("development", loopback, get); err == nil {
		t.Fatal("internal service authentication was not required")
	}
}

func TestMFAConfiguration(t *testing.T) {
	key := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("B", 32)))
	for _, item := range []struct {
		name, id, key string
		valid         bool
	}{
		{"pre-cutover disabled", "", "", true},
		{"configured", "key-v1", key, true},
		{"missing key", "key-v1", "", false},
		{"missing id", "", key, false},
		{"invalid id", " key-v1", key, false},
		{"long id", strings.Repeat("x", 101), key, false},
		{"invalid encoding", "key-v1", "not-a-key", false},
		{"short key", "key-v1", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("B", 31))), false},
		{"long key", "key-v1", base64.StdEncoding.EncodeToString([]byte(strings.Repeat("B", 33))), false},
		{"embedded newline", "key-v1", key[:8] + "\n" + key[8:], false},
		{"unpadded key", "key-v1", strings.TrimRight(key, "="), false},
	} {
		t.Run(item.name, func(t *testing.T) {
			values := map[string]string{"DATABASE_URL": "postgres://localhost/smartpos", "APP_ENV": "development", "PUBLIC_ORIGIN": "https://example.test", "SMTP_ADDR": "localhost:1025", "MAIL_FROM": "noreply@example.test", "MFA_ENCRYPTION_KEY_ID": item.id, "MFA_ENCRYPTION_KEY": item.key}
			settings, err := Parse(func(name string) string { return values[name] })
			if (err == nil) != item.valid {
				t.Fatalf("valid=%v error=%v", item.valid, err)
			}
			if err != nil && (!strings.Contains(err.Error(), "MFA_ENCRYPTION_KEY") || (item.key != "" && strings.Contains(err.Error(), item.key))) {
				t.Fatal("MFA configuration error is unsafe or not actionable")
			}
			if err == nil && (settings.MFAEncryptionKeyID != item.id || (item.id == "" && len(settings.MFAEncryptionKey) != 0) || (item.id != "" && string(settings.MFAEncryptionKey) != strings.Repeat("B", 32))) {
				t.Fatal("MFA configuration did not retain the explicitly decoded key")
			}
		})
	}
}

func TestGoogleConfiguration(test *testing.T) {
	for _, tc := range []struct {
		name, clientID, secret, redirect, missing string
		valid                                     bool
	}{
		{"disabled", "", "", "", "", true},
		{"configured", "test-client", "test-secret", "https://example.test/api/v1/auth/google/callback", "", true},
		{"missing secret", "test-client", "", "https://example.test/api/v1/auth/google/callback", "GOOGLE_CLIENT_SECRET", false},
		{"missing client", "", "test-secret", "https://example.test/api/v1/auth/google/callback", "GOOGLE_CLIENT_ID", false},
		{"missing redirect", "test-client", "test-secret", "", "GOOGLE_REDIRECT_URI", false},
		{"foreign redirect", "test-client", "test-secret", "https://evil.test/api/v1/auth/google/callback", "GOOGLE_REDIRECT_URI", false},
	} {
		test.Run(tc.name, func(test *testing.T) {
			values := map[string]string{"DATABASE_URL": "postgres://localhost/smartpos", "APP_ENV": "development", "PUBLIC_ORIGIN": "https://example.test", "SMTP_ADDR": "localhost:1025", "MAIL_FROM": "noreply@example.test", "GOOGLE_CLIENT_ID": tc.clientID, "GOOGLE_CLIENT_SECRET": tc.secret, "GOOGLE_REDIRECT_URI": tc.redirect}
			_, err := Parse(func(key string) string { return values[key] })
			if (err == nil) != tc.valid {
				test.Fatalf("valid=%v error=%v", tc.valid, err)
			}
			if err != nil && (!strings.Contains(err.Error(), tc.missing) || (tc.secret != "" && strings.Contains(err.Error(), tc.secret))) {
				test.Fatalf("unsafe or non-actionable error: %v", err)
			}
		})
	}
}

func TestStripeSandboxConfiguration(t *testing.T) {
	for _, item := range []struct {
		name, environment, key string
		valid, configured      bool
	}{
		{"disabled", "development", "", true, false},
		{"test mode", "development", "sk_test_synthetic", true, true},
		{"reject live", "development", "sk_live_synthetic", false, false},
		{"reject publishable", "development", "pk_test_synthetic", false, false},
		{"production remains disabled", "production", "", true, false},
		{"no sandbox in production", "production", "sk_test_synthetic", false, false},
	} {
		t.Run(item.name, func(t *testing.T) {
			values := map[string]string{"DATABASE_URL": "postgres://localhost/smartpos", "APP_ENV": item.environment, "PUBLIC_ORIGIN": "https://example.test", "SMTP_ADDR": "localhost:1025", "MAIL_FROM": "noreply@example.test", "SMTP_USER": "synthetic", "SMTP_PASSWORD": "synthetic", "AUTH_TRUSTED_PROXY_IP": "172.30.42.2", "STRIPE_TEST_SECRET_KEY": item.key}
			settings, err := Parse(func(name string) string { return values[name] })
			if (err == nil) != item.valid {
				t.Fatalf("valid=%v err=%v", item.valid, err)
			}
			if err == nil && settings.PaymentSandbox.Configured() != item.configured {
				t.Fatal("incorrect sandbox configuration")
			}
		})
	}
}

func TestCustomerCheckoutRequiresWebhookConfiguration(test *testing.T) {
	values := map[string]string{"DATABASE_URL": "postgres://localhost/smartpos", "APP_ENV": "development", "PUBLIC_ORIGIN": "http://localhost:8088", "SMTP_ADDR": "localhost:1025", "MAIL_FROM": "noreply@example.test", "AUTH_TRUSTED_PROXY_IP": "172.30.42.2", "STRIPE_TEST_SECRET_KEY": "sk_test_synthetic", "STRIPE_CUSTOMER_CHECKOUT_ENABLED": "true"}
	if _, err := Parse(func(name string) string { return values[name] }); err == nil {
		test.Fatal("customer Checkout must not enable without a webhook signing secret")
	}
}

func TestCustomerCheckoutRejectsMalformedFlag(test *testing.T) {
	for _, value := range []string{"1", "TRUE", "yes", " true", "false\n"} {
		test.Run(value, func(test *testing.T) {
			values := map[string]string{"DATABASE_URL": "postgres://localhost/smartpos", "APP_ENV": "development", "PUBLIC_ORIGIN": "http://localhost:8088", "SMTP_ADDR": "localhost:1025", "MAIL_FROM": "noreply@example.test", "STRIPE_CUSTOMER_CHECKOUT_ENABLED": value}
			if _, err := Parse(func(name string) string { return values[name] }); err == nil {
				test.Fatal("malformed customer Checkout flag was accepted")
			}
		})
	}
}

func TestCustomerCheckoutConfiguration(test *testing.T) {
	const signingSecret = "whsec_synthetic_customer_test_only"
	for _, item := range []struct {
		name, environment, flag, key, secret string
		valid, enabled                       bool
	}{
		{"disabled by default", "development", "", "", "", true, false},
		{"management sandbox only", "development", "", "sk_test_synthetic", "", true, false},
		{"explicitly disabled", "development", "false", "sk_test_synthetic", signingSecret, true, false},
		{"enabled test payments", "development", "true", "sk_test_synthetic", signingSecret, true, true},
		{"missing test key", "development", "true", "", signingSecret, false, false},
		{"missing signing secret", "development", "true", "sk_test_synthetic", "", false, false},
		{"live key", "development", "true", "sk_live_synthetic", signingSecret, false, false},
		{"invalid signing secret", "development", "true", "sk_test_synthetic", "invalid_synthetic_secret", false, false},
		{"invalid disabled signing secret", "development", "false", "", "invalid_synthetic_secret", false, false},
		{"signing secret for recovery only", "development", "false", "", signingSecret, true, false},
		{"production disabled", "production", "false", "", "", true, false},
		{"production cannot enable", "production", "true", "", "", false, false},
		{"production rejects signing secret", "production", "false", "", signingSecret, false, false},
	} {
		test.Run(item.name, func(test *testing.T) {
			values := map[string]string{
				"DATABASE_URL": "postgres://localhost/smartpos", "APP_ENV": item.environment, "PUBLIC_ORIGIN": "https://example.test",
				"SMTP_ADDR": "localhost:1025", "MAIL_FROM": "noreply@example.test", "SMTP_USER": "synthetic", "SMTP_PASSWORD": "synthetic",
				"AUTH_TRUSTED_PROXY_IP": "172.30.42.2", "STRIPE_TEST_SECRET_KEY": item.key,
				"STRIPE_CUSTOMER_CHECKOUT_ENABLED": item.flag, "STRIPE_CUSTOMER_WEBHOOK_SECRET": item.secret,
			}
			settings, err := Parse(func(name string) string { return values[name] })
			if (err == nil) != item.valid {
				test.Fatalf("valid=%v err=%v", item.valid, err)
			}
			if err == nil && (settings.CustomerPayments == nil || settings.CustomerPayments.Enabled() != item.enabled) {
				test.Fatal("incorrect customer payment configuration")
			}
			if err != nil && ((item.key != "" && strings.Contains(err.Error(), item.key)) || (item.secret != "" && strings.Contains(err.Error(), item.secret))) {
				test.Fatal("configuration error exposed a payment credential")
			}
		})
	}
}

func TestRejectsMalformedSingleStoreOrganization(t *testing.T) {
	for _, value := range []string{"first-store", "11111111-1111-4111-8111-111111111111,22222222-2222-4222-8222-222222222222", " 11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111\n"} {
		t.Run(value, func(t *testing.T) {
			_, err := Parse(func(key string) string {
				switch key {
				case "DATABASE_URL":
					return "postgres://localhost/smartpos"
				case "APP_ENV":
					return "development"
				case "PUBLIC_ORIGIN":
					return "http://localhost:8088"
				case "SINGLE_STORE_ORGANIZATION_ID":
					return value
				case "SMTP_ADDR":
					return "localhost:1025"
				case "MAIL_FROM":
					return "noreply@localhost"
				default:
					return ""
				}
			})
			if err == nil {
				t.Fatal("malformed single-store configuration was accepted")
			}
		})
	}
}

func TestSingleStoreConfigurationNormalizesValidUUID(t *testing.T) {
	for _, value := range []string{"", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"} {
		settings, err := Parse(func(key string) string {
			switch key {
			case "DATABASE_URL":
				return "postgres://localhost/smartpos"
			case "APP_ENV":
				return "development"
			case "PUBLIC_ORIGIN":
				return "http://localhost:8088"
			case "SMTP_ADDR":
				return "localhost:1025"
			case "MAIL_FROM":
				return "noreply@localhost"
			case "SINGLE_STORE_ORGANIZATION_ID":
				return value
			default:
				return ""
			}
		})
		if err != nil || settings.SingleStoreOrganizationID != strings.ToLower(value) {
			t.Fatalf("valid single-store config: %v", err)
		}
	}
}

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
