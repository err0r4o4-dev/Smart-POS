package purchasing

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

func endpoint(status int, run func(context.Context, string, string, *http.Request) (any, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		session := identity.SessionFromContext(request.Context())
		if session.User.ID == "" {
			httpx.Error(writer, request, 401, "UNAUTHENTICATED", "Sign in required")
			return
		}
		ctx, cancel := context.WithTimeout(organization.WithRequestID(request.Context(), httpx.RequestID(request.Context())), 15*time.Second)
		defer cancel()
		result, err := run(ctx, session.User.ID, chi.URLParam(request, "id"), request)
		if err == nil {
			httpx.JSON(writer, status, map[string]any{"data": result})
			return
		}
		code, message, status := "DEPENDENCY_UNAVAILABLE", "Purchasing service unavailable", 503
		switch {
		case errors.Is(err, ErrInput):
			code, message, status = "INVALID_INPUT", "Check quantities, units and submitted fields", 400
		case errors.Is(err, ErrNotFound) || errors.Is(err, organization.ErrNotFound):
			code, message, status = "NOT_FOUND", "Resource not found", 404
		case errors.Is(err, organization.ErrDenied):
			code, message, status = "FORBIDDEN", "Operation is not permitted", 403
		case errors.Is(err, ErrStock):
			code, message, status = "INSUFFICIENT_STOCK", "Current recorded stock is insufficient", 409
		case errors.Is(err, ErrConflict) || errors.Is(err, organization.ErrConflict):
			code, message, status = "CONFLICT", "Document changed, state or stock limit conflict; reload and review", 409
		}
		httpx.Error(writer, request, status, code, message)
	}
}
func writeEndpoint[Input any](status int, run func(context.Context, string, string, *http.Request, Input) (any, error)) http.HandlerFunc {
	return endpoint(status, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		media, _, err := mime.ParseMediaType(request.Header.Get("Content-Type"))
		if err != nil || media != "application/json" {
			return nil, ErrInput
		}
		request.Body = http.MaxBytesReader(nil, request.Body, 128<<10)
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
func key(request *http.Request) string        { return request.Header.Get("Idempotency-Key") }
func (handler Handler) TenantRoutes(router chi.Router) {
	service := handler.Service
	for _, entry := range []struct{ Path, Resource string }{{"/suppliers", "suppliers"}, {"/purchasing/orders", "orders"}, {"/purchasing/receipts", "receipts"}, {"/purchasing/returns", "returns"}, {"/purchasing/discrepancies", "discrepancies"}, {"/purchasing/suggestions", "suggestions"}, {"/shelves", "shelves"}, {"/shelves/replenishments", "tasks"}, {"/shelves/replenishments/suggestions", "replenishment-suggestions"}} {
		router.Get(entry.Path, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			input, err := filter(request.URL.Query())
			if err != nil {
				return nil, err
			}
			return service.List(ctx, user, org, entry.Resource, input)
		}))
		if entry.Resource != "suggestions" && entry.Resource != "replenishment-suggestions" {
			router.Get(entry.Path+"/{resourceId}", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
				return service.Get(ctx, user, org, entry.Resource, resourceID(request))
			}))
		}
	}
	router.Post("/suppliers", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input SupplierInput) (any, error) {
		return service.SaveSupplier(ctx, user, org, "", input)
	}))
	router.Patch("/suppliers/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input SupplierInput) (any, error) {
		return service.SaveSupplier(ctx, user, org, resourceID(request), input)
	}))
	router.Get("/suppliers/{resourceId}/products", endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
		return service.Get(ctx, user, org, "products", resourceID(request))
	}))
	router.Post("/suppliers/{resourceId}/products", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input ProductInput) (any, error) {
		return service.SaveProduct(ctx, user, org, resourceID(request), "", input)
	}))
	router.Patch("/suppliers/{resourceId}/products/{linkId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ProductInput) (any, error) {
		return service.SaveProduct(ctx, user, org, resourceID(request), chi.URLParam(request, "linkId"), input)
	}))
	for _, entry := range []struct {
		Resource, Kind string
		Actions        []string
	}{{"orders", "ORDER", []string{"submit", "approve", "reject", "issue", "cancel", "close"}}, {"receipts", "RECEIPT", []string{"submit", "approve", "reject", "correct", "cancel", "post"}}, {"returns", "RETURN", []string{"submit", "approve", "reject", "cancel", "dispatch"}}} {
		path := "/purchasing/" + entry.Resource
		router.Post(path, writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input DocumentInput) (any, error) {
			return service.SaveDocument(ctx, user, org, entry.Kind, "", key(request), input)
		}))
		router.Patch(path+"/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input DocumentInput) (any, error) {
			return service.SaveDocument(ctx, user, org, entry.Kind, resourceID(request), key(request), input)
		}))
		for _, action := range entry.Actions {
			router.Post(path+"/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ActionInput) (any, error) {
				return service.ActDocument(ctx, user, org, entry.Kind, resourceID(request), action, key(request), input)
			}))
		}
	}
	router.Post("/purchasing/suggestions/create-draft", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input DocumentInput) (any, error) {
		return service.SaveDocument(ctx, user, org, "ORDER", "", key(request), input)
	}))
	router.Post("/shelves", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input ShelfInput) (any, error) {
		return service.SaveShelf(ctx, user, org, "", input)
	}))
	router.Patch("/shelves/{resourceId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ShelfInput) (any, error) {
		return service.SaveShelf(ctx, user, org, resourceID(request), input)
	}))
	router.Post("/shelves/{resourceId}/slots", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input SlotInput) (any, error) {
		return service.SaveSlot(ctx, user, org, resourceID(request), input)
	}))
	for _, part := range []string{"slots", "assignments"} {
		router.Get("/shelves/{resourceId}/"+part, endpoint(200, func(ctx context.Context, user, org string, request *http.Request) (any, error) {
			result, err := service.Get(ctx, user, org, "shelves", resourceID(request))
			if err != nil {
				return nil, err
			}
			var fields map[string]json.RawMessage
			if err = json.Unmarshal(result, &fields); err != nil {
				return nil, err
			}
			return fields[part], nil
		}))
	}
	router.Post("/shelves/{resourceId}/assignments", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input AssignmentInput) (any, error) {
		return service.SaveAssignment(ctx, user, org, resourceID(request), "", input)
	}))
	router.Patch("/shelves/{resourceId}/assignments/{assignmentId}", writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input AssignmentInput) (any, error) {
		return service.SaveAssignment(ctx, user, org, resourceID(request), chi.URLParam(request, "assignmentId"), input)
	}))
	router.Post("/shelves/replenishments", writeEndpoint(201, func(ctx context.Context, user, org string, request *http.Request, input TaskInput) (any, error) {
		return service.CreateTask(ctx, user, org, key(request), input)
	}))
	for _, action := range []string{"assign", "start", "complete", "cancel"} {
		router.Post("/shelves/replenishments/{resourceId}/"+action, writeEndpoint(200, func(ctx context.Context, user, org string, request *http.Request, input ActionInput) (any, error) {
			return service.ActTask(ctx, user, org, resourceID(request), action, key(request), input)
		}))
	}
}
