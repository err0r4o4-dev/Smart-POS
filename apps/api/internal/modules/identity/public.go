package identity

import (
	"net/http"
	"smartpos/api/internal/platform/httpx"
	"strconv"
	"time"
)

func (handler Handler) RequirePublicWrite(scope string, limit int, window time.Duration) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			if !handler.requireOrigin(writer, request) {
				return
			}
			allowed, err := handler.Service.Allow(request.Context(), scope, "ip:"+handler.clientIP(request), limit, window)
			if err != nil {
				httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Service unavailable")
				return
			}
			if !allowed {
				writer.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
				httpx.Error(writer, request, 429, "RATE_LIMITED", "Too many requests; try again later")
				return
			}
			next.ServeHTTP(writer, request)
		})
	}
}
