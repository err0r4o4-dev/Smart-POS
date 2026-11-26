package pricing

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
)

var ErrInput = errors.New("invalid pricing input")
var ErrConflict = errors.New("pricing revision or approval conflict")
var ErrNotFound = errors.New("pricing resource not found")
var UUID = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

const Maximum int64 = 999999999999999999

func Decimal(value string, precision int) (int64, error) {
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
	if err != nil || amount > Maximum {
		return 0, ErrInput
	}
	return amount, nil
}
func Money(amount int64) string { return fmt.Sprintf("%d.%02d", amount/100, amount%100) }
func Hash(input any) string {
	data, _ := json.Marshal(input)
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
func contains(values []string, value string) bool {
	for _, item := range values {
		if item == value {
			return true
		}
	}
	return false
}
func rounded(amount, multiplier, divisor int64) (int64, error) {
	result := new(big.Int).Mul(big.NewInt(amount), big.NewInt(multiplier))
	result.Add(result, big.NewInt(divisor/2))
	result.Quo(result, big.NewInt(divisor))
	if !result.IsInt64() || result.Int64() > Maximum {
		return 0, ErrInput
	}
	return result.Int64(), nil
}

type PriceItem struct {
	VariantID string `json:"variant_id"`
	UnitPrice string `json:"unit_price"`
}
type Definition struct {
	ID       string      `json:"id"`
	Name     string      `json:"name"`
	BranchID string      `json:"branch_id"`
	Status   string      `json:"status"`
	Revision int64       `json:"revision"`
	Priority int         `json:"priority"`
	StartsAt *time.Time  `json:"starts_at"`
	EndsAt   *time.Time  `json:"ends_at"`
	Items    []PriceItem `json:"items,omitempty"`
	Rule     *Rule       `json:"rule,omitempty"`
}
type Rule struct {
	Type         string   `json:"type"`
	Policy       string   `json:"policy"`
	BasisPoints  int64    `json:"basis_points"`
	Amount       string   `json:"amount"`
	MinimumSpend string   `json:"minimum_spend"`
	Buy          int64    `json:"buy"`
	Get          int64    `json:"get"`
	VariantIDs   []string `json:"variant_ids"`
	CategoryIDs  []string `json:"category_ids"`
	UsageLimit   int64    `json:"usage_limit"`
}
type Line struct {
	VariantID     string `json:"variant_id"`
	CategoryID    string `json:"category_id"`
	Quantity      string `json:"quantity"`
	CatalogPrice  string `json:"catalog_price"`
	UnitPrice     string `json:"unit_price"`
	PriceListID   string `json:"price_list_id"`
	PriceRevision int64  `json:"price_revision"`
	Gross         string `json:"gross"`
	Discount      string `json:"discount"`
	Net           string `json:"net"`
}
type Applied struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Revision int64  `json:"revision"`
	Rule     Rule   `json:"rule"`
	Discount string `json:"discount"`
}
type Quote struct {
	Loyalty    *Reward   `json:"loyalty,omitempty"`
	Lines      []Line    `json:"lines"`
	Promotions []Applied `json:"promotions"`
	Subtotal   string    `json:"subtotal"`
	Discount   string    `json:"discount"`
	Total      string    `json:"total"`
	Revision   string    `json:"revision"`
	ApprovalID string    `json:"approval_id,omitempty"`
}

type Reward struct {
	AccountID       string `json:"account_id"`
	ProgramID       string `json:"program_id"`
	ProgramRevision int64  `json:"program_revision"`
	PointValue      string `json:"point_value"`
	Points          int64  `json:"points"`
	Amount          string `json:"amount"`
}

func (input *Definition) Validate(promotion bool) error {
	input.Name = strings.TrimSpace(input.Name)
	if len(input.Name) == 0 || len(input.Name) > 200 || strings.ContainsAny(input.Name, "\x00\r\n") || (input.BranchID != "" && !UUID.MatchString(input.BranchID)) || input.Priority < -10000 || input.Priority > 10000 || (input.StartsAt != nil && input.EndsAt != nil && !input.EndsAt.After(*input.StartsAt)) {
		return ErrInput
	}
	if promotion {
		if input.Rule == nil || len(input.Items) > 0 {
			return ErrInput
		}
		return input.Rule.Validate()
	}
	if input.Rule != nil || len(input.Items) == 0 || len(input.Items) > 100 {
		return ErrInput
	}
	seen := map[string]bool{}
	for index, item := range input.Items {
		amount, err := Decimal(item.UnitPrice, 2)
		if err != nil || amount == 0 || !UUID.MatchString(item.VariantID) || seen[item.VariantID] {
			return ErrInput
		}
		seen[item.VariantID] = true
		input.Items[index].UnitPrice = Money(amount)
	}
	return nil
}
func (rule *Rule) Validate() error {
	if !contains([]string{"PERCENTAGE", "FIXED", "BOGO", "MINIMUM_SPEND"}, rule.Type) || !contains([]string{"EXCLUSIVE", "STACKABLE", "BEST_DISCOUNT_ONLY"}, rule.Policy) || rule.UsageLimit < 0 || rule.BasisPoints < 0 || rule.BasisPoints > 10000 || len(rule.VariantIDs) > 100 || len(rule.CategoryIDs) > 100 {
		return ErrInput
	}
	if rule.Amount == "" {
		rule.Amount = "0.00"
	}
	if rule.MinimumSpend == "" {
		rule.MinimumSpend = "0.00"
	}
	amount, err := Decimal(rule.Amount, 2)
	if err != nil {
		return err
	}
	minimum, err := Decimal(rule.MinimumSpend, 2)
	if err != nil {
		return err
	}
	if (rule.Type == "PERCENTAGE" && (rule.BasisPoints == 0 || amount != 0 || rule.Buy != 0 || rule.Get != 0)) || ((rule.Type == "FIXED" || rule.Type == "MINIMUM_SPEND") && (amount == 0 || rule.BasisPoints != 0 || rule.Buy != 0 || rule.Get != 0)) || (rule.Type == "MINIMUM_SPEND" && minimum == 0) || (rule.Type == "BOGO" && (rule.Buy < 1 || rule.Get < 1 || rule.Buy > 1000 || rule.Get > 1000 || rule.BasisPoints != 0 || amount != 0)) {
		return ErrInput
	}
	for _, values := range [][]string{rule.VariantIDs, rule.CategoryIDs} {
		seen := map[string]bool{}
		for _, id := range values {
			if !UUID.MatchString(id) || seen[id] {
				return ErrInput
			}
			seen[id] = true
		}
		sort.Strings(values)
	}
	return nil
}
