package storefront

import (
	"context"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
)

type customerPaymentService interface {
	CreateCustomerCheckout(context.Context, string, TrackingInput) (CustomerCheckout, error)
	RecoverCustomerCheckout(context.Context, string, TrackingInput) (CustomerCheckout, error)
	CustomerPayment(context.Context, string, TrackingInput) (PaymentAttempt, error)
	AcceptCustomerWebhook(context.Context, []byte, string, time.Time) (PaymentAcceptance, error)
}

type publicPaymentAttempt struct {
	State       string `json:"state"`
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}

type publicCustomerCheckout struct {
	Attempt publicPaymentAttempt `json:"attempt"`
	URL     string               `json:"url,omitempty"`
}

func publicPayment(attempt PaymentAttempt) publicPaymentAttempt {
	return publicPaymentAttempt{State: attempt.State, AmountMinor: attempt.AmountMinor, Currency: attempt.Currency}
}

func customerCheckoutEndpoint(service customerPaymentService, recover bool) http.HandlerFunc {
	return writeEndpoint(http.StatusOK, func(ctx context.Context, _, _ string, request *http.Request, input TrackingInput) (any, error) {
		var result CustomerCheckout
		var err error
		if recover {
			result, err = service.RecoverCustomerCheckout(ctx, chi.URLParam(request, "slug"), input)
		} else {
			result, err = service.CreateCustomerCheckout(ctx, chi.URLParam(request, "slug"), input)
		}
		return publicCustomerCheckout{Attempt: publicPayment(result.Attempt), URL: result.URL}, err
	})
}

func customerPaymentStatusEndpoint(service customerPaymentService) http.HandlerFunc {
	return writeEndpoint(http.StatusOK, func(ctx context.Context, _, _ string, request *http.Request, input TrackingInput) (any, error) {
		attempt, err := service.CustomerPayment(ctx, chi.URLParam(request, "slug"), input)
		return publicPayment(attempt), err
	})
}

func customerPaymentWebhookEndpoint(service customerPaymentService) http.HandlerFunc {
	return endpoint(http.StatusOK, func(ctx context.Context, _, _ string, request *http.Request) (any, error) {
		body, err := io.ReadAll(http.MaxBytesReader(nil, request.Body, 64<<10))
		if err != nil {
			return nil, ErrInput
		}
		if _, err = service.AcceptCustomerWebhook(ctx, body, request.Header.Get("Stripe-Signature"), time.Now()); err != nil {
			return nil, err
		}
		return map[string]bool{"received": true}, nil
	})
}

func (handler Handler) customerPaymentRoutes(router chi.Router) {
	service := handler.Service
	noStore := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			writer.Header().Set("Cache-Control", "no-store")
			next.ServeHTTP(writer, request)
		})
	}
	router.Post("/storefront-payments/stripe/webhook", customerPaymentWebhookEndpoint(service))
	router.With(noStore, handler.Authentication.RequirePublicWrite("storefront.payment.checkout", 20, time.Hour)).Post("/storefronts/{slug}/payment/checkout", customerCheckoutEndpoint(service, false))
	router.With(noStore, handler.Authentication.RequirePublicWrite("storefront.payment.recover", 120, time.Minute)).Post("/storefronts/{slug}/payment/recover", customerCheckoutEndpoint(service, true))
	router.With(noStore, handler.Authentication.RequirePublicWrite("storefront.payment.status", 120, time.Minute)).Post("/storefronts/{slug}/payment/status", customerPaymentStatusEndpoint(service))
}
