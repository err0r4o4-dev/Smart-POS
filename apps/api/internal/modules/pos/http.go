package pos

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

func respond(writer http.ResponseWriter, request *http.Request, result any, err error, status int) {
	if err == nil {
		httpx.JSON(writer, status, map[string]any{"data": result})
		return
	}
	code, message, status := "DEPENDENCY_UNAVAILABLE", "POS service unavailable", 503
	switch {
	case errors.Is(err, ErrInput):
		code, message, status = "INVALID_INPUT", "Check submitted POS details", 400
	case errors.Is(err, ErrNotFound):
		code, message, status = "NOT_FOUND", "POS resource not found", 404
	case errors.Is(err, organization.ErrDenied):
		code, message, status = "FORBIDDEN", "POS operation is not permitted", 403
	case errors.Is(err, ErrStock):
		code, message, status = "INSUFFICIENT_STOCK", "Configured sale location has insufficient recorded stock", 409
	case errors.Is(err, ErrPrice):
		code, message, status = "PRICE_CHANGED", "Prices changed; review and refresh the cart before payment", 409
	case errors.Is(err, ErrPending):
		code, message, status = "PAYMENT_PENDING", "Pending or confirmed payment must be reconciled before proceeding", 409
	case errors.Is(err, ErrConflict):
		code, message, status = "CONFLICT", "POS operation conflicts with the current cart, shift or terminal state", 409
	}
	httpx.Error(writer, request, status, code, message)
}

type operation func(context.Context, string, string, *http.Request) (any, error)

func endpoint(status int, run operation) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		ctx, cancel := context.WithTimeout(request.Context(), 15*time.Second)
		defer cancel()
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
func resourceID(request *http.Request) string { return chi.URLParam(request, "resourceId") }
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	router.Route("/pos", func(tenant chi.Router) {
		for _, resource := range []string{"terminals", "shifts", "carts", "products", "checkouts"} {
			tenant.Get("/"+resource, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
				filters, err := filter(request.URL.Query())
				if err != nil {
					return nil, err
				}
				return service.List(ctx, user, org, resource, filters)
			}))
		}
		tenant.Get("/barcodes/{code}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			values := request.URL.Query()
			values.Set("barcode", chi.URLParam(request, "code"))
			filters, err := filter(values)
			if err != nil {
				return nil, err
			}
			result, err := service.List(ctx, user, org, "products", filters)
			if err == nil && result.Total == 0 {
				return nil, ErrNotFound
			}
			return result, err
		}))
		tenant.Get("/payment-methods", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			tx, actor, err := service.begin(ctx, user, org, "pos.access")
			if err != nil {
				return nil, err
			}
			defer tx.Rollback(ctx)
			methods := []string{}
			if allowed(actor.Permissions, "pos.payment.cash") {
				methods = append(methods, "CASH")
			}
			if allowed(actor.Permissions, "pos.payment.manual_confirm") {
				methods = append(methods, "QR_MANUAL", "BANK_TRANSFER_MANUAL")
			}
			return methods, nil
		}))
		tenant.Post("/terminals", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input TerminalInput) (any, error) {
			return service.SaveTerminal(ctx, user, org, "", input)
		}))
		tenant.Patch("/terminals/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input TerminalInput) (any, error) {
			return service.SaveTerminal(ctx, user, org, resourceID(request), input)
		}))
		tenant.Get("/shifts/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Shift(ctx, user, org, resourceID(request))
		}))
		tenant.Post("/shifts/open", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input ShiftInput) (any, error) {
			return service.OpenShift(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
		}))
		tenant.Post("/shifts/{resourceId}/close", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ShiftInput) (any, error) {
			return service.CloseShift(ctx, user, org, resourceID(request), request.Header.Get("Idempotency-Key"), input)
		}))
		tenant.Post("/carts", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input CartInput) (any, error) {
			return service.CreateCart(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
		}))
		tenant.Get("/carts/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Cart(ctx, user, org, resourceID(request))
		}))
		tenant.Patch("/carts/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input CartInput) (any, error) {
			return service.UpdateCart(ctx, user, org, resourceID(request), "update", input)
		}))
		for _, action := range []string{"hold", "resume", "cancel"} {
			tenant.Post("/carts/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input CartInput) (any, error) {
				return service.UpdateCart(ctx, user, org, resourceID(request), action, input)
			}))
		}
		tenant.Post("/checkout", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input CheckoutInput) (any, error) {
			return service.PrepareCheckout(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
		}))
		tenant.Get("/checkouts/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Checkout(ctx, user, org, resourceID(request))
		}))
		tenant.Post("/payments/{resourceId}/confirm", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ConfirmationInput) (any, error) {
			return service.ConfirmPayment(ctx, user, org, resourceID(request), request.Header.Get("Idempotency-Key"), input)
		}))
		tenant.Post("/checkouts/{resourceId}/complete", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input struct{}) (any, error) {
			return service.CompleteCheckout(ctx, user, org, resourceID(request))
		}))
		for _, action := range []string{"cancel", "resolve"} {
			tenant.Post("/checkouts/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ConfirmationInput) (any, error) {
				return service.EndCheckout(ctx, user, org, resourceID(request), action, input)
			}))
		}
	})
	for _, resource := range []string{"sales", "receipts"} {
		router.Get("/"+resource, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			filters, err := filter(request.URL.Query())
			if err != nil {
				return nil, err
			}
			return service.List(ctx, user, org, resource, filters)
		}))
		router.Get("/"+resource+"/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Sale(ctx, user, org, resourceID(request), resource == "receipts")
		}))
	}
}
