package restaurant

import (
	"errors"
	"reflect"
	"testing"
)

// B09 (approved 2026-11-26): an order-level discount is allocated to lines in
// proportion to each line's pre-discount value, rounded down to satang, with
// the remainder on the last line.
func TestAllocateOrderDiscount(t *testing.T) {
	for _, tc := range []struct {
		name     string
		discount int64
		gross    []int64
		want     []int64
	}{
		// 1000*1000/6000=166.67, 1000*2000/6000=333.33; last takes 1000-166-333.
		// Largest-remainder rounding would give 167,333,500 instead.
		{"remainder-on-last-line", 1000, []int64{1000, 2000, 3000}, []int64{166, 333, 501}},
		{"exact-split", 1000, []int64{5000, 5000}, []int64{500, 500}},
		{"zero-discount", 0, []int64{1000, 2000}, []int64{0, 0}},
		{"single-line", 750, []int64{8500}, []int64{750}},
		{"full-discount", 6000, []int64{1000, 2000, 3000}, []int64{1000, 2000, 3000}},
		// Floors are 0,0; the last line can absorb only 1, so the rest moves back.
		{"remainder-exceeds-last-line", 2, []int64{1, 1, 1}, []int64{0, 1, 1}},
		{"zero-value-last-line", 100, []int64{3000, 1000, 0}, []int64{75, 25, 0}},
		{"zero-value-middle-line", 1, []int64{1, 0, 1}, []int64{0, 0, 1}},
		{"no-overflow-at-maximum", 999999999999999999, []int64{999999999999999998, 1}, []int64{999999999999999998, 1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := AllocateOrderDiscount(tc.discount, tc.gross)
			if err != nil || !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("AllocateOrderDiscount(%d, %v) = %v, %v; want %v", tc.discount, tc.gross, got, err, tc.want)
			}
		})
	}
}

func TestAllocateOrderDiscountRejectsInvalidInput(t *testing.T) {
	for _, tc := range []struct {
		name     string
		discount int64
		gross    []int64
	}{
		{"no-lines", 0, nil},
		{"negative-discount", -1, []int64{1000}},
		{"discount-above-total", 3001, []int64{1000, 2000}},
		{"negative-line", 0, []int64{1000, -1}},
		{"all-zero-lines-with-discount", 1, []int64{0, 0}},
		{"line-above-maximum", 0, []int64{1000000000000000000}},
		{"total-above-maximum", 0, []int64{999999999999999999, 1}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := AllocateOrderDiscount(tc.discount, tc.gross)
			if !errors.Is(err, ErrInput) || got != nil {
				t.Fatalf("AllocateOrderDiscount(%d, %v) = %v, %v; want nil, ErrInput", tc.discount, tc.gross, got, err)
			}
		})
	}
}

func TestAllocateOrderDiscountDoesNotModifyInput(t *testing.T) {
	gross := []int64{1000, 2000, 3000}
	if _, err := AllocateOrderDiscount(1000, gross); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(gross, []int64{1000, 2000, 3000}) {
		t.Fatalf("input changed to %v", gross)
	}
}
