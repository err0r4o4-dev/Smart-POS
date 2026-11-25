package restaurant

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestTableSessionProofDigest(t *testing.T) {
	proof, digest, err := newTableSessionProof()
	if err != nil {
		t.Fatal(err)
	}
	if len(proof) != 43 || len(digest) != 64 {
		t.Fatalf("issued proof=%d chars digest=%d chars", len(proof), len(digest))
	}
	again, ok := tableSessionProofDigest(proof)
	if !ok || again != digest {
		t.Fatal("issued proof did not parse back to its digest")
	}
	other, _, err := newTableSessionProof()
	if err != nil || other == proof {
		t.Fatal("two issued proofs were equal")
	}
	// A 32-byte value whose final character carries non-zero padding bits.
	canonical := base64.RawURLEncoding.EncodeToString(make([]byte, 32))
	for name, value := range map[string]string{
		"empty":         "",
		"short":         proof[:42],
		"long":          proof + "A",
		"standard b64":  strings.Repeat("+", 43),
		"padded":        proof[:42] + "=",
		"whitespace":    " " + proof[1:],
		"non-canonical": canonical[:42] + "B",
		"qr token":      strings.Repeat("a", 64),
	} {
		if _, ok := tableSessionProofDigest(value); ok {
			t.Errorf("%s proof accepted", name)
		}
	}
	if _, ok := tableSessionProofDigest(canonical); !ok {
		t.Fatal("canonical zero proof rejected")
	}
}
