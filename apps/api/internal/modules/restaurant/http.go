package restaurant

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
	"time"
)

type Handler struct{ Service *Service }

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

func endpoint(run func(context.Context, string, string, *http.Request) (any, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 15*time.Second)
		defer cancel()
		ctx = organization.WithRequestID(ctx, httpx.RequestID(ctx))
		writer.Header().Set("Cache-Control", "no-store")
		result, err := run(ctx, identity.SessionFromContext(ctx).User.ID, chi.URLParam(request, "id"), request)
		if err == nil {
			httpx.JSON(writer, 200, map[string]any{"data": result})
			return
		}
		status, code, message := 503, "DEPENDENCY_UNAVAILABLE", "ระบบร้านอาหารยังไม่พร้อม"
		switch {
		case errors.Is(err, ErrInput), errors.Is(err, inventory.ErrInput):
			status, code, message = 400, "INVALID_INPUT", "ตรวจสอบข้อมูลร้านอาหารอีกครั้ง"
		case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound), errors.Is(err, inventory.ErrNotFound):
			status, code, message = 404, "NOT_FOUND", "ไม่พบข้อมูลร้านอาหาร"
		case errors.Is(err, ErrConflict), errors.Is(err, organization.ErrConflict), errors.Is(err, inventory.ErrConflict):
			status, code, message = 409, "CONFLICT", "ข้อมูลเปลี่ยนแล้ว กรุณาโหลดใหม่"
		case errors.Is(err, organization.ErrDenied):
			status, code, message = 403, "FORBIDDEN", "ไม่มีสิทธิ์จัดการร้านอาหาร"
		}
		httpx.Error(writer, request, status, code, message)
	}
}

func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	router.Get("/restaurant/settings", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Settings(ctx, user, org, request.URL.Query().Get("branch_id"))
	}))
	router.Patch("/restaurant/settings", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input SettingsInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.SaveSettings(ctx, user, org, input)
	}))
	router.Get("/restaurant/recipes", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Recipes(ctx, user, org, request.URL.Query().Get("branch_id"))
	}))
	router.Post("/restaurant/recipes", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input RecipeInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.SaveRecipe(ctx, user, org, "", request.Header.Get("Idempotency-Key"), input)
	}))
	router.Put("/restaurant/recipes/{recipeId}", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input RecipeInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.SaveRecipe(ctx, user, org, chi.URLParam(request, "recipeId"), "", input)
	}))
	router.Get("/restaurant/tables", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Tables(ctx, user, org, request.URL.Query().Get("branch_id"))
	}))
	router.Post("/restaurant/tables", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input TableInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.SaveTable(ctx, user, org, "", request.Header.Get("Idempotency-Key"), input)
	}))
	router.Put("/restaurant/tables/{tableId}", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input TableInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		return service.SaveTable(ctx, user, org, chi.URLParam(request, "tableId"), "", input)
	}))
	router.Get("/restaurant/queue", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Queue(ctx, user, org, request.URL.Query().Get("branch_id"))
	}))
	router.Get("/restaurant/forecast", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.ForecastStatus(ctx, user, org, request.URL.Query().Get("branch_id"))
	}))
	router.Post("/restaurant/quick-stock", endpoint(func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		var input inventory.QuickStockInput
		if err := decode(request, &input); err != nil {
			return nil, err
		}
		stock := inventory.Service{Organization: service.Organization}
		return stock.QuickStock(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
	}))
}
