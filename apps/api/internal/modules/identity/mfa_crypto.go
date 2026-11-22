package identity

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base32"
	"encoding/binary"
	"fmt"
	"time"
)

const totpSecretSize = 20

var mfaBase32 = base32.StdEncoding.WithPadding(base32.NoPadding)

func newTOTPSecret() ([]byte, error) {
	secret := make([]byte, totpSecretSize)
	if _, err := rand.Read(secret); err != nil {
		return nil, err
	}
	return secret, nil
}

// The caller must consume the returned step atomically with session elevation
// under the factor lock. Verification alone does not prevent concurrent replay.
func verifyTOTP(secret []byte, code string, now time.Time, lastStep int64) (int64, error) {
	if len(secret) != totpSecretSize || len(code) != 6 || now.Unix() < 0 || lastStep < -1 {
		return -1, ErrInvalidToken
	}
	for i := range code {
		if code[i] < '0' || code[i] > '9' {
			return -1, ErrInvalidToken
		}
	}
	current := now.Unix() / 30
	matched := int64(-1)
	for step := current - 1; step <= current+1; step++ {
		if step < 0 {
			continue
		}
		var counter [8]byte
		binary.BigEndian.PutUint64(counter[:], uint64(step))
		mac := hmac.New(sha1.New, secret)
		_, _ = mac.Write(counter[:])
		digest := mac.Sum(nil)
		offset := digest[len(digest)-1] & 0x0f
		value := binary.BigEndian.Uint32(digest[offset:offset+4]) & 0x7fffffff
		expected := fmt.Sprintf("%06d", value%1000000)
		if subtle.ConstantTimeCompare([]byte(code), []byte(expected)) == 1 && step > lastStep {
			matched = step
		}
	}
	if matched < 0 {
		return -1, ErrInvalidToken
	}
	return matched, nil
}

type mfaSecretCipher struct {
	aead cipher.AEAD
}

func newMFASecretCipher(key []byte) (*mfaSecretCipher, error) {
	if len(key) != 32 {
		return nil, ErrInvalidInput
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &mfaSecretCipher{aead: aead}, nil
}

// Length prefixes make the authenticated scope unambiguous for any identifier.
func mfaBinding(purpose, userID, factorID string) []byte {
	binding := []byte(purpose)
	binding = binary.AppendUvarint(binding, uint64(len(userID)))
	binding = append(binding, userID...)
	binding = binary.AppendUvarint(binding, uint64(len(factorID)))
	return append(binding, factorID...)
}

func (box *mfaSecretCipher) seal(userID, factorID string, secret []byte) ([]byte, error) {
	if userID == "" || factorID == "" || len(secret) != totpSecretSize {
		return nil, ErrInvalidInput
	}
	nonce := make([]byte, box.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	envelope := append([]byte{1}, nonce...)
	return box.aead.Seal(envelope, nonce, secret, mfaBinding("smartpos.mfa.totp.v1", userID, factorID)), nil
}

func (box *mfaSecretCipher) open(userID, factorID string, envelope []byte) ([]byte, error) {
	if userID == "" || factorID == "" || len(envelope) != 1+box.aead.NonceSize()+totpSecretSize+box.aead.Overhead() || envelope[0] != 1 {
		return nil, ErrInvalidToken
	}
	nonceEnd := 1 + box.aead.NonceSize()
	secret, err := box.aead.Open(nil, envelope[1:nonceEnd], envelope[nonceEnd:], mfaBinding("smartpos.mfa.totp.v1", userID, factorID))
	if err != nil {
		return nil, ErrInvalidToken
	}
	return secret, nil
}

func newMFARecoveryCode(userID, factorID string) (string, [32]byte, error) {
	if userID == "" || factorID == "" {
		return "", [32]byte{}, ErrInvalidInput
	}
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", [32]byte{}, err
	}
	code := mfaBase32.EncodeToString(random[:])
	return code, mfaRecoveryHash(userID, factorID, code), nil
}

func mfaRecoveryHash(userID, factorID, code string) [32]byte {
	bound := mfaBinding("smartpos.mfa.recovery.v1", userID, factorID)
	return sha256.Sum256(append(bound, code...))
}

// Persistence must atomically consume the matching verifier. This comparison
// deliberately does not maintain a process-local set of used recovery codes.
func verifyMFARecoveryCode(userID, factorID, code string, verifier []byte) bool {
	if userID == "" || factorID == "" || len(code) != 26 || len(verifier) != sha256.Size {
		return false
	}
	raw, err := mfaBase32.DecodeString(code)
	if err != nil || len(raw) != 16 || mfaBase32.EncodeToString(raw) != code {
		return false
	}
	expected := mfaRecoveryHash(userID, factorID, code)
	return subtle.ConstantTimeCompare(expected[:], verifier) == 1
}
