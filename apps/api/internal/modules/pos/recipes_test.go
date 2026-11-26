package pos

import "testing"

func TestMultiplyScaledQuantities(t *testing.T) {
	cases := []struct {
		left, right, want string
	}{
		{left: "0.150", right: "2", want: "0.300"},
		{left: "0.333", right: "0.333", want: "0.111"},
		{left: "2", right: "3.5", want: "7.000"},
	}
	for _, test := range cases {
		got, err := multiplyScaledQuantities(test.left, test.right)
		if err != nil || got != test.want {
			t.Fatalf("%s * %s = %q, %v; want %q", test.left, test.right, got, err, test.want)
		}
	}
	for _, input := range [][2]string{{"0", "1"}, {"-1", "1"}, {"1", "1.0001"}} {
		if _, err := multiplyScaledQuantities(input[0], input[1]); err == nil {
			t.Fatalf("accepted invalid multiplication %q * %q", input[0], input[1])
		}
	}
}

func TestFormatScaled(t *testing.T) {
	for amount, want := range map[int64]string{0: "0.000", 1: "0.001", 1000: "1.000", 12345: "12.345"} {
		if got := formatScaled(amount); got != want {
			t.Fatalf("formatScaled(%d) = %q; want %q", amount, got, want)
		}
	}
}
