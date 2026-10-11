package storefront

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
	"strconv"
	"time"
)

type Handler struct {
	Service        *Service
	Authentication identity.Handler
}
type operation func(context.Context, string, string, *http.Request) (any, error)

func respond(writer http.ResponseWriter, request *http.Request, result any, err error, status int) {
	if err == nil {
		httpx.JSON(writer, status, map[string]any{"data": result})
		return
	}
	code, message, status := "DEPENDENCY_UNAVAILABLE", "ระบบยังไม่พร้อม กรุณาลองใหม่", 503
	switch {
	case errors.Is(err, ErrInput):
		code, message, status = "INVALID_INPUT", "ตรวจสอบข้อมูล จำนวนสินค้า และเบอร์ติดต่อ", 400
	case errors.Is(err, ErrNotFound):
		code, message, status = "NOT_FOUND", "ไม่พบร้านหรือออเดอร์ที่เข้าถึงได้", 404
	case errors.Is(err, organization.ErrDenied):
		code, message, status = "FORBIDDEN", "ไม่มีสิทธิ์ดำเนินการกับร้านหรือสาขานี้", 403
	case errors.Is(err, ErrClosed):
		code, message, status = "STORE_CLOSED", "ร้านปิดรับออเดอร์หรือจุดรับสินค้าไม่พร้อม", 409
	case errors.Is(err, ErrQuote):
		code, message, status = "PRICE_CHANGED", "ข้อมูลหรือราคาเปลี่ยน กรุณาตรวจยอดใหม่ก่อนส่งออเดอร์", 409
	case errors.Is(err, ErrStock):
		code, message, status = "INSUFFICIENT_STOCK", "สินค้าบางรายการไม่พร้อมขายหรือสต็อกไม่พอ กรุณาตรวจตะกร้า", 409
	case errors.Is(err, ErrConflict):
		code, message, status = "CONFLICT", "ข้อมูลเปลี่ยนหรือยังมีออเดอร์/ตะกร้าที่ดำเนินการอยู่ กรุณาโหลดใหม่", 409
	}
	httpx.Error(writer, request, status, code, message)
}
func endpoint(status int, run operation) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 15*time.Second)
		defer cancel()
		ctx = organization.WithRequestID(ctx, httpx.RequestID(ctx))
		result, err := run(ctx, identity.SessionFromContext(ctx).User.ID, chi.URLParam(request, "id"), request)
		respond(writer, request, result, err, status)
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
func page(request *http.Request) (int, error) {
	if request.URL.Query().Get("page") == "" {
		return 1, nil
	}
	value, err := strconv.Atoi(request.URL.Query().Get("page"))
	if err != nil || value < 1 || value > 10000 {
		return 0, ErrInput
	}
	return value, nil
}
func (handler Handler) PublicRoutes(router chi.Router) {
	service := handler.Service
	router.Get("/storefronts", endpoint(200, func(ctx context.Context, _, _ string, _ *http.Request) (any, error) { return service.Directory(ctx) }))
	router.Route("/storefronts/{slug}", func(public chi.Router) {
		public.Get("/", endpoint(200, func(ctx context.Context, _, _ string, request *http.Request) (any, error) {
			return service.PublicSettings(ctx, chi.URLParam(request, "slug"))
		}))
		public.Get("/products", endpoint(200, func(ctx context.Context, _, _ string, request *http.Request) (any, error) {
			number, err := page(request)
			if err != nil {
				return nil, err
			}
			return service.Products(ctx, "", "", chi.URLParam(request, "slug"), request.URL.Query().Get("search"), number)
		}))
		public.With(handler.Authentication.RequirePublicWrite("storefront.quote", 120, time.Minute)).Post("/quote", writeEndpoint(200, func(ctx context.Context, _, _ string, request *http.Request, input QuoteInput) (any, error) {
			return service.Quote(ctx, chi.URLParam(request, "slug"), input)
		}))
		public.With(handler.Authentication.RequirePublicWrite("storefront.order", 20, time.Hour)).Post("/orders", writeEndpoint(201, func(ctx context.Context, _, _ string, request *http.Request, input OrderInput) (any, error) {
			return service.CreateOrder(ctx, chi.URLParam(request, "slug"), request.Header.Get("Idempotency-Key"), input)
		}))
		public.With(handler.Authentication.RequirePublicWrite("storefront.track", 120, time.Minute)).Post("/track", writeEndpoint(200, func(ctx context.Context, _, _ string, request *http.Request, input TrackingInput) (any, error) {
			return service.Track(ctx, chi.URLParam(request, "slug"), input)
		}))
	})
}
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	router.Get("/storefront", endpoint(200, func(ctx context.Context, user, org string, _ *http.Request) (any, error) {
		return service.Settings(ctx, user, org)
	}))
	router.Put("/storefront", writeEndpoint(200, func(ctx context.Context, user, org string, _ *http.Request, input SettingsInput) (any, error) {
		return service.SaveSettings(ctx, user, org, input)
	}))
	router.Get("/storefront/products", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		number, err := page(request)
		if err != nil {
			return nil, err
		}
		return service.Products(ctx, user, org, "", request.URL.Query().Get("search"), number)
	}))
	router.Put("/storefront/products/{variantId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input PublishInput) (any, error) {
		return service.Publish(ctx, user, org, chi.URLParam(request, "variantId"), input)
	}))
	router.Get("/online-orders", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		number, err := page(request)
		if err != nil {
			return nil, err
		}
		return service.Orders(ctx, user, org, request.URL.Query().Get("branch_id"), request.URL.Query().Get("status"), number)
	}))
	router.Get("/online-orders/{orderId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Order(ctx, user, org, chi.URLParam(request, "orderId"))
	}))
	router.Post("/online-orders/{orderId}/status", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input TransitionInput) (any, error) {
		return service.Transition(ctx, user, org, chi.URLParam(request, "orderId"), input)
	}))
}
