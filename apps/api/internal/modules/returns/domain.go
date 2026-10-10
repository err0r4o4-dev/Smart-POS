package returns

import (
	"errors"
	"math/big"
	"regexp"
	"strings"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid return input")
var ErrConflict = errors.New("return state or eligible amount changed")
var ErrNotFound = errors.New("return resource not found")
var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
var decimalPattern = regexp.MustCompile(`^(0|[1-9][0-9]{0,15})(\.[0-9]{1,3})?$`)

type LineInput struct {
	SaleItemID  string  `json:"original_sale_item_id"`
	Quantity    string  `json:"quantity"`
	Disposition string  `json:"disposition"`
	Destination *string `json:"destination_location_id"`
}
type CreateInput struct {
	SaleID string      `json:"original_sale_id"`
	Reason string      `json:"reason"`
	Items  []LineInput `json:"items"`
}
type ActionInput struct {
	Revision int64 `json:"revision"`
}
type SettlementInput struct {
	Revision     int64   `json:"revision"`
	Method       string  `json:"method"`
	Reference    string  `json:"reference"`
	Note         string  `json:"note"`
	ShiftID      *string `json:"shift_id"`
	Acknowledged bool    `json:"acknowledged"`
}

func validText(value string, limit int, required bool) bool {
	return utf8.ValidString(value) && utf8.RuneCountInString(value) <= limit && (!required || strings.TrimSpace(value) != "") && !strings.ContainsRune(value, 0)
}
func units(value string, scale int) (*big.Int, error) {
	if !decimalPattern.MatchString(value) {
		return nil, ErrInput
	}
	pieces := strings.Split(value, ".")
	fraction := ""
	if len(pieces) == 2 {
		fraction = pieces[1]
	}
	if len(fraction) > scale || len(pieces[0]) > 18-scale {
		return nil, ErrInput
	}
	result, ok := new(big.Int).SetString(pieces[0]+fraction+strings.Repeat("0", scale-len(fraction)), 10)
	if !ok || result.BitLen() > 60 {
		return nil, ErrInput
	}
	return result, nil
}
func fixed(value *big.Int, scale int) string {
	text := value.String()
	if len(text) <= scale {
		text = strings.Repeat("0", scale+1-len(text)) + text
	}
	return text[:len(text)-scale] + "." + text[len(text)-scale:]
}
func allocation(sold, paid, returned, refunded, quantity string) (string, error) {
	soldUnits, err := units(sold, 3)
	if err != nil || soldUnits.Sign() <= 0 {
		return "", ErrInput
	}
	paidUnits, err := units(paid, 2)
	if err != nil {
		return "", err
	}
	priorUnits, err := units(returned, 3)
	if err != nil {
		return "", err
	}
	priorPaid, err := units(refunded, 2)
	if err != nil {
		return "", err
	}
	requested, err := units(quantity, 3)
	if err != nil || requested.Sign() <= 0 {
		return "", ErrInput
	}
	cumulative := new(big.Int).Add(priorUnits, requested)
	if cumulative.Cmp(soldUnits) > 0 {
		return "", ErrConflict
	}
	eligible := new(big.Int).Quo(new(big.Int).Mul(paidUnits, cumulative), soldUnits)
	eligible.Sub(eligible, priorPaid)
	if eligible.Sign() < 0 || new(big.Int).Add(eligible, priorPaid).Cmp(paidUnits) > 0 {
		return "", ErrConflict
	}
	return fixed(eligible, 2), nil
}
func transition(status, action string) (string, error) {
	switch {
	case status == "DRAFT" && action == "submit":
		return "PENDING_APPROVAL", nil
	case status == "PENDING_APPROVAL" && action == "approve":
		return "APPROVED", nil
	case status == "PENDING_APPROVAL" && action == "reject":
		return "REJECTED", nil
	case (status == "DRAFT" || status == "PENDING_APPROVAL" || status == "APPROVED") && action == "cancel":
		return "CANCELLED", nil
	case status == "APPROVED" && action == "complete":
		return "COMPLETED", nil
	default:
		return "", ErrConflict
	}
}
