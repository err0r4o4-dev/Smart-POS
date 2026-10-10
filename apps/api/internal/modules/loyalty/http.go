package loyalty

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"io"
	"mime"
	"net/http"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/httpx"
	"strconv"
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
		status, code, message := 503, "DEPENDENCY_UNAVAILABLE", "Loyalty service unavailable"
		switch {
		case errors.Is(err, ErrInput), errors.Is(err, inventory.ErrInput):
			status, code, message = 400, "INVALID_INPUT", "Check loyalty details"
		case errors.Is(err, ErrConflict), errors.Is(err, inventory.ErrConflict):
			status, code, message = 409, "CONFLICT", "Loyalty state changed; refresh before retrying"
		case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound):
			status, code, message = 404, "NOT_FOUND", "Loyalty resource not found"
		case errors.Is(err, organization.ErrDenied):
			status, code, message = 403, "FORBIDDEN", "Loyalty permission required"
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
	for _, resource := range []string{"programs", "accounts", "history"} {
		router.Get("/loyalty/"+resource, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			page := 1
			if value := request.URL.Query().Get("page"); value != "" {
				var err error
				page, err = strconv.Atoi(value)
				if err != nil {
					return nil, ErrInput
				}
			}
			return handler.Service.Read(ctx, user, org, resource, request.URL.Query().Get("customer_id"), request.URL.Query().Get("branch_id"), page)
		}))
	}
	for _, update := range []bool{false, true} {
		method, path := "POST", "/loyalty/programs"
		if update {
			method, path = "PUT", "/loyalty/programs/{loyaltyId}"
		}
		router.MethodFunc(method, path, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			var input ProgramInput
			if err := decode(request, &input); err != nil {
				return nil, err
			}
			return handler.Service.SaveProgram(ctx, user, org, chi.URLParam(request, "loyaltyId"), request.Header.Get("Idempotency-Key"), input)
		}))
		path = "/loyalty/accounts"
		if update {
			path = "/loyalty/accounts/{loyaltyId}"
		}
		router.MethodFunc(method, path, endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			var input AccountInput
			if err := decode(request, &input); err != nil {
				return nil, err
			}
			return handler.Service.SaveAccount(ctx, user, org, chi.URLParam(request, "loyaltyId"), request.Header.Get("Idempotency-Key"), input)
		}))
	}
	router.Post("/loyalty/accounts/{loyaltyId}/adjust", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input AdjustmentInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return handler.Service.Adjust(ctx, user, org, chi.URLParam(request, "loyaltyId"), request.Header.Get("Idempotency-Key"), input)
	}))
}
