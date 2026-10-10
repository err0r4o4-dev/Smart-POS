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
var CatalogPermissions = []string{"catalog.read", "catalog.create", "catalog.update", "catalog.archive", "catalog.import", "catalog.barcode.manage", "catalog.labels.print", "catalog.category.manage", "catalog.brand.manage", "catalog.unit.manage"}
var InventoryPermissions = []string{"inventory.read", "inventory.location.manage", "inventory.opening_balance.create", "inventory.adjustment.create", "inventory.adjustment.approve", "inventory.adjustment.post", "inventory.count.create", "inventory.count.update", "inventory.count.approve", "inventory.count.post", "inventory.transfer.create", "inventory.transfer.approve", "inventory.transfer.dispatch", "inventory.transfer.receive", "inventory.reorder_point.manage", "inventory.audit.read"}
var POSPermissions = []string{"pos.access", "pos.cart.manage", "pos.checkout", "pos.payment.cash", "pos.payment.manual_confirm", "pos.terminal.manage", "pos.register.open", "pos.register.close", "pos.register.close.other", "pos.register.history.read", "pos.payment.reconcile", "sales.read", "receipts.read", "receipts.print"}
var CashierPOSPermissions = []string{"pos.access", "pos.cart.manage", "pos.checkout", "pos.payment.cash", "pos.payment.manual_confirm", "pos.register.open", "pos.register.close", "pos.register.history.read", "sales.read", "receipts.read", "receipts.print"}
var PermissionNames = append(append(append(append(append(append([]string{"organization.read", "organization.update", "branch.read", "branch.create", "branch.update", "branch.deactivate", "employee.read", "employee.invite", "employee.update", "employee.remove", "role.read", "role.assign", "audit.read"}, CatalogPermissions...), InventoryPermissions...), POSPermissions...), PurchasingPermissions...), ReturnsPermissions...), AdjustmentPermissions...)

func Permissions(role string) []string {
	switch role {
	case "OWNER":
		return append([]string{}, PermissionNames...)
	case "MANAGER":
		return append(append(append(managerPermissions(), CustomerPermissions...), LoyaltyPermissions...), QualityPermissions...)
	case "INVENTORY_STAFF":
		return append([]string{"quality.read", "quality.batch.create", "quality.write_off.create", "organization.read", "branch.read", "catalog.read", "catalog.create", "catalog.update", "catalog.import", "catalog.barcode.manage", "catalog.labels.print", "inventory.read", "inventory.audit.read", "inventory.location.manage", "inventory.adjustment.create", "inventory.count.create", "inventory.count.update", "inventory.transfer.create", "inventory.transfer.dispatch", "inventory.transfer.receive", "inventory.reorder_point.manage"}, WarehousePurchasingPermissions...)
	case "PURCHASING_STAFF":
		return append([]string{"quality.read", "quality.batch.create", "organization.read", "branch.read", "catalog.read", "inventory.read", "inventory.transfer.create", "inventory.transfer.receive", "inventory.reorder_point.manage"}, BuyerPermissions...)
	case "CASHIER":
		return append(cashierPermissions(), "quality.read", "customers.read", "customers.select", "customers.groups.read", "loyalty.read", "loyalty.enroll", "loyalty.redeem")
	default:
		return []string{}
	}
}
func managerPermissions() []string {
	return append(append(append(append(append(append(append([]string{"organization.read", "branch.read", "branch.update", "employee.read", "employee.invite", "employee.update", "employee.remove", "role.read", "role.assign", "audit.read"}, CatalogPermissions...), InventoryPermissions...), POSPermissions...), PurchasingPermissions...), ReturnsPermissions...), AdjustmentPermissions...), PricingPermissions...)
}
func cashierPermissions() []string {
	return append(append(append([]string{"organization.read", "branch.read", "catalog.read", "inventory.read", "pricing.read", "promotions.read", "discount.read", "discount.request"}, CashierPOSPermissions...), CashierReturnsPermissions...), CashierAdjustmentPermissions...)
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
