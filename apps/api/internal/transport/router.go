package transport

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/platform/httpx"
)

type Readiness interface{ Ready(context.Context) error }

func Router(checker Readiness, logger *slog.Logger) http.Handler {
	router := chi.NewRouter()
	router.Use(httpx.RequestIDs, httpx.Security, httpx.Recover(logger), httpx.AccessLog(logger))
	router.Get("/health/live", func(writer http.ResponseWriter, request *http.Request) {
		httpx.JSON(writer, 200, map[string]string{"status": "ok"})
	})
	router.Get("/health/ready", func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 2*time.Second)
		defer cancel()
		if checker.Ready(ctx) != nil {
			httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Required dependencies are not ready")
			return
		}
		httpx.JSON(writer, 200, map[string]string{"status": "ready"})
	})
	router.Route("/api/v1", func(version chi.Router) {
		version.Get("/system", func(writer http.ResponseWriter, request *http.Request) {
			httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"name": "SmartPOS", "phase": 0, "authentication": "not_implemented"}})
		})
	})
	router.NotFound(func(writer http.ResponseWriter, request *http.Request) {
		httpx.Error(writer, request, 404, "NOT_FOUND", "Endpoint not found")
	})
	router.MethodNotAllowed(func(writer http.ResponseWriter, request *http.Request) {
		httpx.Error(writer, request, 405, "METHOD_NOT_ALLOWED", "Method not allowed")
	})
	return router
}
