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

func TestSettingsSourceJSONContract(test *testing.T) {
	front := "11111111-1111-4111-8111-111111111111"
	back := "22222222-2222-4222-8222-222222222222"
	for name, example := range map[string]struct {
		field  string
		source string
		status int
	}{
		"legacy omitted":       {field: "", status: 200},
		"explicit shared":      {field: `,"online_terminal_id":""`, status: 200},
		"separate warehouse":   {field: `,"online_terminal_id":"` + back + `"`, source: back, status: 200},
		"invalid source":       {field: `,"online_terminal_id":"wrong"`, status: 400},
		"wrong type":           {field: `,"online_terminal_id":123`, status: 400},
		"unknown source field": {field: `,"online_stock_override":"warehouse"`, status: 400},
	} {
		test.Run(name, func(test *testing.T) {
			var source string
			handler := writeEndpoint(200, func(_ context.Context, _, _ string, _ *http.Request, input SettingsInput) (any, error) {
				if err := input.validate(); err != nil {
					return nil, err
				}
				source = input.OnlineTerminalID
				return Settings{TerminalID: input.TerminalID, OnlineTerminalID: source}, nil
			})
			body := `{"slug":"source-shop","name":"Synthetic shop","terminal_id":"` + front + `","revision":0` + example.field + `}`
			request := httptest.NewRequest("PUT", "/", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			handler(writer, request)
			if writer.Code != example.status || source != example.source {
				test.Fatalf("source JSON status %d source %q, expected %d %q", writer.Code, source, example.status, example.source)
			}
		})
	}
}
