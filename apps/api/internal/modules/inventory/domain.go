package inventory

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid inventory input")
var ErrConflict = errors.New("inventory conflict")
var ErrNotFound = errors.New("inventory resource not found")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var quantityPattern = regexp.MustCompile(`^-?[0-9]{1,15}(\.[0-9]{1,3})?$`)
var codePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,79}$`)

func quantity(value string) (int64, error) {
	if !quantityPattern.MatchString(value) {
		return 0, ErrInput
	}
	negative := strings.HasPrefix(value, "-")
	parts := strings.Split(strings.TrimPrefix(value, "-"), ".")
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	fraction += strings.Repeat("0", 3-len(fraction))
	amount, err := strconv.ParseInt(parts[0]+fraction, 10, 64)
	if err != nil {
		return 0, ErrInput
	}
	if negative {
		amount = -amount
	}
	return amount, nil
}
func decimal(amount int64) string {
	sign := ""
	if amount < 0 {
		sign = "-"
		amount = -amount
	}
	return fmt.Sprintf("%s%d.%03d", sign, amount/1000, amount%1000)
}
func text(value string, maximum int, required bool) bool {
	return utf8.RuneCountInString(value) <= maximum && (!required || strings.TrimSpace(value) != "") && !strings.ContainsRune(value, 0)
}
func contains(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

type Item struct {
	BatchID         *string `json:"batch_id,omitempty"`
	BatchVerified   bool    `json:"batch_verified,omitempty"`
	VariantID       string  `json:"variant_id"`
	Quantity        string  `json:"quantity"`
	CountedQuantity *string `json:"counted_quantity,omitempty"`
}
type Command struct {
	BranchID              string  `json:"branch_id"`
	LocationID            string  `json:"location_id"`
	DestinationLocationID *string `json:"destination_location_id,omitempty"`
	AdjustmentType        string  `json:"adjustment_type,omitempty"`
	ReasonCode            string  `json:"reason_code"`
	Notes                 string  `json:"notes"`
	AssignedTo            *string `json:"assigned_to,omitempty"`
	Revision              int64   `json:"revision,omitempty"`
	Items                 []Item  `json:"items"`
}

func (input Command) validate(kind string) error {
	if !uuidPattern.MatchString(input.LocationID) || !text(input.ReasonCode, 100, true) || !text(input.Notes, 2000, false) || len(input.Items) < 1 || len(input.Items) > 100 {
		return ErrInput
	}
	if kind == "TRANSFER" && (input.DestinationLocationID == nil || !uuidPattern.MatchString(*input.DestinationLocationID) || *input.DestinationLocationID == input.LocationID) {
		return ErrInput
	}
	if kind == "ADJUSTMENT" && !contains([]string{"INCREASE", "DECREASE", "CORRECTION"}, input.AdjustmentType) {
		return ErrInput
	}
	seen := map[string]bool{}
	for _, item := range input.Items {
		if !uuidPattern.MatchString(item.VariantID) || seen[item.VariantID] || item.BatchID != nil && (!uuidPattern.MatchString(*item.BatchID) || !item.BatchVerified || kind == "COUNT" || input.AdjustmentType == "CORRECTION") {
			return ErrInput
		}
		seen[item.VariantID] = true
		if kind != "COUNT" {
			amount, err := quantity(item.Quantity)
			if err != nil || amount < 0 || (amount == 0 && (kind != "ADJUSTMENT" || input.AdjustmentType != "CORRECTION")) {
				return ErrInput
			}
		}
	}
	return nil
}
func transition(kind, status, action string) (string, error) {
	transitions := map[string]map[string]string{
		"ADJUSTMENT": {"DRAFT:submit": "PENDING_APPROVAL", "PENDING_APPROVAL:approve": "APPROVED", "APPROVED:post": "POSTED", "PENDING_APPROVAL:reject": "REJECTED", "DRAFT:cancel": "CANCELLED", "PENDING_APPROVAL:cancel": "CANCELLED", "APPROVED:cancel": "CANCELLED"},
		"COUNT":      {"IN_PROGRESS:submit": "SUBMITTED", "SUBMITTED:approve": "APPROVED", "APPROVED:post": "POSTED", "IN_PROGRESS:cancel": "CANCELLED", "SUBMITTED:cancel": "CANCELLED", "APPROVED:cancel": "CANCELLED"},
		"TRANSFER":   {"DRAFT:submit": "PENDING_APPROVAL", "PENDING_APPROVAL:approve": "APPROVED", "APPROVED:dispatch": "DISPATCHED", "DISPATCHED:receive": "RECEIVED", "DRAFT:cancel": "CANCELLED", "PENDING_APPROVAL:cancel": "CANCELLED", "APPROVED:cancel": "CANCELLED"},
	}
	next := transitions[kind][status+":"+action]
	if next == "" {
		return "", ErrConflict
	}
	return next, nil
}
