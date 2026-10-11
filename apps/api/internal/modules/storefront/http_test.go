package storefront

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestStrictOrderJSON(t *testing.T) {
	for name, body := range map[string]string{
		"unknown field":   `{"access_token":"x","price":"0"}`,
		"multiple bodies": `{} {}`,
		"oversized body":  `{"customer_note":"` + strings.Repeat("x", 65536) + `"}`,
		"malformed":       `{`,
	} {
		t.Run(name, func(t *testing.T) {
			called := false
			handler := writeEndpoint(201, func(_ context.Context, _, _ string, _ *http.Request, _ OrderInput) (any, error) {
				called = true
				return nil, nil
			})
			request := httptest.NewRequest("POST", "/", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			handler(writer, request)
			if writer.Code != 400 || called {
				t.Fatalf("status %d, invoked %v", writer.Code, called)
			}
		})
	}
}
