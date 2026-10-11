package httpx

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAccessLog(t *testing.T) {
	cases := []struct {
		name   string
		status int
		level  string
		handle http.HandlerFunc
	}{
		{"implicit", 200, "INFO", func(writer http.ResponseWriter, request *http.Request) { _, _ = writer.Write([]byte("ok")) }},
		{"empty", 200, "INFO", func(writer http.ResponseWriter, request *http.Request) {}},
		{"not found", 404, "WARN", func(writer http.ResponseWriter, request *http.Request) { writer.WriteHeader(404) }},
		{"method", 405, "WARN", func(writer http.ResponseWriter, request *http.Request) { writer.WriteHeader(405) }},
		{"unavailable", 503, "ERROR", func(writer http.ResponseWriter, request *http.Request) { writer.WriteHeader(503) }},
		{"panic", 500, "ERROR", func(writer http.ResponseWriter, request *http.Request) { panic("private-panic") }},
		{"committed panic", 201, "INFO", func(writer http.ResponseWriter, request *http.Request) {
			writer.WriteHeader(201)
			panic("private-panic")
		}},
		{"informational", 204, "INFO", func(writer http.ResponseWriter, request *http.Request) {
			writer.WriteHeader(103)
			writer.WriteHeader(204)
		}},
		{"flush", 200, "INFO", func(writer http.ResponseWriter, request *http.Request) { writer.(http.Flusher).Flush() }},
		{"first status", 201, "INFO", func(writer http.ResponseWriter, request *http.Request) {
			writer.WriteHeader(201)
			writer.WriteHeader(500)
		}},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&output, nil)).With("service", "api")
			handler := RequestIDs(AccessLog(logger)(Recover(logger)(item.handle)))
			request := httptest.NewRequest("POST", "/example?token=private-query", strings.NewReader("private-body"))
			request.Header.Set("Authorization", "Bearer private-auth")
			request.Header.Set("Cookie", "session=private-cookie")
			writer := httptest.NewRecorder()
			handler.ServeHTTP(writer, request)
			var access map[string]any
			count := 0
			for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
				var entry map[string]any
				if err := json.Unmarshal([]byte(line), &entry); err != nil {
					t.Fatal(err)
				}
				if entry["msg"] == "http_request" {
					access = entry
					count++
				}
			}
			if count != 1 || access["status"] != float64(item.status) || access["level"] != item.level {
				t.Fatalf("unexpected access log: %s", output.String())
			}
			if access["method"] != "POST" || access["path"] != "/example" || access["service"] != "api" || access["request_id"] != writer.Header().Get("X-Request-ID") {
				t.Fatalf("missing request context: %v", access)
			}
			if latency, ok := access["latency_ms"].(float64); !ok || latency < 0 {
				t.Fatal("invalid latency")
			}
			if strings.Contains(output.String(), "private-") {
				t.Fatal("private data in log")
			}
		})
	}
}
