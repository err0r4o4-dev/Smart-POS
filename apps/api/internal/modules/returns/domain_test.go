package returns

import (
	"errors"
	"testing"
)

func TestHistoricalAllocation(t *testing.T) {
	cases := []struct {
		name, sold, paid, returned, refunded, quantity, want string
		problem                                              error
	}{
		{"two of three", "3", "54.00", "0", "0", "2", "36.00", nil},
		{"first remainder", "3", "1.00", "0", "0", "1", "0.33", nil},
		{"second remainder", "3", "1.00", "1", "0.33", "1", "0.33", nil},
		{"final remainder", "3", "1.00", "2", "0.66", "1", "0.34", nil},
		{"fractional", "0.125", "10.01", "0", "0", "0.025", "2.00", nil},
		{"fractional final", "0.125", "10.01", "0.025", "2.00", "0.100", "8.01", nil},
		{"large exact", "999999999999.999", "999999999999.99", "0", "0", "999999999999.999", "999999999999.99", nil},
		{"over return", "3", "54", "2", "36", "2", "", ErrConflict},
		{"exhausted", "3", "54", "3", "54", "1", "", ErrConflict},
		{"invalid quantity", "3", "54", "0", "0", "0", "", ErrInput},
		{"exponent", "3", "54", "0", "0", "1e0", "", ErrInput},
		{"excess precision", "3", "54", "0", "0", "0.0001", "", ErrInput},
		{"negative", "3", "54", "0", "0", "-1", "", ErrInput},
		{"money precision", "3", "54.001", "0", "0", "1", "", ErrInput},
	}
	for _, entry := range cases {
		t.Run(entry.name, func(t *testing.T) {
			actual, err := allocation(entry.sold, entry.paid, entry.returned, entry.refunded, entry.quantity)
			if actual != entry.want || !errors.Is(err, entry.problem) {
				t.Fatalf("got %s/%v want %s/%v", actual, err, entry.want, entry.problem)
			}
		})
	}
}
func TestReturnStateMachine(t *testing.T) {
	states := []string{"DRAFT", "PENDING_APPROVAL", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"}
	actions := []string{"submit", "approve", "reject", "complete", "cancel"}
	valid := map[string]string{"DRAFT/submit": "PENDING_APPROVAL", "DRAFT/cancel": "CANCELLED", "PENDING_APPROVAL/approve": "APPROVED", "PENDING_APPROVAL/reject": "REJECTED", "PENDING_APPROVAL/cancel": "CANCELLED", "APPROVED/cancel": "CANCELLED", "APPROVED/complete": "COMPLETED"}
	for _, state := range states {
		for _, action := range actions {
			t.Run(state+"/"+action, func(t *testing.T) {
				actual, err := transition(state, action)
				want, ok := valid[state+"/"+action]
				if ok && (actual != want || err != nil) || !ok && !errors.Is(err, ErrConflict) {
					t.Fatalf("unexpected %s/%v", actual, err)
				}
			})
		}
	}
}
