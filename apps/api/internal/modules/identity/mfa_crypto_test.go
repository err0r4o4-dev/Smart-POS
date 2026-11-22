package identity

import (
	"bytes"
	"encoding/hex"
	"errors"
	"strings"
	"testing"
	"time"
)

func TestTOTPStandardVectors(t *testing.T) {
	// RFC 6238 Appendix B SHA-1 values reduced to the configured six digits.
	secret := []byte("12345678901234567890")
	for _, tc := range []struct {
		unix int64
		code string
	}{
		{59, "287082"},
		{1111111109, "081804"},
		{1111111111, "050471"},
		{1234567890, "005924"},
		{2000000000, "279037"},
		{20000000000, "353130"},
	} {
		step, err := verifyTOTP(secret, tc.code, time.Unix(tc.unix, 0), -1)
		if err != nil || step != tc.unix/30 {
			t.Fatalf("unix=%d step=%d error=%v", tc.unix, step, err)
		}
	}
}

func TestTOTPWindowAndReplay(t *testing.T) {
	secret := []byte("12345678901234567890")
	for _, tc := range []struct {
		name     string
		code     string
		unix     int64
		lastStep int64
		want     int64
	}{
		{"current", "287082", 59, -1, 1},
		{"previous", "755224", 59, -1, 0},
		{"next", "359152", 59, -1, 2},
		{"previous at window edge", "287082", 89, -1, 1},
		{"expired", "287082", 90, -1, -1},
		{"outside future window", "969429", 59, -1, -1},
		{"same step replay", "287082", 59, 1, -1},
		{"older than consumed step", "287082", 59, 2, -1},
		{"new step after consumption", "359152", 59, 1, 2},
		{"negative clock", "755224", -1, -1, -1},
		{"invalid replay floor", "287082", 59, -2, -1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := verifyTOTP(secret, tc.code, time.Unix(tc.unix, 0), tc.lastStep)
			if got != tc.want || (err != nil) != (tc.want < 0) {
				t.Fatalf("step=%d error=%v", got, err)
			}
		})
	}
	for _, code := range []string{"", "28708", "0287082", "28708x", "287082 ", " 287082", "287082\n", "２８７０８２", "000000"} {
		if _, err := verifyTOTP(secret, code, time.Unix(59, 0), -1); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("malformed or incorrect code accepted")
		}
	}
	for _, secret := range [][]byte{nil, make([]byte, 19), make([]byte, 21)} {
		if _, err := verifyTOTP(secret, "287082", time.Unix(59, 0), -1); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("invalid secret accepted")
		}
	}
}

func TestMFASecretEncryptionBindsUserAndFactor(t *testing.T) {
	key := bytes.Repeat([]byte{0x15}, 32)
	box, err := newMFASecretCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	secret := []byte("12345678901234567890")
	first, err := box.seal("user-one", "factor-one", secret)
	if err != nil {
		t.Fatal(err)
	}
	second, err := box.seal("user-one", "factor-one", secret)
	if err != nil || bytes.Equal(first, second) || bytes.Contains(first, secret) {
		t.Fatal("encryption must use a fresh nonce and hide the secret")
	}
	plain, err := box.open("user-one", "factor-one", first)
	if err != nil || !bytes.Equal(plain, secret) {
		t.Fatal("factor secret did not round trip")
	}
	for _, scope := range [][2]string{{"user-two", "factor-one"}, {"user-one", "factor-two"}, {"", "factor-one"}, {"user-one", ""}} {
		if _, err := box.open(scope[0], scope[1], first); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("factor substitution accepted")
		}
	}
	wrongKey, err := newMFASecretCipher(bytes.Repeat([]byte{0x16}, 32))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := wrongKey.open("user-one", "factor-one", first); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("wrong key accepted")
	}
	for i := range first {
		tampered := bytes.Clone(first)
		tampered[i] ^= 1
		if _, err := box.open("user-one", "factor-one", tampered); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("modified ciphertext accepted")
		}
	}
	for n := 0; n < len(first); n++ {
		if _, err := box.open("user-one", "factor-one", first[:n]); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("truncated ciphertext accepted")
		}
	}
}

func TestMFASecretEncryptionRejectsInvalidInput(t *testing.T) {
	for _, size := range []int{0, 16, 24, 31, 33} {
		if _, err := newMFASecretCipher(make([]byte, size)); !errors.Is(err, ErrInvalidInput) {
			t.Fatal("non AES-256 key accepted")
		}
	}
	box, err := newMFASecretCipher(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	for _, input := range []struct {
		user, factor string
		secret       []byte
	}{
		{"", "factor", make([]byte, 20)},
		{"user", "", make([]byte, 20)},
		{"user", "factor", nil},
		{"user", "factor", make([]byte, 19)},
		{"user", "factor", make([]byte, 21)},
	} {
		if _, err := box.seal(input.user, input.factor, input.secret); !errors.Is(err, ErrInvalidInput) {
			t.Fatal("invalid factor encryption input accepted")
		}
	}
}

func TestMFARandomSecretsAndRecoveryVerifiers(t *testing.T) {
	first, err := newTOTPSecret()
	if err != nil || len(first) != 20 {
		t.Fatal("TOTP secret generation failed")
	}
	second, err := newTOTPSecret()
	if err != nil || bytes.Equal(first, second) {
		t.Fatal("TOTP secret reused")
	}
	code, verifier, err := newMFARecoveryCode("user-one", "factor-one")
	if err != nil || len(code) != 26 || strings.ContainsAny(code, "= \n") {
		t.Fatal("recovery code generation failed")
	}
	if !verifyMFARecoveryCode("user-one", "factor-one", code, verifier[:]) {
		t.Fatal("generated recovery code rejected")
	}
	other, otherVerifier, err := newMFARecoveryCode("user-one", "factor-one")
	if err != nil || other == code || otherVerifier == verifier {
		t.Fatal("recovery code reused")
	}
	for _, input := range []struct {
		user, factor, code string
		verifier           []byte
	}{
		{"user-two", "factor-one", code, verifier[:]},
		{"user-one", "factor-two", code, verifier[:]},
		{"", "factor-one", code, verifier[:]},
		{"user-one", "", code, verifier[:]},
		{"user-one", "factor-one", other, verifier[:]},
		{"user-one", "factor-one", "a" + code[1:], verifier[:]},
		{"user-one", "factor-one", code + "=", verifier[:]},
		{"user-one", "factor-one", code[:25] + "!", verifier[:]},
		{"user-one", "factor-one", "", verifier[:]},
		{"user-one", "factor-one", code, nil},
		{"user-one", "factor-one", code, verifier[:31]},
	} {
		if verifyMFARecoveryCode(input.user, input.factor, input.code, input.verifier) {
			t.Fatal("invalid recovery verifier or cross-factor code accepted")
		}
	}
	for _, scope := range [][2]string{{"", "factor"}, {"user", ""}} {
		if _, _, err := newMFARecoveryCode(scope[0], scope[1]); !errors.Is(err, ErrInvalidInput) {
			t.Fatal("empty recovery scope accepted")
		}
	}
}

func TestMFABindingCannotShiftIdentifierBoundaries(t *testing.T) {
	box, err := newMFASecretCipher(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	for _, scope := range [][4]string{
		{"a", "bc", "ab", "c"},
		{"a\x00b", "c", "a", "b\x00c"},
		{"a\xff", "b", "a\xfe", "b"},
	} {
		sealed, err := box.seal(scope[0], scope[1], make([]byte, 20))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := box.open(scope[2], scope[3], sealed); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("ambiguous encryption binding accepted")
		}
		code, verifier, err := newMFARecoveryCode(scope[0], scope[1])
		if err != nil {
			t.Fatal(err)
		}
		if verifyMFARecoveryCode(scope[2], scope[3], code, verifier[:]) {
			t.Fatal("ambiguous recovery binding accepted")
		}
	}
}

func TestMFARecoveryRejectsNoncanonicalTrailingBits(t *testing.T) {
	// Independently calculated SHA-256 verifier for this noncanonical alias.
	// A verifier mismatch must not mask missing canonical-input validation.
	const alias = "AAAAAAAAAAAAAAAAAAAAAAAAAB"
	verifier, err := hex.DecodeString("eb4ae6c16f98b126ebb62541cb7a329c5437871775fb2d51b053987995bcdcce")
	if err != nil {
		t.Fatal(err)
	}
	if verifyMFARecoveryCode("user", "factor", alias, verifier) {
		t.Fatal("noncanonical recovery code accepted")
	}
}
