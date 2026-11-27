package restaurant

import (
	"math/big"

	"smartpos/api/internal/modules/pricing"
)

// AllocateOrderDiscount splits an order-level discount, in satang, across lines
// in proportion to each line's pre-discount value (B09, approved 2026-11-26).
// Each line receives the floor of its share and the last line receives the
// remainder, so allocations always sum exactly to the discount. No line is
// allocated more than its own value: any remainder the last line cannot absorb
// is assigned to earlier lines from the end, so a refund never goes negative.
// It is a pure calculation; callers own persistence and refund policy.
func AllocateOrderDiscount(discount int64, gross []int64) ([]int64, error) {
	if len(gross) == 0 || discount < 0 {
		return nil, ErrInput
	}
	var total int64
	for _, value := range gross {
		if value < 0 || value > pricing.Maximum || total > pricing.Maximum-value {
			return nil, ErrInput
		}
		total += value
	}
	if discount > total || (total == 0 && discount > 0) {
		return nil, ErrInput
	}
	result := make([]int64, len(gross))
	if discount == 0 {
		return result, nil
	}
	assigned := int64(0)
	last := len(gross) - 1
	for index := 0; index < last; index++ {
		share := new(big.Int).Mul(big.NewInt(discount), big.NewInt(gross[index]))
		share.Quo(share, big.NewInt(total))
		result[index] = share.Int64()
		assigned += result[index]
	}
	remainder := discount - assigned
	for index := last; index >= 0 && remainder > 0; index-- {
		room := gross[index] - result[index]
		take := min(room, remainder)
		result[index] += take
		remainder -= take
	}
	return result, nil
}
