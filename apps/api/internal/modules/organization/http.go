package organization

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-chi/chi/v5"
	"io"
	"net/http"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/platform/httpx"
	"strings"
)

type Handler struct {
	Service        *Service
	Authentication identity.Handler
}

func respond(writer http.ResponseWriter, request *http.Request, status int, result any, err error) {
	if err == nil {
		httpx.JSON(writer, status, map[string]any{"data": result})
		return
	}
	code, message, status := "DEPENDENCY_UNAVAILABLE", "Organization service unavailable", 503
	switch {
	case errors.Is(err, ErrInput):
		code, message, status = "INVALID_INPUT", "Check the submitted details", 400
	case errors.Is(err, ErrDenied):
		code, message, status = "FORBIDDEN", "Operation is not permitted", 403
	case errors.Is(err, ErrNotFound):
		code, message, status = "NOT_FOUND", "Resource not found", 404
	case errors.Is(err, ErrConflict):
		code, message, status = "CONFLICT", "Operation conflicts with membership, ownership or existing data", 409
	}
	httpx.Error(writer, request, status, code, message)
}
func decode(writer http.ResponseWriter, request *http.Request, value any) bool {
	if !strings.HasPrefix(request.Header.Get("Content-Type"), "application/json") {
		httpx.Error(writer, request, 415, "UNSUPPORTED_MEDIA_TYPE", "JSON is required")
		return false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, 16<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil || decoder.Decode(new(any)) != io.EOF {
		respond(writer, request, 400, nil, ErrInput)
		return false
	}
	return true
}

type operation func(context.Context, identity.Profile, string, *http.Request) (any, error)

func endpoint(status int, run operation) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		result, err := run(request.Context(), identity.SessionFromContext(request.Context()).User, chi.URLParam(request, "id"), request)
		respond(writer, request, status, result, err)
	}
}
func bodyEndpoint[Input any, Output any](status int, run func(context.Context, identity.Profile, string, *http.Request, Input) (Output, error)) http.HandlerFunc {
	return func(writer http.ResponseWriter, request *http.Request) {
		var input Input
		if !decode(writer, request, &input) {
			return
		}
		result, err := run(request.Context(), identity.SessionFromContext(request.Context()).User, chi.URLParam(request, "id"), request, input)
		respond(writer, request, status, result, err)
	}
}
func (handler Handler) Routes(router chi.Router, tenantExtensions ...func(chi.Router)) {
	service := handler.Service
	router.Group(func(private chi.Router) {
		private.Use(handler.Authentication.RequireAuth, handler.Authentication.RequireWrite)
		private.Use(func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
				writer.Header().Set("X-SmartPOS-Store-Mode", service.StoreMode())
				next.ServeHTTP(writer, request.WithContext(WithRequestID(request.Context(), httpx.RequestID(request.Context()))))
			})
		})
		private.Post("/organizations", bodyEndpoint(201, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input CreateInput) (Context, error) {
			return service.Create(ctx, user.ID, request.Header.Get("Idempotency-Key"), input)
		}))
		private.Get("/organizations", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
			return service.List(ctx, user.ID)
		}))
		private.Post("/invitations/accept", bodyEndpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input struct {
			Token string `json:"token"`
		}) (Context, error) {
			return service.Accept(ctx, user, input.Token)
		}))
		private.Route("/organizations/{id}", func(tenant chi.Router) {
			for _, register := range tenantExtensions {
				register(tenant)
			}
			current := endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				return service.Context(ctx, user.ID, org)
			})
			tenant.Get("/", current)
			tenant.Get("/context", current)
			tenant.Get("/permissions", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				result, err := service.Context(ctx, user.ID, org)
				return result.Permissions, err
			}))
			tenant.Patch("/", bodyEndpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input OrganizationInput) (Organization, error) {
				return service.Update(ctx, user.ID, org, input)
			}))
			tenant.Get("/roles", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				state, err := service.Context(ctx, user.ID, org)
				if err != nil {
					return nil, err
				}
				if !contains(state.Permissions, "role.read") {
					return nil, ErrDenied
				}
				matrix := map[string][]string{}
				for _, role := range Roles {
					matrix[role] = Permissions(role)
				}
				return matrix, nil
			}))
			tenant.Get("/branches", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				return service.Branches(ctx, user.ID, org)
			}))
			tenant.Get("/branches/{branchId}", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				list, err := service.Branches(ctx, user.ID, org)
				if err != nil {
					return nil, err
				}
				for _, branch := range list {
					if branch.ID == chi.URLParam(request, "branchId") {
						return branch, nil
					}
				}
				return nil, ErrNotFound
			}))
			tenant.Post("/branches", bodyEndpoint(201, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input BranchInput) (Branch, error) {
				return service.SaveBranch(ctx, user.ID, org, "", input)
			}))
			tenant.Patch("/branches/{branchId}", bodyEndpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input BranchInput) (Branch, error) {
				return service.SaveBranch(ctx, user.ID, org, chi.URLParam(request, "branchId"), input)
			}))
			tenant.Get("/members", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				return service.Members(ctx, user.ID, org, "")
			}))
			tenant.Get("/members/{memberId}", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				members, err := service.Members(ctx, user.ID, org, chi.URLParam(request, "memberId"))
				if err != nil {
					return nil, err
				}
				return members[0], nil
			}))
			tenant.Patch("/members/{memberId}", bodyEndpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input MemberInput) (Member, error) {
				return service.UpdateMember(ctx, user.ID, org, chi.URLParam(request, "memberId"), input, false)
			}))
			tenant.Delete("/members/{memberId}", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				return service.UpdateMember(ctx, user.ID, org, chi.URLParam(request, "memberId"), MemberInput{}, true)
			}))
			tenant.Get("/invitations", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				return service.Invitations(ctx, user.ID, org)
			}))
			tenant.Post("/invitations", bodyEndpoint(201, func(ctx context.Context, user identity.Profile, org string, request *http.Request, input InviteInput) (Invitation, error) {
				return service.Invite(ctx, user.ID, org, input)
			}))
			tenant.Delete("/invitations/{invitationId}", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				err := service.RevokeInvitation(ctx, user.ID, org, chi.URLParam(request, "invitationId"))
				return map[string]bool{"revoked": err == nil}, err
			}))
			tenant.Get("/audit", endpoint(200, func(ctx context.Context, user identity.Profile, org string, request *http.Request) (any, error) {
				return service.Audit(ctx, user.ID, org, request.URL.Query().Get("member_id"))
			}))
		})
	})
}
