package customers

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
		writer.Header().Set("Cache-Control", "no-store")
		result, err := run(ctx, identity.SessionFromContext(ctx).User.ID, chi.URLParam(request, "id"), request)
		if err == nil {
			httpx.JSON(writer, 200, map[string]any{"data": result})
			return
		}
		status, code, message := 503, "DEPENDENCY_UNAVAILABLE", "Customer service unavailable"
		switch {
		case errors.Is(err, ErrInput):
			status, code, message = 400, "INVALID_INPUT", "Check customer details and filters"
		case errors.Is(err, ErrConflict):
			status, code, message = 409, "CONFLICT", "Revision, status or identifier conflicts; refresh before retrying"
		case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound):
			status, code, message = 404, "NOT_FOUND", "Customer resource not found"
		case errors.Is(err, organization.ErrDenied):
			status, code, message = 403, "FORBIDDEN", "Customer permission required"
		}
		httpx.Error(writer, request, status, code, message)
	}
}
func decode(request *http.Request, input any) error {
	media, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
	if err != nil || media != "application/json" {
		return ErrInput
	}
	request.Body = http.MaxBytesReader(nil, request.Body, 16<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(input) != nil || decoder.Decode(&struct{}{}) != io.EOF {
		return ErrInput
	}
	return nil
}
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	router.Get("/customers", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		filters, err := filter(request.URL.Query())
		if err != nil {
			return nil, err
		}
		return service.List(ctx, user, org, filters)
	}))
	router.Post("/customers/search", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var filters Filter
		if err := decode(request, &filters); err != nil {
			return nil, err
		}
		return service.List(ctx, user, org, filters)
	}))
	router.Post("/customers", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input Input
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.Save(ctx, user, org, "", request.Header.Get("Idempotency-Key"), input)
	}))
	router.Get("/customers/{customerId}", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Get(ctx, user, org, chi.URLParam(request, "customerId"))
	}))
	router.Put("/customers/{customerId}", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input Input
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.Save(ctx, user, org, chi.URLParam(request, "customerId"), "", input)
	}))
	for _, resource := range []struct {
		path  string
		group bool
	}{{"/customers/{customerId}", false}, {"/customers/groups/{groupId}", true}} {
		router.Post(resource.path+"/archive", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			var input struct {
				Revision int64 `json:"revision"`
			}
			if err := decode(request, &input); err != nil {
				return nil, err
			}
			id := chi.URLParam(request, "customerId")
			if resource.group {
				id = chi.URLParam(request, "groupId")
			}
			return service.Archive(ctx, user, org, id, input.Revision, resource.group)
		}))
	}
	for _, resource := range []string{"history", "audit"} {
		router.Get("/customers/{customerId}/"+resource, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			filters, err := filter(request.URL.Query())
			if err != nil {
				return nil, err
			}
			if resource == "history" {
				return service.History(ctx, user, org, chi.URLParam(request, "customerId"), filters)
			}
			return service.Audit(ctx, user, org, chi.URLParam(request, "customerId"), filters)
		}))
	}
	router.Get("/customers/groups", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		filters, err := filter(request.URL.Query())
		if err != nil {
			return nil, err
		}
		return service.Groups(ctx, user, org, filters)
	}))
	for _, method := range []string{"POST", "PUT"} {
		path := "/customers/groups"
		if method == "PUT" {
			path += "/{groupId}"
		}
		router.MethodFunc(method, path, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			var input Group
			if err := decode(request, &input); err != nil {
				return nil, err
			}
			return service.SaveGroup(ctx, user, org, chi.URLParam(request, "groupId"), request.Header.Get("Idempotency-Key"), input)
		}))
	}
	router.Put("/customers/{customerId}/groups/{groupId}", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input MembershipInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.Membership(ctx, user, org, chi.URLParam(request, "customerId"), chi.URLParam(request, "groupId"), input)
	}))
}
