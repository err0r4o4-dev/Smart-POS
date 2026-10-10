package pos

import (
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"smartpos/api/internal/modules/catalog"
	"smartpos/api/internal/modules/customers"
	"smartpos/api/internal/modules/pricing"
	"strconv"
	"strings"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid POS input")
var ErrConflict = errors.New("POS state conflict")
var ErrNotFound = errors.New("POS resource not found")
var ErrStock = errors.New("insufficient recorded stock")
var ErrPrice = errors.New("price changed; review and refresh cart")
var ErrPending = errors.New("pending payment requires reconciliation")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var codePattern = regexp.MustCompile(`^[A-Z0-9][A-Z0-9_-]{0,49}$`)

const maxDecimal int64 = 999999999999999999

func scaled(value string, precision int) (int64, error) {
	pattern := `^[0-9]{1,` + strconv.Itoa(18-precision) + `}(\.[0-9]{1,` + strconv.Itoa(precision) + `})?$`
	if matched, _ := regexp.MatchString(pattern, value); !matched {
		return 0, ErrInput
	}
	parts := strings.Split(value, ".")
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	amount, err := strconv.ParseInt(parts[0]+fraction+strings.Repeat("0", precision-len(fraction)), 10, 64)
	if err != nil || amount > maxDecimal {
		return 0, ErrInput
	}
	return amount, nil
}
func money(amount int64) string { return fmt.Sprintf("%d.%02d", amount/100, amount%100) }
func lineTotal(price, quantity string) (int64, error) {
	cents, err := scaled(price, 2)
	if err != nil {
		return 0, err
	}
	units, err := scaled(quantity, 3)
	if err != nil || units <= 0 {
		return 0, ErrInput
	}
	result := new(big.Int).Mul(big.NewInt(cents), big.NewInt(units))
	result.Add(result, big.NewInt(500))
	result.Quo(result, big.NewInt(1000))
	if !result.IsInt64() || result.Int64() > maxDecimal {
		return 0, ErrInput
	}
	return result.Int64(), nil
}
func text(value string, max int, required bool) bool {
	return utf8.RuneCountInString(value) <= max && (!required || strings.TrimSpace(value) != "") && !strings.ContainsAny(value, "\x00\r\n")
}
func allowed(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}

type ItemInput struct {
	VariantID string `json:"variant_id"`
	Quantity  string `json:"quantity"`
}
type CartInput struct {
	TerminalID string      `json:"terminal_id"`
	Revision   int64       `json:"revision"`
	Items      []ItemInput `json:"items"`
}
type CartItem struct {
	catalog.SaleVariant
	Quantity        string `json:"quantity"`
	LineTotal       string `json:"line_total"`
	Available       string `json:"available"`
	PreviousPrice   string `json:"previous_price"`
	PriceChanged    bool   `json:"price_changed"`
	Saleable        bool   `json:"saleable"`
	GrossTotal      string `json:"gross_total"`
	DiscountTotal   string `json:"discount_total"`
	PricingRevision string `json:"pricing_revision"`
}
type Cart struct {
	CustomerID            *string              `json:"customer_id"`
	Customer              *customers.Selection `json:"customer"`
	CustomerCleared       bool                 `json:"customer_cleared"`
	ID                    string               `json:"id"`
	BranchID              string               `json:"branch_id"`
	TerminalID            string               `json:"terminal_id"`
	CashierID             string               `json:"cashier_id"`
	Status                string               `json:"status"`
	Revision              int64                `json:"revision"`
	Items                 []CartItem           `json:"items"`
	Total                 string               `json:"total"`
	ReviewRequired        bool                 `json:"review_required"`
	Pricing               pricing.Quote        `json:"pricing"`
	StoredPricingRevision string               `json:"-"`
}
type TerminalInput struct {
	BranchID        string `json:"branch_id"`
	Code            string `json:"code"`
	Name            string `json:"name"`
	StockLocationID string `json:"stock_location_id"`
	Status          string `json:"status"`
	Revision        int64  `json:"revision"`
}
type Terminal struct {
	ID string `json:"id"`
	TerminalInput
}
type ShiftInput struct {
	TerminalID  string `json:"terminal_id"`
	OpeningCash string `json:"opening_cash"`
	CountedCash string `json:"counted_cash"`
}
type CheckoutInput struct {
	CartID          string `json:"cart_id"`
	Revision        int64  `json:"revision"`
	Method          string `json:"method"`
	ExpectedTotal   string `json:"expected_total"`
	Received        string `json:"received"`
	PricingRevision string `json:"pricing_revision"`
	ApprovalID      string `json:"approval_id"`
}
type ConfirmationInput struct {
	Reference    string `json:"reference"`
	Note         string `json:"note"`
	Acknowledged bool   `json:"acknowledged"`
}
type Checkout struct {
	CustomerID   *string       `json:"customer_id"`
	CustomerCode string        `json:"customer_code_snapshot"`
	ID           string        `json:"id"`
	BranchID     string        `json:"branch_id"`
	TerminalID   string        `json:"terminal_id"`
	ShiftID      string        `json:"shift_id"`
	CartID       string        `json:"cart_id"`
	CashierID    string        `json:"cashier_id"`
	Status       string        `json:"status"`
	Method       string        `json:"method"`
	Total        string        `json:"total"`
	Received     string        `json:"received"`
	Change       string        `json:"change"`
	Reference    string        `json:"reference"`
	FailureCode  string        `json:"failure_code"`
	SaleID       string        `json:"sale_id"`
	Items        []CartItem    `json:"items"`
	Pricing      pricing.Quote `json:"pricing"`
}

func validateItems(items []ItemInput) error {
	if len(items) > 100 {
		return ErrInput
	}
	seen := map[string]bool{}
	for _, item := range items {
		quantity, err := scaled(item.Quantity, 3)
		if err != nil || quantity <= 0 || !uuidPattern.MatchString(item.VariantID) || seen[item.VariantID] {
			return ErrInput
		}
		seen[item.VariantID] = true
	}
	return nil
}
func payment(method, total, received string) (string, error) {
	if method == "NONE" && total == "0.00" && received == "0.00" {
		return "0.00", nil
	}
	amount, err := scaled(total, 2)
	if err != nil || amount <= 0 {
		return "", ErrInput
	}
	tender, err := scaled(received, 2)
	if err != nil || tender < amount || !allowed([]string{"CASH", "QR_MANUAL", "BANK_TRANSFER_MANUAL"}, method) || method != "CASH" && tender != amount {
		return "", ErrInput
	}
	return money(tender - amount), nil
}
