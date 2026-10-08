package httpx

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

type contextKey struct{}

type ErrorBody struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	RequestID string `json:"request_id"`
}

func RequestID(ctx context.Context) string {
	value, _ := ctx.Value(contextKey{}).(string)
	return value
}

func JSON(writer http.ResponseWriter, status int, value any) {
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(value)
}

func Error(writer http.ResponseWriter, request *http.Request, status int, code, message string) {
	JSON(writer, status, struct {
		Error ErrorBody `json:"error"`
	}{ErrorBody{code, message, RequestID(request.Context())}})
}

func RequestIDs(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		identifier := make([]byte, 16)
		if _, err := rand.Read(identifier); err != nil {
			http.Error(writer, "service unavailable", http.StatusServiceUnavailable)
			return
		}
		value := hex.EncodeToString(identifier)
		writer.Header().Set("X-Request-ID", value)
		next.ServeHTTP(writer, request.WithContext(context.WithValue(request.Context(), contextKey{}, value)))
	})
}

func Security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("X-Content-Type-Options", "nosniff")
		writer.Header().Set("X-Frame-Options", "DENY")
		writer.Header().Set("Referrer-Policy", "no-referrer")
		writer.Header().Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(writer, request)
	})
}

func Recover(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			defer func() {
				if recover() != nil {
					logger.Error("request panic", "request_id", RequestID(request.Context()))
					Error(writer, request, 500, "INTERNAL_ERROR", "An unexpected error occurred")
				}
			}()
			next.ServeHTTP(writer, request)
		})
	}
}

func AccessLog(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			started := time.Now()
			next.ServeHTTP(writer, request)
			logger.Info("request completed", "request_id", RequestID(request.Context()), "method", request.Method, "duration_ms", time.Since(started).Milliseconds())
		})
	}
}
