package returns

import (
	"encoding/json"
	"errors"
	"math/big"
	"smartpos/api/internal/modules/pos"
)

type AdjustmentInput struct {
	CreateInput
	TerminalID   string          `json:"terminal_id"`
	Replacements []pos.ItemInput `json:"replacements"`
	Revision     int64           `json:"revision"`
}
type AdjustmentQuote struct {
	Branch           string         `json:"branch_id"`
	ReturnCredit     string         `json:"return_credit"`
	ReplacementTotal string         `json:"replacement_total"`
	Difference       string         `json:"net_difference"`
	Items            []pos.CartItem `json:"replacement_items"`
}
type adjustment struct {
	ID, Kind, Branch, Sale, ReturnID, Status, Creator, Credit, Total, Difference, Terminal, Method, Reference, Note, Reporter string
	Shift                                                                                                                     *string
	Revision                                                                                                                  int64
	Items                                                                                                                     []pos.CartItem
}

func difference(total, credit string) (string, error) {
	amount, err := units(total, 2)
	if err != nil {
		return "", err
	}
	returned, err := units(credit, 2)
	if err != nil {
		return "", err
	}
	amount.Sub(amount, returned)
	if amount.Sign() < 0 {
		return "-" + fixed(new(big.Int).Abs(amount), 2), nil
	}
	return fixed(amount, 2), nil
}
func adjustmentError(err error) error {
	switch {
	case errors.Is(err, pos.ErrInput):
		return ErrInput
	case errors.Is(err, pos.ErrStock), errors.Is(err, pos.ErrPrice), errors.Is(err, pos.ErrConflict):
		return ErrConflict
	case errors.Is(err, pos.ErrNotFound):
		return ErrNotFound
	}
	return dbError(err)
}
func permissionFor(kind, action string) string {
	if kind == "REVERSAL" {
		switch action {
		case "read":
			return "sales.void.read"
		case "approve", "reject":
			return "sales.void.approve"
		case "complete", "confirm-settlement":
			return "sales.void.complete"
		default:
			return "sales.void.request"
		}
	}
	switch action {
	case "read":
		return "exchange.read"
	case "approve", "reject":
		return "exchange.approve"
	case "complete":
		return "exchange.complete"
	case "confirm-settlement":
		return "exchange.settlement.confirm"
	default:
		return "exchange.create"
	}
}
func snapshots(value []byte) ([]pos.CartItem, error) {
	var items []pos.CartItem
	err := json.Unmarshal(value, &items)
	return items, err
}
