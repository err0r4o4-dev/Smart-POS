package storefront

import (
	"context"
	"encoding/json"
	"net/http"
)

type nearbyInput struct {
	Latitude  *float64 `json:"latitude"`
	Longitude *float64 `json:"longitude"`
}

func nearbyEndpoint(service *Service) http.HandlerFunc {
	handler := writeEndpoint(http.StatusOK, func(ctx context.Context, _, _ string, _ *http.Request, input nearbyInput) (any, error) {
		return service.nearby(ctx, input)
	})
	return func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Cache-Control", "no-store")
		handler(writer, request)
	}
}

func (service *Service) nearby(ctx context.Context, input nearbyInput) (json.RawMessage, error) {
	if input.Latitude == nil || input.Longitude == nil {
		return nil, ErrInput
	}
	location := nativeDeliveryPoint{latitude: *input.Latitude, longitude: *input.Longitude}
	if !location.valid() {
		return nil, ErrInput
	}

	var result json.RawMessage
	err := service.Organization.Pool.QueryRow(ctx, "SELECT storefront_nearby($1,$2,NULLIF($3,'')::uuid)",
		location.latitude, location.longitude, service.Organization.SingleStoreOrganizationID,
	).Scan(&result)
	return result, dbError(err)
}
