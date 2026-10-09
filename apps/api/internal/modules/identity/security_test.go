package identity

import (
	"crypto/sha256"
	"testing"
)

func TestNormalizeEmail(t *testing.T) {
	value, err := NormalizeEmail("  Example@Example.COM  ")
	if err != nil || value != "example@example.com" {
		t.Fatalf("normalized=%q error=%v", value, err)
	}
	for _, candidate := range []string{"invalid", "name@example.com\nBcc:other@example.com", "Name <name@example.com>"} {
		if _, err := NormalizeEmail(candidate); err == nil {
			t.Fatalf("accepted %q", candidate)
		}
	}
}

func TestPasswordHash(t *testing.T) {
	if ValidatePassword("short") == nil {
		t.Fatal("weak password accepted")
	}
	hash, err := HashPassword("a long valid password")
	if err != nil {
		t.Fatal(err)
	}
	if !VerifyPassword(hash, "a long valid password") || VerifyPassword(hash, "incorrect password") || VerifyPassword("malformed", "a long valid password") {
		t.Fatal("password verification failed")
	}
}

func TestTokens(t *testing.T) {
	token, hash, err := RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	calculated, err := TokenHash(token)
	if err != nil || calculated != hash {
		t.Fatal("token hash mismatch")
	}
	if _, err := TokenHash("bad"); err == nil {
		t.Fatal("invalid token accepted")
	}
	csrf, csrfHash := CSRFForToken(token)
	if sha256.Sum256([]byte(csrf)) != csrfHash || csrf == token {
		t.Fatal("CSRF is not bound safely")
	}
}
