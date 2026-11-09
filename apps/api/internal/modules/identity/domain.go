package identity

import "errors"

var ErrVerificationUnavailable = errors.New("email verification unavailable")

type RegistrationResult struct {
	Profile
	VerificationEmailSent bool `json:"verification_email_sent"`
}

type VerificationResult struct {
	User     Profile `json:"user"`
	Verified bool    `json:"verified"`
}

func ValidateVerificationToken(token string) error {
	_, err := TokenHash(token)
	return err
}
