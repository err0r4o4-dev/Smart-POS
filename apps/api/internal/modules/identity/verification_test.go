package identity

import (
	"context"
	"errors"
	"testing"
)

func TestVerificationTokenValidationRejectsMalformedTokens(t *testing.T) {
	for _, token := range []string{"", "not-a-token", "short", "aGVsbG8"} {
		if err := ValidateVerificationToken(token); !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("token %q: got %v, want ErrInvalidToken", token, err)
		}
	}
}

func TestResendEmailVerificationValidatesEmailBeforeSchemaAccess(t *testing.T) {
	service := &Service{}
	if err := service.ResendEmailVerification(context.Background(), "invalid"); !errors.Is(err, ErrInvalidInput) {
		t.Fatalf("got %v, want ErrInvalidInput", err)
	}
}

func TestVerificationServiceFailsClosedWhenAdditiveSchemaIsUnavailable(t *testing.T) {
	token, _, err := RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{}
	if _, err := service.VerifyEmail(context.Background(), token); !errors.Is(err, ErrVerificationUnavailable) {
		t.Fatalf("got %v, want ErrVerificationUnavailable", err)
	}
}
