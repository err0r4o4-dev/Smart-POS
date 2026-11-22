package identity

import (
	"encoding/base32"
	"errors"
	"net/http"

	"smartpos/api/internal/platform/httpx"
)

func (handler Handler) mfaError(writer http.ResponseWriter, request *http.Request, err error) {
	switch {
	case errors.Is(err, ErrInvalidToken):
		httpx.Error(writer, request, 400, "INVALID_MFA_PROOF", "MFA proof is invalid or expired; sign in again if needed")
	case errors.Is(err, errMFAConflict):
		httpx.Error(writer, request, 409, "MFA_ALREADY_ENABLED", "MFA is already enabled")
	case errors.Is(err, errMFARateLimited):
		writer.Header().Set("Retry-After", "600")
		httpx.Error(writer, request, 429, "RATE_LIMITED", "Too many MFA attempts; try again later")
	default:
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "MFA is unavailable")
	}
}

func (handler Handler) mfaToken(writer http.ResponseWriter, request *http.Request) (string, bool) {
	if handler.MFA == nil {
		handler.mfaError(writer, request, errMFAUnavailable)
		return "", false
	}
	cookie, err := request.Cookie(handler.cookieName())
	if err != nil {
		httpx.Error(writer, request, 401, "UNAUTHENTICATED", "Authentication required")
		return "", false
	}
	return cookie.Value, true
}

func (handler Handler) mfaStatus(writer http.ResponseWriter, request *http.Request) {
	token, ok := handler.mfaToken(writer, request)
	if !ok {
		return
	}
	result, err := handler.MFA.status(request.Context(), token)
	if errors.Is(err, ErrInvalidToken) {
		httpx.Error(writer, request, 401, "UNAUTHENTICATED", "Authentication required")
		return
	}
	if err != nil {
		handler.mfaError(writer, request, err)
		return
	}
	httpx.JSON(writer, 200, map[string]any{"data": result})
}

func (handler Handler) mfaBegin(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireCSRF(writer, request) {
		return
	}
	var input *struct{}
	if !decode(writer, request, &input) {
		return
	}
	if input == nil {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "A JSON object is required")
		return
	}
	token, ok := handler.mfaToken(writer, request)
	if !ok {
		return
	}
	result, err := handler.MFA.beginEnrollment(request.Context(), token)
	if err != nil {
		handler.mfaError(writer, request, err)
		return
	}
	defer clear(result.Secret)
	secret := base32.StdEncoding.WithPadding(base32.NoPadding).EncodeToString(result.Secret)
	httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"factor_id": result.FactorID, "secret": secret, "expires_at": result.ExpiresAt}})
}

func mfaCode(writer http.ResponseWriter, request *http.Request) (string, bool) {
	var input struct {
		Code string `json:"code"`
	}
	if !decode(writer, request, &input) {
		return "", false
	}
	valid := len(input.Code) == 6
	for _, digit := range input.Code {
		valid = valid && digit >= '0' && digit <= '9'
	}
	if !valid {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Enter a six-digit MFA code")
		return "", false
	}
	return input.Code, true
}

func (handler Handler) mfaConfirm(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireCSRF(writer, request) {
		return
	}
	code, ok := mfaCode(writer, request)
	if !ok {
		return
	}
	token, ok := handler.mfaToken(writer, request)
	if !ok {
		return
	}
	codes, err := handler.MFA.confirmEnrollment(request.Context(), token, code)
	if err != nil {
		handler.mfaError(writer, request, err)
		return
	}
	httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"recovery_codes": codes}})
}

func (handler Handler) mfaChallenge(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireCSRF(writer, request) {
		return
	}
	code, ok := mfaCode(writer, request)
	if !ok {
		return
	}
	token, ok := handler.mfaToken(writer, request)
	if !ok {
		return
	}
	if err := handler.MFA.challenge(request.Context(), token, code); err != nil {
		handler.mfaError(writer, request, err)
		return
	}
	httpx.JSON(writer, 200, map[string]any{"data": map[string]bool{"session_verified": true}})
}
