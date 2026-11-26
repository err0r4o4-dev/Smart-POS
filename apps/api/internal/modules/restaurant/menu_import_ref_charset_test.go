package restaurant

import (
	"encoding/json"
	"os"
	"testing"
	"unicode"
)

// TestMenuImportRefRejectedRanges pins characters the ref validator must
// reject or accept. When SMARTPOS_B16_REF_CHARSET_OUT names a file, it also
// writes every rejected code point range so the isolated migration-52 check
// can compare the database rule against this validator exactly.
func TestMenuImportRefRejectedRanges(t *testing.T) {
	for _, r := range []rune{' ', '\t', 0x85, 0xa0, 0x2007, 0x202f, 0x3000, 0x200b, 0xfeff, 0xe0001, 0x600} {
		if menuImportRefValid(string(r)) {
			t.Errorf("menuImportRefValid(%U) = true; want false", r)
		}
	}
	for _, r := range []rune{'a', '-', '_', '.', 'ก', 0xe34, 0xe49, 0xe000, 0x1f600} {
		if !menuImportRefValid(string(r)) {
			t.Errorf("menuImportRefValid(%U) = false; want true", r)
		}
	}
	out := os.Getenv("SMARTPOS_B16_REF_CHARSET_OUT")
	if out == "" {
		return
	}
	// PostgreSQL text cannot hold NUL or surrogates, so they are not compared.
	var ranges [][2]rune
	for r := rune(1); r <= unicode.MaxRune; r++ {
		if r >= 0xd800 && r <= 0xdfff {
			continue
		}
		if menuImportRefValid(string(r)) {
			continue
		}
		if n := len(ranges); n > 0 && ranges[n-1][1] == r-1 {
			ranges[n-1][1] = r
			continue
		}
		ranges = append(ranges, [2]rune{r, r})
	}
	data, err := json.Marshal(ranges)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(out, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
