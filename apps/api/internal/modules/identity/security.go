package identity

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/argon2"
)

const passwordMemory = 64 * 1024
const passwordIterations = 3
const passwordThreads = 2

var ErrInvalidInput = errors.New("invalid input")
var ErrInvalidCredentials = errors.New("invalid credentials")
var ErrEmailUnavailable = errors.New("email unavailable")
var ErrInvalidToken = errors.New("invalid token")

func NormalizeEmail(value string) (string, error) {
	value = strings.ToLower(strings.TrimSpace(value))
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value || len(value) > 254 || len(value) < 3 || strings.ContainsAny(value, "\r\n") {
		return "", ErrInvalidInput
	}
	return value, nil
}

func ValidatePassword(value string) error {
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) < 12 || len(value) > 128 || strings.TrimSpace(value) == "" {
		return ErrInvalidInput
	}
	return nil
}

func ValidateDisplayName(value string) error {
	if value != strings.TrimSpace(value) || utf8.RuneCountInString(value) < 1 || utf8.RuneCountInString(value) > 100 || strings.ContainsAny(value, "\r\n") {
		return ErrInvalidInput
	}
	return nil
}

func HashPassword(value string) (string, error) {
	if err := ValidatePassword(value); err != nil {
		return "", err
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return "", err
	}
	hash := argon2.IDKey([]byte(value), salt, passwordIterations, passwordMemory, passwordThreads, 32)
	return fmt.Sprintf("$argon2id$v=19$m=%d,t=%d,p=%d$%s$%s", passwordMemory, passwordIterations, passwordThreads, base64.RawStdEncoding.EncodeToString(salt), base64.RawStdEncoding.EncodeToString(hash)), nil
}

func VerifyPassword(encoded, value string) bool {
	var memory, iterations, threads uint32
	var saltText, hashText string
	if _, err := fmt.Sscanf(encoded, "$argon2id$v=19$m=%d,t=%d,p=%d$%s", &memory, &iterations, &threads, &saltText); err != nil {
		return false
	}
	parts := strings.Split(saltText, "$")
	if len(parts) != 2 || memory != passwordMemory || iterations != passwordIterations || threads != passwordThreads {
		return false
	}
	saltText, hashText = parts[0], parts[1]
	salt, saltErr := base64.RawStdEncoding.DecodeString(saltText)
	hash, hashErr := base64.RawStdEncoding.DecodeString(hashText)
	if saltErr != nil || hashErr != nil || len(salt) != 16 || len(hash) != 32 {
		return false
	}
	candidate := argon2.IDKey([]byte(value), salt, iterations, memory, uint8(threads), uint32(len(hash)))
	return subtle.ConstantTimeCompare(hash, candidate) == 1
}

func RandomToken() (string, [32]byte, error) {
	value := make([]byte, 32)
	if _, err := rand.Read(value); err != nil {
		return "", [32]byte{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(value)
	return token, sha256.Sum256([]byte(token)), nil
}

func TokenHash(token string) ([32]byte, error) {
	value, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || len(value) != 32 {
		return [32]byte{}, ErrInvalidToken
	}
	return sha256.Sum256([]byte(token)), nil
}

func CSRFForToken(token string) (string, [32]byte) {
	digest := sha256.Sum256([]byte("smartpos-csrf-v1:" + token))
	value := base64.RawURLEncoding.EncodeToString(digest[:])
	return value, sha256.Sum256([]byte(value))
}
