package transport

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http/httptest"
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
			logger := slog.New(slog.NewJSONHandler(io.Discard, nil))
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
