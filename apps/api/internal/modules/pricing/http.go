package pricing

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

func endpoint(run func(context.Context, string, string, *http.Request) (any, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 15*time.Second)
		defer cancel()
		result, err := run(ctx, identity.SessionFromContext(ctx).User.ID, chi.URLParam(request, "id"), request)
		if err == nil {
			httpx.JSON(writer, 200, map[string]any{"data": result})
			return
		}
		code, message, status := "DEPENDENCY_UNAVAILABLE", "Pricing service unavailable", 503
		switch {
		case errors.Is(err, ErrInput):
			code, message, status = "INVALID_INPUT", "Check pricing details", 400
		case errors.Is(err, ErrConflict):
			code, message, status = "CONFLICT", "Pricing, cart or approval changed", 409
		case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound):
			code, message, status = "NOT_FOUND", "Pricing resource not found", 404
		case errors.Is(err, organization.ErrDenied):
			code, message, status = "FORBIDDEN", "Pricing permission required", 403
		}
		httpx.Error(writer, request, status, code, message)
	}
}
func decode(request *http.Request, input any) error {
	media, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return ErrInput
	}
	request.Body = http.MaxBytesReader(nil, request.Body, 64<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return ErrInput
	}
	return nil
}
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	for _, resource := range []struct{ path, table string }{{"/pricing/lists", "price_lists"}, {"/promotions", "promotions"}} {
		table := resource.table
		router.Get(resource.path, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.List(ctx, user, org, table, "")
		}))
		router.Get(resource.path+"/{resourceId}", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.List(ctx, user, org, table, chi.URLParam(request, "resourceId"))
		}))
		for _, method := range []string{"POST", "PUT"} {
			path := resource.path
			if method == "PUT" {
				path += "/{resourceId}"
			}
			router.MethodFunc(method, path, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
				var input Definition
				if err := decode(request, &input); err != nil {
					return nil, err
				}
				return service.Save(ctx, user, org, table, chi.URLParam(request, "resourceId"), input)
			}))
		}
		for _, action := range []string{"submit", "approve", "activate", "pause"} {
			router.Post(resource.path+"/{resourceId}/"+action, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
				var input struct {
					Revision int64 `json:"revision"`
				}
				if err := decode(request, &input); err != nil {
					return nil, err
				}
				return service.Transition(ctx, user, org, table, chi.URLParam(request, "resourceId"), action, input.Revision)
			}))
		}
	}
	router.Get("/discount-approvals", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Approvals(ctx, user, org)
	}))
	router.Post("/discount-approvals", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input ApprovalInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.RequestApproval(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
	}))
	for _, action := range []string{"approve", "reject"} {
		router.Post("/discount-approvals/{resourceId}/"+action, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			var input struct {
				Revision int64 `json:"revision"`
			}
			if err := decode(request, &input); err != nil {
				return nil, err
			}
			return service.Decide(ctx, user, org, chi.URLParam(request, "resourceId"), action, input.Revision)
		}))
	}
}
