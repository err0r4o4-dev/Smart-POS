package organization

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
)

func TestOwnerOnlyPermissions(test *testing.T) {
	for _, role := range []string{"MANAGER", "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF", "UNKNOWN"} {
		if got := Permissions(role); len(got) != 0 {
			test.Errorf("%s received %d permissions", role, len(got))
		}
	}
	for _, permission := range PermissionNames {
		if !hasPermission("OWNER", permission) {
			test.Errorf("owner missing %s", permission)
		}
	}
	for _, role := range append(append([]string{}, Roles...), "UNKNOWN") {
		if hasPermission(role, "") || hasPermission(role, "unknown.permission") {
			test.Errorf("%s received an empty or unknown permission", role)
		}
	}
}

func TestOwnerPermissionsExcludeRetiredStaffGrants(test *testing.T) {
	for _, permission := range Permissions("OWNER") {
		if strings.HasPrefix(permission, "employee.") || strings.HasPrefix(permission, "role.") {
			test.Errorf("owner received retired permission %q", permission)
		}
	}
	for _, permission := range []string{"organization.read", "branch.update", "catalog.read", "inventory.read", "pos.access", "online_orders.manage", "audit.read"} {
		if !hasPermission("OWNER", permission) {
			test.Errorf("owner missing active permission %q", permission)
		}
	}
}

func TestInvitationServiceIsRetired(test *testing.T) {
	service := &Service{}
	id := "00000000-0000-4000-8000-000000000001"
	token, _, err := identity.RandomToken()
	if err != nil {
		test.Fatal(err)
	}
	for name, call := range map[string]func() error{
		"invite": func() error {
			_, err := service.Invite(context.Background(), id, id, InviteInput{Email: "person@example.com", Role: "CASHIER", BranchIDs: []string{id}})
			return err
		},
		"accept": func() error {
			_, err := service.Accept(context.Background(), identity.Profile{ID: id, Email: "person@example.com"}, token)
			return err
		},
		"list":   func() error { _, err := service.Invitations(context.Background(), id, id); return err },
		"revoke": func() error { return service.RevokeInvitation(context.Background(), id, id, id) },
	} {
		test.Run(name, func(test *testing.T) {
			defer func() {
				if recovered := recover(); recovered != nil {
					test.Errorf("retired service accessed a dependency: %v", recovered)
				}
			}()
			if err := call(); !errors.Is(err, ErrNotFound) {
				test.Errorf("got %v, want ErrNotFound", err)
			}
		})
	}
}

func TestMemberAdministrationIsRetired(test *testing.T) {
	service := &Service{}
	id := "00000000-0000-4000-8000-000000000001"
	for name, call := range map[string]func() error{
		"list": func() error { _, err := service.Members(context.Background(), id, id, ""); return err },
		"update": func() error {
			_, err := service.UpdateMember(context.Background(), id, id, id, MemberInput{Role: "CASHIER", Status: "ACTIVE"}, false)
			return err
		},
	} {
		test.Run(name, func(test *testing.T) {
			defer func() {
				if recovered := recover(); recovered != nil {
					test.Errorf("retired service accessed a dependency: %v", recovered)
				}
			}()
			if err := call(); !errors.Is(err, ErrNotFound) {
				test.Errorf("got %v, want ErrNotFound", err)
			}
		})
	}
}

func TestStaffRoutesAreNotRegistered(test *testing.T) {
	router := chi.NewRouter()
	Handler{Service: &Service{}}.Routes(router)
	removed := map[string]bool{
		"POST /invitations/accept":                              true,
		"GET /organizations/{id}/roles":                         true,
		"GET /organizations/{id}/members":                       true,
		"GET /organizations/{id}/members/{memberId}":            true,
		"PATCH /organizations/{id}/members/{memberId}":          true,
		"DELETE /organizations/{id}/members/{memberId}":         true,
		"GET /organizations/{id}/invitations":                   true,
		"POST /organizations/{id}/invitations":                  true,
		"DELETE /organizations/{id}/invitations/{invitationId}": true,
	}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if removed[method+" "+route] {
			test.Errorf("retired route registered: %s %s", method, route)
		}
		return nil
	}); err != nil {
		test.Fatal(err)
	}
	for _, endpoint := range []struct{ method, path string }{
		{"POST", "/invitations/accept"},
		{"GET", "/organizations/org/roles"},
		{"GET", "/organizations/org/members"},
		{"GET", "/organizations/org/members/member"},
		{"PATCH", "/organizations/org/members/member"},
		{"DELETE", "/organizations/org/members/member"},
		{"GET", "/organizations/org/invitations"},
		{"POST", "/organizations/org/invitations"},
		{"DELETE", "/organizations/org/invitations/invitation"},
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(endpoint.method, endpoint.path, nil))
		want := http.StatusUnauthorized
		if endpoint.path == "/invitations/accept" {
			want = http.StatusNotFound
		}
		if response.Code != want {
			test.Errorf("%s %s: got %d, want %d", endpoint.method, endpoint.path, response.Code, want)
		}
	}
}
