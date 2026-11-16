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
var Roles = []string{"OWNER"}
var CatalogPermissions = []string{"catalog.read", "catalog.create", "catalog.update", "catalog.archive", "catalog.import", "catalog.barcode.manage", "catalog.labels.print", "catalog.category.manage", "catalog.brand.manage", "catalog.unit.manage"}
var InventoryPermissions = []string{"inventory.read", "inventory.location.manage", "inventory.opening_balance.create", "inventory.adjustment.create", "inventory.adjustment.approve", "inventory.adjustment.post", "inventory.count.create", "inventory.count.update", "inventory.count.approve", "inventory.count.post", "inventory.transfer.create", "inventory.transfer.approve", "inventory.transfer.dispatch", "inventory.transfer.receive", "inventory.reorder_point.manage", "inventory.audit.read"}
var POSPermissions = []string{"pos.access", "pos.cart.manage", "pos.checkout", "pos.payment.cash", "pos.payment.manual_confirm", "pos.terminal.manage", "pos.register.open", "pos.register.close", "pos.register.close.other", "pos.register.history.read", "pos.payment.reconcile", "sales.read", "receipts.read", "receipts.print"}
var PermissionNames = append(append(append(append(append(append([]string{"organization.read", "organization.update", "branch.read", "branch.create", "branch.update", "branch.deactivate", "audit.read"}, CatalogPermissions...), InventoryPermissions...), POSPermissions...), PurchasingPermissions...), ReturnsPermissions...), AdjustmentPermissions...)

func Permissions(role string) []string {
	if role == "OWNER" {
		return append([]string{}, PermissionNames...)
	}
	return []string{}
}
func hasPermission(role, permission string) bool {
	for _, allowed := range Permissions(role) {
		if allowed == permission {
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

func (input *CreateInput) validateCreate() error {
	if err := input.validateOrganizationCreate(); err != nil {
		return err
	}
	if strings.TrimSpace(input.Branch.Name) == "" {
		input.Branch.Name = "สาขาหลัก"
	}
	if strings.TrimSpace(input.Branch.Code) == "" {
		input.Branch.Code = "MAIN"
	}
	if input.Branch.validate() != nil || input.Branch.Status != "ACTIVE" {
		return ErrInput
	}
	return nil
}

func (input *CreateInput) validateRestaurantCreate() error {
	if input.BusinessType != "RESTAURANT" || input.Branch != (BranchInput{}) {
		return ErrInput
	}
	return input.validateOrganizationCreate()
}

func (input *CreateInput) validateOrganizationCreate() error {
	missingCode := strings.TrimSpace(input.Code) == ""
	if missingCode {
		input.Code = "TEMP"
	}
	err := input.OrganizationInput.validate()
	if missingCode {
		input.Code = ""
	}
	if err != nil {
		return err
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
