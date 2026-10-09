package catalog

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"io"
	"net/http"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/httpx"
	"strconv"
	"strings"
	"time"
)

type Handler struct {
	Service        *Service
	Authentication identity.Handler
}

func respond(writer http.ResponseWriter, request *http.Request, result any, err error, status int) {
	if err == nil {
		httpx.JSON(writer, status, map[string]any{"data": result})
		return
	}
	code, message, status := "DEPENDENCY_UNAVAILABLE", "Catalog service unavailable", 503
	switch {
	case errors.Is(err, ErrInput):
		code, message, status = "INVALID_INPUT", "Check catalog values, references, prices and barcode checksum", 400
	case errors.Is(err, organization.ErrDenied):
		code, message, status = "FORBIDDEN", "Operation is not permitted", 403
	case errors.Is(err, ErrNotFound), errors.Is(err, organization.ErrNotFound):
		code, message, status = "NOT_FOUND", "Catalog resource not found", 404
	case errors.Is(err, ErrConflict):
		code, message, status = "CONFLICT", "Duplicate SKU/barcode, referenced data or stale revision; refresh and review", 409
	}
	httpx.Error(writer, request, status, code, message)
}
func decode(writer http.ResponseWriter, request *http.Request, value any) bool {
	if !strings.HasPrefix(request.Header.Get("Content-Type"), "application/json") {
		httpx.Error(writer, request, 415, "UNSUPPORTED_MEDIA_TYPE", "JSON is required")
		return false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, 256<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil || decoder.Decode(new(any)) != io.EOF {
		respond(writer, request, nil, ErrInput, 400)
		return false
	}
	return true
}

type operation func(context.Context, string, string, *http.Request) (any, error)

func endpoint(status int, run operation) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		result, err := run(request.Context(), identity.SessionFromContext(request.Context()).User.ID, chi.URLParam(request, "id"), request)
		respond(writer, request, result, err, status)
	}
}
func bodyEndpoint[Input any, Output any](status int, run func(context.Context, string, string, *http.Request, Input) (Output, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		var input Input
		if !decode(writer, request, &input) {
			return
		}
		result, err := run(request.Context(), identity.SessionFromContext(request.Context()).User.ID, chi.URLParam(request, "id"), request, input)
		respond(writer, request, result, err, status)
	}
}
func filterFrom(request *http.Request) Filter {
	values := request.URL.Query()
	page, size := 0, 0
	if values.Has("page") {
		page, _ = strconv.Atoi(values.Get("page"))
		if page == 0 {
			page = -1
		}
	}
	if values.Has("page_size") {
		size, _ = strconv.Atoi(values.Get("page_size"))
		if size == 0 {
			size = -1
		}
	}
	return Filter{Search: values.Get("search"), Status: values.Get("status"), CategoryID: values.Get("category_id"), BrandID: values.Get("brand_id"), Sort: values.Get("sort"), Page: page, PageSize: size}
}
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	router.Group(func(private chi.Router) {
		private.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				ctx, cancel := context.WithTimeout(organization.WithRequestID(request.Context(), httpx.RequestID(request.Context())), 30*time.Second)
				defer cancel()
				next.ServeHTTP(writer, request.WithContext(ctx))
			})
		})
		tenant := private
		handler.importRoutes(tenant)
		tenant.Get("/products/{productId}/labels", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			tx, err := service.begin(ctx, user, org, "catalog.labels.print")
			if err != nil {
				return nil, err
			}
			defer tx.Rollback(ctx)
			return productBy(ctx, tx, org, chi.URLParam(request, "productId"))
		}))
		for _, kind := range []string{"categories", "brands", "units"} {
			tenant.Get("/"+kind, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
				return service.Taxonomies(ctx, user, org, kind, filterFrom(request))
			}))
			tenant.Post("/"+kind, bodyEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input TaxonomyInput) (Taxonomy, error) {
				return service.SaveTaxonomy(ctx, user, org, kind, "", input)
			}))
			tenant.Patch("/"+kind+"/{resourceId}", bodyEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input TaxonomyInput) (Taxonomy, error) {
				return service.SaveTaxonomy(ctx, user, org, kind, chi.URLParam(request, "resourceId"), input)
			}))
		}
		tenant.Get("/products", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Products(ctx, user, org, filterFrom(request))
		}))
		tenant.Post("/products", bodyEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input CreateInput) (Product, error) {
			return service.CreateProduct(ctx, user, org, input)
		}))
		tenant.Get("/products/{productId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Product(ctx, user, org, chi.URLParam(request, "productId"))
		}))
		tenant.Patch("/products/{productId}", bodyEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ProductInput) (Product, error) {
			return service.UpdateProduct(ctx, user, org, chi.URLParam(request, "productId"), input)
		}))
		tenant.Get("/products/{productId}/variants", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			item, err := service.Product(ctx, user, org, chi.URLParam(request, "productId"))
			return item.Variants, err
		}))
		tenant.Post("/products/{productId}/variants", bodyEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input VariantInput) (Variant, error) {
			return service.SaveVariant(ctx, user, org, chi.URLParam(request, "productId"), "", input)
		}))
		tenant.Patch("/products/{productId}/variants/{variantId}", bodyEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input VariantInput) (Variant, error) {
			return service.SaveVariant(ctx, user, org, chi.URLParam(request, "productId"), chi.URLParam(request, "variantId"), input)
		}))
		tenant.Post("/products/{productId}/variants/{variantId}/barcodes", bodyEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input BarcodeInput) (Barcode, error) {
			return service.RegisterBarcode(ctx, user, org, chi.URLParam(request, "productId"), chi.URLParam(request, "variantId"), input, false)
		}))
		tenant.Post("/products/{productId}/variants/{variantId}/barcodes/generate", bodyEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input struct {
			IsPrimary bool `json:"is_primary"`
		}) (Barcode, error) {
			return service.RegisterBarcode(ctx, user, org, chi.URLParam(request, "productId"), chi.URLParam(request, "variantId"), BarcodeInput{IsPrimary: input.IsPrimary}, true)
		}))
		tenant.Delete("/products/{productId}/variants/{variantId}/barcodes/{barcodeId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.DeleteBarcode(ctx, user, org, chi.URLParam(request, "productId"), chi.URLParam(request, "variantId"), chi.URLParam(request, "barcodeId"))
		}))
		tenant.Get("/barcodes/lookup", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			return service.Lookup(ctx, user, org, request.URL.Query().Get("code"))
		}))
	})
}
