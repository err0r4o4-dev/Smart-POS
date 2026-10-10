package loyalty

import (
	"errors"
	"math/big"
	"smartpos/api/internal/modules/pricing"
	"strings"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid loyalty input")
var ErrConflict = errors.New("loyalty status, revision or available points changed")
var ErrNotFound = errors.New("loyalty resource not found")

const MaximumPoints int64 = 1000000000000

type ProgramInput struct {
	Name       string `json:"name"`
	Spend      string `json:"spend"`
	EarnPoints int64  `json:"earn_points"`
	PointValue string `json:"point_value"`
	Status     string `json:"status"`
	Revision   int64  `json:"revision"`
}

func (input *ProgramInput) validate() error {
	input.Name = strings.TrimSpace(input.Name)
	spend, err := pricing.Decimal(input.Spend, 2)
	value, problem := pricing.Decimal(input.PointValue, 2)
	if !utf8.ValidString(input.Name) || utf8.RuneCountInString(input.Name) == 0 || utf8.RuneCountInString(input.Name) > 200 || strings.ContainsAny(input.Name, "\x00\r\n") || err != nil || problem != nil || spend <= 0 || value <= 0 || input.EarnPoints < 0 || input.EarnPoints > 1000000 || (input.Status != "ACTIVE" && input.Status != "SUSPENDED") || input.Revision < 0 {
		return ErrInput
	}
	input.Spend, input.PointValue = pricing.Money(spend), pricing.Money(value)
	return nil
}

func Earned(amount, spend string, rate int64) (int64, error) {
	cents, err := pricing.Decimal(amount, 2)
	divisor, problem := pricing.Decimal(spend, 2)
	if err != nil || problem != nil || divisor <= 0 || rate < 0 || rate > 1000000 {
		return 0, ErrInput
	}
	points := new(big.Int).Mul(big.NewInt(cents/divisor), big.NewInt(rate))
	if !points.IsInt64() || points.Int64() > MaximumPoints {
		return 0, ErrInput
	}
	return points.Int64(), nil
}

func Reversed(points int64, returned, sold string) (int64, error) {
	quantity, err := pricing.Decimal(returned, 3)
	total, problem := pricing.Decimal(sold, 3)
	if err != nil || problem != nil || total <= 0 || quantity > total || points < 0 || points > MaximumPoints {
		return 0, ErrInput
	}
	result := new(big.Int).Mul(big.NewInt(points), big.NewInt(quantity))
	result.Quo(result, big.NewInt(total))
	return result.Int64(), nil
}
