package storefront

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/httpx"
	"smartpos/api/internal/platform/stripe"
)

type sandboxAccess interface {
	Authorized(context.Context, string, string, string) (pgx.Tx, organization.Member, error)
}
type sandboxGateway interface {
	Configured() bool
	CreateCheckout(context.Context, stripe.Scope, string) (stripe.Checkout, error)
	RetrieveCheckout(context.Context, stripe.Scope, string) (stripe.Checkout, error)
	RefundCheckout(context.Context, stripe.Scope, string) (stripe.Refund, error)
}
type SandboxHandler struct {
	Organization sandboxAccess
	Gateway      sandboxGateway
}

func sandboxRespond(writer http.ResponseWriter, request *http.Request, result any, err error, status int) {
	writer.Header().Set("Cache-Control", "no-store")
	if err == nil {
		httpx.JSON(writer, status, map[string]any{"data": result})
		return
	}
	code, message, status := "GATEWAY_UNAVAILABLE", "Stripe sandbox ยังไม่พร้อม ตรวจการตั้งค่า test key และลองใหม่ด้วยรายการเดิม", 503
	switch {
	case errors.Is(err, stripe.ErrInput):
		code, message, status = "INVALID_INPUT", "ข้อมูลทดสอบหรือ Idempotency-Key ไม่ถูกต้อง", 400
	case errors.Is(err, organization.ErrDenied):
		code, message, status = "FORBIDDEN", "ไม่มีสิทธิ์ทดสอบการชำระเงินของร้านนี้", 403
	case errors.Is(err, stripe.ErrNotFound), errors.Is(err, organization.ErrNotFound):
		code, message, status = "NOT_FOUND", "ไม่พบรายการทดสอบที่เข้าถึงได้", 404
	case errors.Is(err, stripe.ErrConflict):
		code, message, status = "CONFLICT", "สถานะรายการทดสอบไม่อนุญาตให้ดำเนินการ กรุณาตรวจสถานะล่าสุด", 409
	}
	httpx.Error(writer, request, status, code, message)
}
func (handler SandboxHandler) endpoint(action string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 25*time.Second)
		defer cancel()
		scope := stripe.Scope{OrganizationID: chi.URLParam(request, "id"), UserID: identity.SessionFromContext(ctx).User.ID}
		tx, _, err := handler.Organization.Authorized(ctx, scope.UserID, scope.OrganizationID, "storefront.manage")
		if err != nil {
			sandboxRespond(writer, request, nil, err, 200)
			return
		}
		if err = tx.Rollback(ctx); err != nil {
			sandboxRespond(writer, request, nil, err, 200)
			return
		}
		configured := handler.Gateway != nil && handler.Gateway.Configured()
		if action == "status" {
			sandboxRespond(writer, request, map[string]any{"provider": "stripe", "mode": "test", "configured": configured, "amount_minor": 2000, "currency": "thb", "customer_checkout_enabled": false}, nil, 200)
			return
		}
		if !configured {
			sandboxRespond(writer, request, nil, stripe.ErrUnavailable, 200)
			return
		}
		if request.Method == http.MethodPost {
			media, _, parseErr := mime.ParseMediaType(request.Header.Get("Content-Type"))
			if parseErr != nil || media != "application/json" {
				httpx.Error(writer, request, 415, "UNSUPPORTED_MEDIA_TYPE", "JSON is required")
				return
			}
			decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, 1024))
			decoder.DisallowUnknownFields()
			var body *struct{}
			if decoder.Decode(&body) != nil || body == nil || decoder.Decode(new(any)) != io.EOF {
				sandboxRespond(writer, request, nil, stripe.ErrInput, 200)
				return
			}
		}
		var result any
		status := 200
		switch action {
		case "create":
			result, err = handler.Gateway.CreateCheckout(ctx, scope, request.Header.Get("Idempotency-Key"))
			status = 201
		case "retrieve":
			result, err = handler.Gateway.RetrieveCheckout(ctx, scope, chi.URLParam(request, "sessionId"))
		case "refund":
			result, err = handler.Gateway.RefundCheckout(ctx, scope, chi.URLParam(request, "sessionId"))
		}
		sandboxRespond(writer, request, result, err, status)
	}
}
func (handler SandboxHandler) Routes(router chi.Router) {
	router.Get("/storefront/payment-sandbox", handler.endpoint("status"))
	router.Post("/storefront/payment-sandbox/checkouts", handler.endpoint("create"))
	router.Get("/storefront/payment-sandbox/checkouts/{sessionId}", handler.endpoint("retrieve"))
	router.Post("/storefront/payment-sandbox/checkouts/{sessionId}/refund", handler.endpoint("refund"))
}
