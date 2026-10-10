package returns

import (
	"context"
	"github.com/go-chi/chi/v5"
	"net/http"
)

func (handler Handler) adjustmentRoutes(router chi.Router) {
	for _, entry := range []struct{ Path, Kind string }{{"/exchanges", "EXCHANGE"}, {"/sales/voids", "REVERSAL"}} {
		path, kind := entry.Path, entry.Kind
		router.Get(path, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			input, err := filter(request.URL.Query())
			if err != nil {
				return nil, err
			}
			return handler.Service.ListAdjustments(ctx, user, org, kind, input)
		}))
		router.Get(path+"/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return handler.Service.GetAdjustment(ctx, user, org, kind, chi.URLParam(request, "resourceId"))
		}))
		router.Post(path+"/quote", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input AdjustmentInput) (any, error) {
			return handler.Service.QuoteAdjustment(ctx, user, org, kind, input)
		}))
		router.Post(path, writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input AdjustmentInput) (any, error) {
			return handler.Service.SaveAdjustment(ctx, user, org, kind, "", request.Header.Get("Idempotency-Key"), input)
		}))
		router.Patch(path+"/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input AdjustmentInput) (any, error) {
			return handler.Service.SaveAdjustment(ctx, user, org, kind, chi.URLParam(request, "resourceId"), request.Header.Get("Idempotency-Key"), input)
		}))
		for _, action := range []string{"submit", "approve", "reject", "cancel", "confirm-settlement", "complete"} {
			router.Post(path+"/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input SettlementInput) (any, error) {
				return handler.Service.TransitionAdjustment(ctx, user, org, kind, chi.URLParam(request, "resourceId"), action, request.Header.Get("Idempotency-Key"), input)
			}))
		}
	}
}
