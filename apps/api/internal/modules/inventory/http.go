package inventory

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"io"
	"net/http"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/httpx"
	"time"
)

type Handler struct{ Service *Service }

func respond(writer http.ResponseWriter, request *http.Request, result any, err error, status int) {
	if err == nil {
		httpx.JSON(writer, status, map[string]any{"data": result})
		return
	}
	code, message, status := "DEPENDENCY_UNAVAILABLE", "Inventory service unavailable", 503
	switch {
	case errors.Is(err, ErrInput):
		code, message, status = "INVALID_INPUT", "Check inventory references, units, quantities and reason", 400
	case errors.Is(err, ErrConflict):
		code, message, status = "CONFLICT", "Insufficient stock, stale snapshot/revision, duplicate key or invalid transition; refresh and review", 409
	case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound):
		code, message, status = "NOT_FOUND", "Inventory resource not found", 404
	case errors.Is(err, organization.ErrDenied):
		code, message, status = "FORBIDDEN", "Inventory operation is not permitted for this branch", 403
	}
	httpx.Error(writer, request, status, code, message)
}
func decode(writer http.ResponseWriter, request *http.Request, input any) bool {
	if request.Header.Get("Content-Type") != "application/json" {
		httpx.Error(writer, request, 415, "UNSUPPORTED_MEDIA_TYPE", "JSON is required")
		return false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, 64<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Invalid inventory JSON")
		return false
	}
	return true
}
func endpoint(status int, run func(context.Context, string, string, *http.Request) (any, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 15*time.Second)
		defer cancel()
		result, err := run(ctx, identity.SessionFromContext(ctx).User.ID, chi.URLParam(request, "id"), request)
		respond(writer, request, result, err, status)
	}
}
func writeEndpoint[Input any](status int, run func(context.Context, string, string, *http.Request, Input) (any, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		var input Input
		if !decode(writer, request, &input) {
			return
		}
		ctx, cancel := context.WithTimeout(request.Context(), 15*time.Second)
		defer cancel()
		result, err := run(ctx, identity.SessionFromContext(ctx).User.ID, chi.URLParam(request, "id"), request, input)
		respond(writer, request, result, err, status)
	}
}
func (handler Handler) TenantRoutes(router chi.Router) {
	router.Route("/inventory", func(tenant chi.Router) {
		for _, resource := range []string{"overview", "locations", "balances", "movements", "adjustments", "counts", "transfers", "reorder-points"} {
			tenant.Get("/"+resource, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
				filters, err := filter(request.URL.Query())
				if err != nil {
					return nil, err
				}
				return handler.Service.List(ctx, user, org, resource, filters)
			}))
			if resource != "overview" && resource != "reorder-points" {
				tenant.Get("/"+resource+"/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
					return handler.Service.Get(ctx, user, org, resource, chi.URLParam(request, "resourceId"))
				}))
			}
		}
		tenant.Post("/locations", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input LocationInput) (any, error) {
			return handler.Service.SaveLocation(ctx, user, org, "", input)
		}))
		tenant.Patch("/locations/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input LocationInput) (any, error) {
			return handler.Service.SaveLocation(ctx, user, org, chi.URLParam(request, "resourceId"), input)
		}))
		tenant.Post("/opening-balances", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input Command) (any, error) {
			return handler.Service.Opening(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
		}))
		tenant.Put("/reorder-points", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ReorderInput) (any, error) {
			return handler.Service.SaveReorder(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
		}))
		for resource, kind := range map[string]string{"adjustments": "ADJUSTMENT", "counts": "COUNT", "transfers": "TRANSFER"} {
			tenant.Post("/"+resource, writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input Command) (any, error) {
				return handler.Service.CreateDocument(ctx, user, org, kind, request.Header.Get("Idempotency-Key"), input)
			}))
			for _, action := range []string{"submit", "approve", "post", "reject", "cancel", "dispatch", "receive"} {
				if kind == "COUNT" && contains([]string{"dispatch", "receive", "reject"}, action) || kind == "ADJUSTMENT" && contains([]string{"dispatch", "receive"}, action) || kind == "TRANSFER" && contains([]string{"post", "reject"}, action) {
					continue
				}
				tenant.Post("/"+resource+"/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input Command) (any, error) {
					return handler.Service.Act(ctx, user, org, kind, chi.URLParam(request, "resourceId"), action, request.Header.Get("Idempotency-Key"), input)
				}))
			}
		}
		tenant.Patch("/counts/{resourceId}/items", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input Command) (any, error) {
			return handler.Service.SaveCount(ctx, user, org, chi.URLParam(request, "resourceId"), request.Header.Get("Idempotency-Key"), input)
		}))
	})
}
