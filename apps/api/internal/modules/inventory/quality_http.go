package inventory

import (
	"context"
	"github.com/go-chi/chi/v5"
	"net/http"
	"strconv"
)

func (handler Handler) QualityRoutes(router chi.Router) {
	for _, resource := range []string{"lots", "batches", "expiry", "write-offs", "recalls"} {
		router.Get("/quality/"+resource, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			page := 1
			if value := request.URL.Query().Get("page"); value != "" {
				var err error
				page, err = strconv.Atoi(value)
				if err != nil {
					return nil, ErrInput
				}
			}
			query := request.URL.Query()
			return handler.Service.ReadQuality(ctx, user, org, resource, query.Get("branch_id"), query.Get("variant_id"), query.Get("location_id"), page)
		}))
	}
	router.Post("/quality/batches", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input BatchInput) (any, error) {
		return handler.Service.SaveBatch(ctx, user, org, "", request.Header.Get("Idempotency-Key"), input)
	}))
	router.Put("/quality/batches/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input BatchInput) (any, error) {
		return handler.Service.SaveBatch(ctx, user, org, chi.URLParam(request, "resourceId"), request.Header.Get("Idempotency-Key"), input)
	}))
	router.Post("/quality/recalls", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input RecallInput) (any, error) {
		return handler.Service.CreateRecall(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
	}))
	router.Post("/quality/write-offs", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input WriteOffInput) (any, error) {
		return handler.Service.RequestWriteOff(ctx, user, org, request.Header.Get("Idempotency-Key"), input)
	}))
	for _, action := range []string{"approve", "reject", "post"} {
		router.Post("/quality/write-offs/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input struct {
			Revision int64 `json:"revision"`
		}) (any, error) {
			return handler.Service.ChangeWriteOff(ctx, user, org, chi.URLParam(request, "resourceId"), action, request.Header.Get("Idempotency-Key"), input.Revision)
		}))
	}
}
