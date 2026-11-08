package identity

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type googleIdentity struct{ subject, email string }
type googleProvider interface {
	authorizationURL(state, nonce, verifier string) string
	exchange(context.Context, string, string, []byte) (googleIdentity, error)
}
type oidcGoogleProvider struct {
	oauth    oauth2.Config
	verifier *oidc.IDTokenVerifier
	client   *http.Client
}

func NewGoogleAuth(service *Service, clientID, clientSecret, redirectURI string) *GoogleAuth {
	if service == nil || clientID == "" || clientSecret == "" || redirectURI == "" {
		return nil
	}
	client := &http.Client{Timeout: 10 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	ctx := oidc.ClientContext(context.Background(), client)
	keys := oidc.NewRemoteKeySet(ctx, "https://www.googleapis.com/oauth2/v3/certs")
	provider := &oidcGoogleProvider{
		oauth:    oauth2.Config{ClientID: clientID, ClientSecret: clientSecret, RedirectURL: redirectURI, Scopes: []string{"openid", "email"}, Endpoint: oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth", TokenURL: "https://oauth2.googleapis.com/token", AuthStyle: oauth2.AuthStyleInParams}},
		verifier: oidc.NewVerifier("https://accounts.google.com", keys, &oidc.Config{ClientID: clientID, SupportedSigningAlgs: []string{oidc.RS256}}),
		client:   client,
	}
	return &GoogleAuth{service: service, provider: provider}
}

func (provider *oidcGoogleProvider) authorizationURL(state, nonce, verifier string) string {
	return provider.oauth.AuthCodeURL(state, oidc.Nonce(nonce), oauth2.S256ChallengeOption(verifier))
}

func (provider *oidcGoogleProvider) exchange(ctx context.Context, code, verifier string, nonceHash []byte) (googleIdentity, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	ctx = oidc.ClientContext(ctx, provider.client)
	token, err := provider.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return googleIdentity{}, err
	}
	raw, ok := token.Extra("id_token").(string)
	if !ok || raw == "" {
		return googleIdentity{}, ErrInvalidToken
	}
	idToken, err := provider.verifier.Verify(ctx, raw)
	if err != nil {
		return googleIdentity{}, err
	}
	var claims struct {
		Email           string `json:"email"`
		EmailVerified   bool   `json:"email_verified"`
		AuthorizedParty string `json:"azp"`
	}
	if idToken.Claims(&claims) != nil || !claims.EmailVerified || idToken.Subject == "" || len(idToken.Subject) > 255 || strings.TrimSpace(idToken.Subject) != idToken.Subject {
		return googleIdentity{}, ErrInvalidToken
	}
	if (len(idToken.Audience) > 1 && claims.AuthorizedParty != provider.oauth.ClientID) || (claims.AuthorizedParty != "" && claims.AuthorizedParty != provider.oauth.ClientID) {
		return googleIdentity{}, ErrInvalidToken
	}
	digest := sha256.Sum256([]byte(idToken.Nonce))
	if idToken.Nonce == "" || subtle.ConstantTimeCompare(digest[:], nonceHash) != 1 {
		return googleIdentity{}, ErrInvalidToken
	}
	email, err := NormalizeEmail(claims.Email)
	if err != nil {
		return googleIdentity{}, errors.New("invalid verified email")
	}
	return googleIdentity{subject: idToken.Subject, email: email}, nil
}
