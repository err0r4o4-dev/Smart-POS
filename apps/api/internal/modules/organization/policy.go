package organization

import (
	"errors"
	"regexp"
	"smartpos/api/internal/modules/identity"
	"strings"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid input")
var ErrDenied = errors.New("access denied")
var ErrNotFound = errors.New("resource not found")
var ErrConflict = errors.New("operation conflicts with current state")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var codePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,49}$`)
var Roles = []string{"OWNER", "MANAGER", "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF"}
var PermissionNames = []string{"organization.read", "organization.update", "branch.read", "branch.create", "branch.update", "branch.deactivate", "employee.read", "employee.invite", "employee.update", "employee.remove", "role.read", "role.assign", "audit.read"}

func Permissions(role string) []string {
	switch role {
	case "OWNER":
		return append([]string{}, PermissionNames...)
	case "MANAGER":
		return []string{"organization.read", "branch.read", "branch.update", "employee.read", "employee.invite", "employee.update", "employee.remove", "role.read", "role.assign", "audit.read"}
	case "CASHIER", "INVENTORY_STAFF", "PURCHASING_STAFF":
		return []string{"organization.read", "branch.read"}
	default:
		return []string{}
	}
}
func hasPermission(role, permission string) bool {
	for _, allowed := range Permissions(role) {
		if allowed == permission {
			return true
		}
	}
	return false
}
func subordinate(role string) bool {
	return role == "CASHIER" || role == "INVENTORY_STAFF" || role == "PURCHASING_STAFF"
}
func validRole(role string) bool {
	for _, known := range Roles {
		if known == role {
			return true
		}
	}
	return false
}
func contains(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}
func subset(values, allowed []string) bool {
	for _, item := range values {
		if !contains(allowed, item) {
			return false
		}
	}
	return true
}
func canManage(actor, target Member, nextRole string, branches []string) bool {
	if actor.Status != "ACTIVE" {
		return false
	}
	if actor.Role == "OWNER" {
		return validRole(nextRole)
	}
	return actor.Role == "MANAGER" && actor.ID != target.ID && subordinate(target.Role) && subordinate(nextRole) && len(target.BranchIDs) > 0 && len(branches) > 0 && subset(target.BranchIDs, actor.BranchIDs) && subset(branches, actor.BranchIDs)
}
func textValid(value string, maximum int, required bool) bool {
	length := utf8.RuneCountInString(strings.TrimSpace(value))
	return length <= maximum && (!required || length > 0) && !strings.ContainsAny(value, "\x00\r\n")
}
func (input *OrganizationInput) validate() error {
	input.Name = strings.TrimSpace(input.Name)
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	if !textValid(input.Name, 200, true) || !codePattern.MatchString(input.Code) || !textValid(input.BusinessType, 80, true) || !textValid(input.ContactPhone, 30, false) || !textValid(input.Address, 1000, false) {
		return ErrInput
	}
	if input.ContactEmail != "" {
		email, err := identity.NormalizeEmail(input.ContactEmail)
		if err != nil {
			return ErrInput
		}
		input.ContactEmail = email
	}
	return nil
}
func (input *BranchInput) validate() error {
	input.Name = strings.TrimSpace(input.Name)
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	if input.Status == "" {
		input.Status = "ACTIVE"
	}
	if !textValid(input.Name, 200, true) || !codePattern.MatchString(input.Code) || !textValid(input.Address, 1000, false) || !textValid(input.Phone, 30, false) || (input.Status != "ACTIVE" && input.Status != "INACTIVE") {
		return ErrInput
	}
	if input.Email != "" {
		email, err := identity.NormalizeEmail(input.Email)
		if err != nil {
			return ErrInput
		}
		input.Email = email
	}
	return nil
}
