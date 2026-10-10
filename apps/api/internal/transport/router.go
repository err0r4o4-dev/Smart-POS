package transport

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/loyalty"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/pos"
	"smartpos/api/internal/modules/pricing"
	"smartpos/api/internal/modules/purchasing"
	"smartpos/api/internal/modules/returns"
	"smartpos/api/internal/platform/httpx"
)

type Readiness interface{ Ready(context.Context) error }

func Router(checker Readiness, logger *slog.Logger, authentication ...identity.Handler) http.Handler {
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
		if len(authentication) > 0 {
			authentication[0].Routes(version)
			mailer, _ := authentication[0].Service.Mailer.(organization.InvitationMailer)
			organizations := &organization.Service{Pool: authentication[0].Service.Pool, Mailer: mailer}
			catalogHandler := catalog.Handler{Service: &catalog.Service{Organization: organizations}, Authentication: authentication[0]}
			inventoryHandler := inventory.Handler{Service: &inventory.Service{Organization: organizations}}
			posHandler := pos.Handler{Service: &pos.Service{Organization: organizations}}
			purchasingHandler := purchasing.Handler{Service: &purchasing.Service{Organization: organizations}}
			returnsHandler := returns.Handler{Service: &returns.Service{Organization: organizations}}
			pricingHandler := pricing.Handler{Service: &pricing.Service{Organization: organizations}}
			customerHandler := customers.Handler{Service: &customers.Service{Organization: organizations}}
			loyaltyHandler := loyalty.Handler{Service: &loyalty.Service{Organization: organizations}}
			organization.Handler{Service: organizations, Authentication: authentication[0]}.Routes(version, catalogHandler.TenantRoutes, inventoryHandler.TenantRoutes, posHandler.TenantRoutes, purchasingHandler.TenantRoutes, returnsHandler.TenantRoutes, pricingHandler.TenantRoutes, customerHandler.TenantRoutes, loyaltyHandler.TenantRoutes)
		}
		version.Get("/system", func(writer http.ResponseWriter, request *http.Request) {
			httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"name": "SmartPOS", "phase": 0, "authentication": "server_sessions"}})
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
