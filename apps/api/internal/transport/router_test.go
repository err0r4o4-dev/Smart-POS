package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"smartpos/api/internal/platform/httpx"
)

type readinessStub struct {
	err        error
	panicValue bool
}

func (stub readinessStub) Ready(ctx context.Context) error {
	if stub.panicValue {
		panic("secret must never escape")
	}
	if _, ok := ctx.Deadline(); !ok {
		return errors.New("deadline missing")
	}
	return stub.err
}

func TestRoutes(t *testing.T) {
	cases := []struct {
		name, method, path string
		checker            readinessStub
		status             int
		code               string
	}{
		{"live", "GET", "/health/live", readinessStub{err: errors.New("offline")}, 200, ""},
		{"ready", "GET", "/health/ready", readinessStub{}, 200, ""},
		{"offline", "GET", "/health/ready", readinessStub{err: errors.New("secret database URL")}, 503, "DEPENDENCY_UNAVAILABLE"},
		{"system", "GET", "/api/v1/system", readinessStub{}, 200, ""},
		{"unknown", "GET", "/api/v1/products", readinessStub{}, 404, "NOT_FOUND"},
		{"method", "POST", "/health/live", readinessStub{}, 405, "METHOD_NOT_ALLOWED"},
		{"panic", "GET", "/health/ready", readinessStub{panicValue: true}, 500, "INTERNAL_ERROR"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&output, nil))
			request := httptest.NewRequest(item.method, item.path, nil)
			request.Header.Set("X-Request-ID", "untrusted")
			writer := httptest.NewRecorder()
			Router(item.checker, logger).ServeHTTP(writer, request)
			if writer.Code != item.status {
				t.Fatalf("status=%d body=%s", writer.Code, writer.Body.String())
			}
			id := writer.Header().Get("X-Request-ID")
			if len(id) != 32 || id == "untrusted" {
				t.Fatal("invalid generated request ID")
			}
			if writer.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("missing security header")
			}
			accessCount := 0
			for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
				var entry map[string]any
				if err := json.Unmarshal([]byte(line), &entry); err != nil {
					t.Fatal(err)
				}
				if entry["msg"] == "http_request" {
					accessCount++
					if entry["status"] != float64(item.status) || entry["request_id"] != id || entry["path"] != item.path {
						t.Fatalf("incorrect access log: %v", entry)
					}
				}
			}
			if accessCount != 1 {
				t.Fatalf("access logs=%d", accessCount)
			}
			if item.code != "" {
				var result struct {
					Error httpx.ErrorBody `json:"error"`
				}
				if err := json.Unmarshal(writer.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Error.Code != item.code || result.Error.RequestID != id {
					t.Fatalf("bad envelope: %+v", result)
				}
			}
		})
	}
}
