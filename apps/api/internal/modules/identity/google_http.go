package identity

import (
	"errors"
	"net/http"
	"net/url"
	"time"

	"smartpos/api/internal/platform/httpx"
)

func (handler Handler) googleCookieName() string {
	if handler.Production {
		return "__Host-smartpos_google_flow"
	}
	return "smartpos_google_flow"
}

func (handler Handler) googleCookie(writer http.ResponseWriter, value string, age int) {
	http.SetCookie(writer, &http.Cookie{Name: handler.googleCookieName(), Value: value, Path: "/", HttpOnly: true, Secure: handler.Production, SameSite: http.SameSiteLaxMode, MaxAge: age})
}

func (handler Handler) googleConfig(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	httpx.JSON(writer, 200, map[string]any{"data": map[string]bool{"enabled": handler.Google != nil}})
}

func (handler Handler) googleStart(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	fetchSites := request.Header.Values("Sec-Fetch-Site")
	if len(fetchSites) > 1 || (len(fetchSites) == 1 && fetchSites[0] != "same-origin" && fetchSites[0] != "none") {
		httpx.Error(writer, request, 403, "INVALID_ORIGIN", "Request origin is not allowed")
		return
	}
	origins := request.Header.Values("Origin")
	if len(origins) > 1 || (len(origins) == 1 && !handler.requireOrigin(writer, request)) {
		if len(origins) > 1 {
			httpx.Error(writer, request, 403, "INVALID_ORIGIN", "Request origin is not allowed")
		}
		return
	}
	destination := request.URL.Query().Get("returnTo")
	if destination != "/workspace" && destination != "/setup" || len(request.URL.Query()["returnTo"]) != 1 {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Invalid return destination")
		return
	}
	if handler.Google == nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Google authentication unavailable")
		return
	}
	allowed, err := handler.Service.Allow(request.Context(), "LOGIN", "google-start:ip:"+handler.clientIP(request), 10, 10*time.Minute)
	if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Authentication unavailable")
		return
	}
	if !allowed {
		writer.Header().Set("Retry-After", "600")
		httpx.Error(writer, request, 429, "RATE_LIMITED", "Too many requests; try again later")
		return
	}
	flow, target, err := handler.Google.start(request.Context(), destination)
	if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Google authentication unavailable")
		return
	}
	handler.googleCookie(writer, flow, int(googleFlowTTL.Seconds()))
	http.Redirect(writer, request, target, http.StatusFound)
}

func (handler Handler) googleCallback(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Referrer-Policy", "no-referrer")
	fail := func(reason string) {
		handler.googleCookie(writer, "", -1)
		http.Redirect(writer, request, "/login?google="+reason, http.StatusFound)
	}
	if handler.Google == nil {
		fail("error")
		return
	}
	cookie, err := request.Cookie(handler.googleCookieName())
	if err != nil {
		fail("error")
		return
	}
	values := request.URL.Query()
	if len(values["state"]) != 1 || len(values["code"]) > 1 || len(values["error"]) > 1 {
		fail("error")
		return
	}
	flow, err := handler.Google.consume(request.Context(), cookie.Value, values.Get("state"))
	if err != nil {
		fail("error")
		return
	}
	if values.Get("error") != "" {
		if values.Get("error") == "access_denied" && values.Get("code") == "" {
			fail("cancelled")
		} else {
			fail("error")
		}
		return
	}
	if values.Get("code") == "" {
		fail("error")
		return
	}
	identity, err := handler.Google.provider.exchange(request.Context(), values.Get("code"), flow.verifier, flow.nonceHash)
	if err != nil {
		fail("error")
		return
	}
	token, pending, err := handler.Google.complete(request.Context(), cookie.Value, identity)
	if err != nil {
		fail("error")
		return
	}
	if pending {
		query := url.Values{"google": {"link_required"}, "returnTo": {flow.returnTo}}
		http.Redirect(writer, request, "/login?"+query.Encode(), http.StatusFound)
		return
	}
	handler.googleCookie(writer, "", -1)
	handler.writeCookie(writer, token, int(handler.Service.SessionTTL.Seconds()))
	http.Redirect(writer, request, flow.returnTo, http.StatusFound)
}

func (handler Handler) googleLink(writer http.ResponseWriter, request *http.Request) {
	writer.Header().Set("Cache-Control", "no-store")
	if !handler.requireOrigin(writer, request) {
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(writer, request, &input) {
		return
	}
	if handler.Google == nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Google authentication unavailable")
		return
	}
	if !handler.throttle(writer, request, "LOGIN", input.Email, 5, 10*time.Minute) {
		return
	}
	cookie, err := request.Cookie(handler.googleCookieName())
	if err != nil {
		httpx.Error(writer, request, 401, "INVALID_CREDENTIALS", "Invalid email or password")
		return
	}
	profile, token, csrf, err := handler.Google.link(request.Context(), cookie.Value, input.Email, input.Password)
	if errors.Is(err, ErrInvalidToken) {
		handler.googleCookie(writer, "", -1)
	}
	if errors.Is(err, ErrInvalidCredentials) || errors.Is(err, ErrInvalidToken) {
		httpx.Error(writer, request, 401, "INVALID_CREDENTIALS", "Invalid email or password")
		return
	}
	if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Authentication unavailable")
		return
	}
	handler.googleCookie(writer, "", -1)
	handler.writeCookie(writer, token, int(handler.Service.SessionTTL.Seconds()))
	httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"user": profile, "csrf_token": csrf}})
}
