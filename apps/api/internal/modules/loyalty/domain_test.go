package loyalty

import "testing"

func TestPointsUseExactIntegers(t *testing.T) {
	for _, test := range []struct {
		amount, spend string
		rate, want    int64
	}{
		{"99.99", "100.00", 1, 0}, {"100.00", "100.00", 1, 1},
		{"299.99", "100.00", 3, 6}, {"0.00", "0.01", 10, 0},
		{"9999999999999999.99", "0.01", 1000000, -1},
	} {
		got, err := Earned(test.amount, test.spend, test.rate)
		if test.want == -1 {
			if err == nil {
				t.Fatal("overflow accepted")
			}
			continue
		}
		if err != nil || got != test.want {
			t.Fatalf("%+v: %d %v", test, got, err)
		}
	}
}

func TestCumulativeReturnAllocation(t *testing.T) {
	previous := int64(0)
	for _, quantity := range []string{"1.000", "2.000", "3.000"} {
		target, err := Reversed(10, quantity, "3.000")
		if err != nil || target < previous {
			t.Fatal(target, err)
		}
		previous += target - previous
	}
	if previous != 10 {
		t.Fatal("full return lost rounding remainder")
	}
	for _, quantity := range []string{"4", "-1", "1.0001"} {
		if _, err := Reversed(10, quantity, "3"); err == nil {
			t.Fatal("invalid quantity accepted", quantity)
		}
	}
}

func TestProgramValidation(t *testing.T) {
	valid := ProgramInput{Name: "Member", Spend: "100.00", EarnPoints: 1, PointValue: "1.00", Status: "ACTIVE"}
	if err := valid.validate(); err != nil {
		t.Fatal(err)
	}
	for _, status := range []string{"", "ARCHIVED", "active"} {
		input := valid
		input.Status = status
		if input.validate() == nil {
			t.Fatal("invalid status accepted")
		}
	}
	valid.Spend = "0.00"
	if valid.validate() == nil {
		t.Fatal("zero divisor accepted")
	}
}
