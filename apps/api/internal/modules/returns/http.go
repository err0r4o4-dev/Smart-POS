package returns

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"io"
	"mime"
	"net/http"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/httpx"
	"time"
)

type Handler struct{ Service *Service }

func endpoint(status int, run func(context.Context, string, string, *http.Request) (any, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		session := identity.SessionFromContext(request.Context())
		if session.User.ID == "" {
			httpx.Error(writer, request, 401, "UNAUTHENTICATED", "Sign in required")
			return
		}
		ctx, cancel := context.WithTimeout(organization.WithRequestID(request.Context(), httpx.RequestID(request.Context())), 15*time.Second)
		defer cancel()
		value, err := run(ctx, session.User.ID, chi.URLParam(request, "id"), request)
		if err == nil {
			httpx.JSON(writer, status, map[string]any{"data": value})
			return
		}
		code, message, status := "DEPENDENCY_UNAVAILABLE", "Returns service unavailable", 503
		switch {
		case errors.Is(err, ErrInput):
			code, message, status = "INVALID_INPUT", "Check submitted fields and quantities", 400
		case errors.Is(err, ErrConflict), errors.Is(err, organization.ErrConflict):
			code, message, status = "CONFLICT", "State, quantity or revision changed; reload and review", 409
		case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound):
			code, message, status = "NOT_FOUND", "Resource not found", 404
		case errors.Is(err, organization.ErrDenied):
			code, message, status = "FORBIDDEN", "Operation is not permitted", 403
		}
		httpx.Error(writer, request, status, code, message)
	}
}
func writeEndpoint[Input any](status int, run func(context.Context, string, string, *http.Request, Input) (any, error)) http.HandlerFunc {
	return endpoint(status, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		media, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			return nil, ErrInput
		}
		request.Body = http.MaxBytesReader(nil, request.Body, 64<<10)
		decoder := json.NewDecoder(request.Body)
		decoder.DisallowUnknownFields()
		var input Input
		if decoder.Decode(&input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
			return nil, ErrInput
		}
		return run(ctx, user, org, request, input)
	})
}
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	for _, kind := range []string{"returns", "refunds"} {
		router.Get("/"+kind, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			input, err := filter(request.URL.Query())
			if err != nil {
				return nil, err
			}
			return service.List(ctx, user, org, kind, input)
		}))
		router.Get("/"+kind+"/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Get(ctx, user, org, kind, chi.URLParam(request, "resourceId"))
		}))
	}
	router.Get("/returns/sales/{saleId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Get(ctx, user, org, "sale", chi.URLParam(request, "saleId"))
	}))
	router.Post("/returns", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input CreateInput) (any, error) {
		return service.Create(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
	}))
	for _, action := range []string{"submit", "approve", "reject", "cancel", "complete"} {
		router.Post("/returns/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ActionInput) (any, error) {
			return service.Transition(ctx, user, org, chi.URLParam(request, "resourceId"), action, request.Header.Get("Idempotency-Key"), input)
		}))
	}
	for _, entry := range []struct{ Path, Action string }{{"report-settlement", "report"}, {"confirm-settlement", "confirm"}, {"reconcile", "reconcile"}} {
		router.Post("/refunds/{resourceId}/"+entry.Path, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input SettlementInput) (any, error) {
			return service.Settle(ctx, user, org, chi.URLParam(request, "resourceId"), entry.Action, request.Header.Get("Idempotency-Key"), input)
		}))
	}
}
