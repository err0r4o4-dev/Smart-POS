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
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/httpx"
	"smartpos/api/internal/platform/stripe"
)

type sandboxAccess interface {
	AuthorizeMFA(context.Context, string, string, string) (*organization.Authorization, error)
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
	case errors.Is(err, identity.ErrInvalidToken):
		code, message, status = "UNAUTHENTICATED", "Authentication required", 401
	case errors.Is(err, identity.ErrMFARequired):
		code, message, status = "MFA_REQUIRED", "Verify MFA in account security before continuing", 403
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

func (handler SandboxHandler) authorize(ctx context.Context, scope stripe.Scope) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if scope.UserID == "" {
		return identity.ErrInvalidToken
	}
	if handler.Organization == nil {
		return stripe.ErrUnavailable
	}
	authorization, err := handler.Organization.AuthorizeMFA(ctx, scope.UserID, scope.OrganizationID, "storefront.manage")
	if err != nil {
		return err
	}
	if authorization == nil || authorization.Tx == nil {
		return identity.ErrInvalidToken
	}
	err = ctx.Err()
	if err == nil {
		err = authorization.Recheck(ctx)
	}
	rollbackErr := authorization.Tx.Rollback(ctx)
	if err != nil {
		return err
	}
	if rollbackErr != nil {
		return rollbackErr
	}
	return ctx.Err()
}

func (handler SandboxHandler) endpoint(action string) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		ctx, cancel := context.WithTimeout(request.Context(), 25*time.Second)
		defer cancel()
		scope := stripe.Scope{OrganizationID: chi.URLParam(request, "id"), UserID: identity.SessionFromContext(ctx).User.ID}
		if err := handler.authorize(ctx, scope); err != nil {
			sandboxRespond(writer, request, nil, err, 200)
			return
		}
		configured := handler.Gateway != nil && handler.Gateway.Configured()
		if action == "status" || !configured {
			if err := handler.authorize(ctx, scope); err != nil {
				sandboxRespond(writer, request, nil, err, 200)
			} else if action == "status" {
				sandboxRespond(writer, request, map[string]any{"provider": "stripe", "mode": "test", "configured": configured, "amount_minor": 2000, "currency": "thb", "customer_checkout_enabled": false}, nil, 200)
			} else {
				sandboxRespond(writer, request, nil, stripe.ErrUnavailable, 200)
			}
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
		if err := handler.authorize(ctx, scope); err != nil {
			sandboxRespond(writer, request, nil, err, 200)
			return
		}
		if err := ctx.Err(); err != nil {
			sandboxRespond(writer, request, nil, err, 200)
			return
		}
		var result any
		var err error
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
		// A provider effect may already exist even when postflight access is denied.
		if failure := handler.authorize(ctx, scope); failure != nil {
			sandboxRespond(writer, request, nil, failure, status)
			return
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
