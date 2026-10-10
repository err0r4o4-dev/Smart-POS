package purchasing

import (
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"smartpos/api/internal/modules/inventory"
	"strconv"
	"strings"
	"unicode/utf8"
)

var ErrInput = inventory.ErrInput
var ErrConflict = inventory.ErrConflict
var ErrNotFound = inventory.ErrNotFound
var ErrStock = errors.New("insufficient stock")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var codePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,79}$`)
var decimalPattern = regexp.MustCompile(`^[0-9]+(\.[0-9]+)?$`)

func decimal(value string, scale int) (int64, error) {
	if !decimalPattern.MatchString(value) {
		return 0, ErrInput
	}
	parts := strings.Split(value, ".")
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	if len(parts[0]) > 18-scale || len(fraction) > scale {
		return 0, ErrInput
	}
	amount, err := strconv.ParseInt(parts[0]+fraction+strings.Repeat("0", scale-len(fraction)), 10, 64)
	if err != nil {
		return 0, ErrInput
	}
	return amount, nil
}
func fixed(amount int64, scale int) string {
	divisor := int64(1)
	for index := 0; index < scale; index++ {
		divisor *= 10
	}
	return fmt.Sprintf("%d.%0*d", amount/divisor, scale, amount%divisor)
}
func convert(amount int64, factor string) (int64, error) {
	if _, err := decimal(factor, 6); err != nil {
		return 0, err
	}
	ratio, ok := new(big.Rat).SetString(factor)
	if !ok || ratio.Sign() <= 0 {
		return 0, ErrInput
	}
	result := new(big.Rat).Mul(new(big.Rat).SetInt64(amount), ratio)
	if !result.IsInt() || !result.Num().IsInt64() || result.Num().Int64() >= 1000000000000000000 {
		return 0, ErrInput
	}
	return result.Num().Int64(), nil
}
func lineCost(quantity, cents int64) (int64, error) {
	product := new(big.Int).Mul(big.NewInt(quantity), big.NewInt(cents))
	product.Add(product, big.NewInt(500))
	product.Div(product, big.NewInt(1000))
	if !product.IsInt64() || product.Int64() >= 1000000000000000000 {
		return 0, ErrInput
	}
	return product.Int64(), nil
}
func contains(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}
func text(value string, max int, required bool) bool {
	return utf8.RuneCountInString(value) <= max && (!required || strings.TrimSpace(value) != "") && !strings.ContainsRune(value, 0)
}
func transition(kind, status, action string) (string, error) {
	transitions := map[string]map[string]map[string]string{
		"ORDER":   {"DRAFT": {"submit": "PENDING_APPROVAL", "cancel": "CANCELLED"}, "PENDING_APPROVAL": {"approve": "APPROVED", "reject": "REJECTED", "cancel": "CANCELLED"}, "APPROVED": {"issue": "ORDERED", "cancel": "CANCELLED"}, "ORDERED": {"cancel": "CANCELLED", "close": "CLOSED"}, "PARTIALLY_RECEIVED": {"close": "CLOSED"}, "RECEIVED": {"close": "CLOSED"}},
		"RECEIPT": {"DRAFT": {"submit": "PENDING_REVIEW", "cancel": "CANCELLED"}, "PENDING_REVIEW": {"approve": "APPROVED", "reject": "REJECTED", "correct": "DRAFT", "cancel": "CANCELLED"}, "APPROVED": {"post": "POSTED", "cancel": "CANCELLED"}},
		"RETURN":  {"DRAFT": {"submit": "PENDING_APPROVAL", "cancel": "CANCELLED"}, "PENDING_APPROVAL": {"approve": "APPROVED", "reject": "REJECTED", "cancel": "CANCELLED"}, "APPROVED": {"dispatch": "DISPATCHED", "cancel": "CANCELLED"}},
		"TASK":    {"OPEN": {"assign": "ASSIGNED", "start": "IN_PROGRESS", "cancel": "CANCELLED"}, "ASSIGNED": {"assign": "ASSIGNED", "start": "IN_PROGRESS", "cancel": "CANCELLED"}, "IN_PROGRESS": {"complete": "COMPLETED", "cancel": "CANCELLED"}},
	}
	next := transitions[kind][status][action]
	if next == "" {
		return "", ErrConflict
	}
	return next, nil
}

type SupplierInput struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	ContactPerson string `json:"contact_person"`
	Email         string `json:"email"`
	Phone         string `json:"phone"`
	Address       string `json:"address"`
	TaxIdentifier string `json:"tax_identifier"`
	Notes         string `json:"notes"`
	Status        string `json:"status"`
	Revision      int64  `json:"revision"`
}
type ProductInput struct {
	VariantID      string `json:"variant_id"`
	PurchaseUnitID string `json:"purchase_unit_id"`
	SupplierSKU    string `json:"supplier_sku"`
	UnitCost       string `json:"unit_cost"`
	Minimum        string `json:"minimum_order_quantity"`
	Multiple       string `json:"order_multiple"`
	LeadTime       int    `json:"lead_time_days"`
	Preferred      bool   `json:"is_preferred"`
	Status         string `json:"status"`
	Revision       int64  `json:"revision"`
}
type ItemInput struct {
	VariantID      string `json:"variant_id"`
	ParentItemID   string `json:"parent_item_id"`
	PurchaseUnitID string `json:"purchase_unit_id"`
	Quantity       string `json:"quantity"`
	UnitCost       string `json:"unit_cost"`
	Delivered      string `json:"delivered_quantity"`
	Rejected       string `json:"rejected_quantity"`
	Damaged        string `json:"damaged_quantity"`
	Reason         string `json:"reason"`
}
type DocumentInput struct {
	BranchID     string      `json:"branch_id"`
	SupplierID   string      `json:"supplier_id"`
	ParentID     string      `json:"parent_id"`
	LocationID   string      `json:"location_id"`
	ExpectedDate string      `json:"expected_delivery_date"`
	Notes        string      `json:"notes"`
	Revision     int64       `json:"revision"`
	Items        []ItemInput `json:"items"`
}
type ActionInput struct {
	Revision   int64  `json:"revision"`
	Reason     string `json:"reason"`
	AssignedTo string `json:"assigned_to"`
}
type ShelfInput struct {
	BranchID    string `json:"branch_id"`
	LocationID  string `json:"stock_location_id"`
	Code        string `json:"code"`
	Name        string `json:"name"`
	Zone        string `json:"zone"`
	Description string `json:"description"`
	Status      string `json:"status"`
	Revision    int64  `json:"revision"`
}
type SlotInput struct {
	Code     string `json:"code"`
	Position int    `json:"position"`
}
type AssignmentInput struct {
	SlotID    string `json:"slot_id"`
	VariantID string `json:"variant_id"`
	Minimum   string `json:"minimum_quantity"`
	Target    string `json:"target_quantity"`
	Capacity  string `json:"capacity_quantity"`
	Status    string `json:"status"`
	Revision  int64  `json:"revision"`
}
type TaskInput struct {
	AssignmentID string `json:"assignment_id"`
	SourceID     string `json:"source_location_id"`
	Quantity     string `json:"quantity"`
}
