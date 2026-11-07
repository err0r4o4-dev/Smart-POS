package identity

import "errors"

var ErrVerificationUnavailable = errors.New("email verification unavailable")

type VerificationResult struct {
	User     Profile `json:"user"`
	Verified bool    `json:"verified"`
}

func ValidateVerificationToken(token string) error {
	_, err := TokenHash(token)
	return err
}
