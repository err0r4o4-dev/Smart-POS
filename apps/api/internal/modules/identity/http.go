package identity

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/platform/httpx"
)

type Handler struct {
	Service        *Service
	Origins        []string
	Production     bool
	TrustedProxyIP netip.Addr
}

type sessionKey struct{}

func withSession(ctx context.Context, session Session) context.Context {
	return context.WithValue(ctx, sessionKey{}, session)
}

func (handler Handler) cookieName() string {
	if handler.Production {
		return "__Host-smartpos_session"
	}
	return "smartpos_session"
}

func (handler Handler) writeCookie(writer http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(writer, &http.Cookie{Name: handler.cookieName(), Value: token, Path: "/", HttpOnly: true, Secure: handler.Production, SameSite: http.SameSiteLaxMode, MaxAge: maxAge})
}

func (handler Handler) requireOrigin(writer http.ResponseWriter, request *http.Request) bool {
	origin := request.Header.Get("Origin")
	for _, allowed := range handler.Origins {
		if origin == allowed {
			return true
		}
	}
	httpx.Error(writer, request, 403, "INVALID_ORIGIN", "Request origin is not allowed")
	return false
}

func decode(writer http.ResponseWriter, request *http.Request, value any) bool {
	if !strings.HasPrefix(request.Header.Get("Content-Type"), "application/json") {
		httpx.Error(writer, request, 415, "UNSUPPORTED_MEDIA_TYPE", "JSON is required")
		return false
	}
	request.Body = http.MaxBytesReader(writer, request.Body, 4<<10)
	decoder := json.NewDecoder(request.Body)
	decoder.DisallowUnknownFields()
	if decoder.Decode(value) != nil || decoder.Decode(new(any)) != io.EOF {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Invalid request body")
		return false
	}
	return true
}

func (handler Handler) throttle(writer http.ResponseWriter, request *http.Request, scope, email string, limit int, window time.Duration) bool {
	ip := handler.clientIP(request)
	for _, key := range []string{"ip:" + ip, "account:" + strings.ToLower(strings.TrimSpace(email))} {
		allowed, err := handler.Service.Allow(request.Context(), scope, key, limit, window)
		if err != nil {
			httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Authentication unavailable")
			return false
		}
		if !allowed {
			writer.Header().Set("Retry-After", strconv.Itoa(int(window.Seconds())))
			httpx.Error(writer, request, 429, "RATE_LIMITED", "Too many requests; try again later")
			return false
		}
	}
	return true
}

func (handler Handler) clientIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		return request.RemoteAddr
	}
	peer, err := netip.ParseAddr(host)
	if err != nil {
		return host
	}
	peer = peer.Unmap()
	if handler.TrustedProxyIP.IsValid() && peer == handler.TrustedProxyIP {
		forwarded := request.Header.Values("X-Forwarded-For")
		if len(forwarded) == 1 {
			client, parseErr := netip.ParseAddr(strings.TrimSpace(forwarded[0]))
			if parseErr == nil && client.IsValid() && !client.IsUnspecified() && !client.IsMulticast() && client.Zone() == "" {
				return client.Unmap().String()
			}
		}
	}
	return peer.String()
}

func (handler Handler) Routes(router chi.Router) {
	router.Route("/auth", func(auth chi.Router) {
		auth.Post("/register", handler.register)
		auth.Post("/login", handler.login)
		auth.Post("/forgot-password", handler.forgot)
		auth.Post("/reset-password", handler.reset)
		auth.Group(func(private chi.Router) {
			private.Use(handler.RequireAuth)
			private.Get("/me", handler.me)
			private.Post("/logout", handler.logout)
		})
	})
}

func (handler Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		cookie, err := request.Cookie(handler.cookieName())
		if err != nil {
			httpx.Error(writer, request, 401, "UNAUTHENTICATED", "Authentication required")
			return
		}
		session, err := handler.Service.Current(request.Context(), cookie.Value)
		if errors.Is(err, ErrInvalidToken) {
			handler.writeCookie(writer, "", -1)
			httpx.Error(writer, request, 401, "UNAUTHENTICATED", "Authentication required")
			return
		}
		if err != nil {
			httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Authentication unavailable")
			return
		}
		next.ServeHTTP(writer, request.WithContext(withSession(request.Context(), session)))
	})
}

func (handler Handler) requireCSRF(writer http.ResponseWriter, request *http.Request) bool {
	if !handler.requireOrigin(writer, request) {
		return false
	}
	session := request.Context().Value(sessionKey{}).(Session)
	digest := sha256.Sum256([]byte(request.Header.Get("X-CSRF-Token")))
	if request.Header.Get("X-CSRF-Token") == "" || subtle.ConstantTimeCompare(digest[:], session.CSRFHash[:]) != 1 {
		httpx.Error(writer, request, 403, "INVALID_CSRF", "CSRF protection rejected the request")
		return false
	}
	return true
}

func (handler Handler) register(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireOrigin(writer, request) {
		return
	}
	var input struct {
		Email       string `json:"email"`
		Password    string `json:"password"`
		DisplayName string `json:"display_name"`
	}
	if !decode(writer, request, &input) || !handler.throttle(writer, request, "REGISTER", input.Email, 10, time.Hour) {
		return
	}
	profile, err := handler.Service.Register(request.Context(), input.Email, input.Password, input.DisplayName)
	if errors.Is(err, ErrInvalidInput) {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Check your registration details")
		return
	}
	if errors.Is(err, ErrEmailUnavailable) {
		httpx.Error(writer, request, 409, "REGISTRATION_FAILED", "Unable to register with these details")
		return
	}
	if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Registration unavailable")
		return
	}
	httpx.JSON(writer, 201, map[string]any{"data": profile})
}

func (handler Handler) login(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireOrigin(writer, request) {
		return
	}
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(writer, request, &input) || !handler.throttle(writer, request, "LOGIN", input.Email, 5, 10*time.Minute) {
		return
	}
	profile, token, csrf, err := handler.Service.Login(request.Context(), input.Email, input.Password)
	if errors.Is(err, ErrInvalidCredentials) {
		httpx.Error(writer, request, 401, "INVALID_CREDENTIALS", "Invalid email or password")
		return
	}
	if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Authentication unavailable")
		return
	}
	handler.writeCookie(writer, token, int(handler.Service.SessionTTL.Seconds()))
	httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"user": profile, "csrf_token": csrf}})
}

func (handler Handler) me(writer http.ResponseWriter, request *http.Request) {
	session := request.Context().Value(sessionKey{}).(Session)
	httpx.JSON(writer, 200, map[string]any{"data": map[string]any{"user": session.User, "csrf_token": session.CSRFToken}})
}

func (handler Handler) logout(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireCSRF(writer, request) {
		return
	}
	cookie, _ := request.Cookie(handler.cookieName())
	session := request.Context().Value(sessionKey{}).(Session)
	if err := handler.Service.Logout(request.Context(), cookie.Value, session.User.ID); err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Logout unavailable")
		return
	}
	handler.writeCookie(writer, "", -1)
	httpx.JSON(writer, 200, map[string]any{"data": map[string]bool{"revoked": true}})
}

func (handler Handler) forgot(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireOrigin(writer, request) {
		return
	}
	var input struct {
		Email string `json:"email"`
	}
	if !decode(writer, request, &input) || !handler.throttle(writer, request, "FORGOT", input.Email, 3, time.Hour) {
		return
	}
	if err := handler.Service.RequestReset(request.Context(), input.Email); errors.Is(err, ErrInvalidInput) {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Enter a valid email address")
		return
	} else if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Reset request unavailable")
		return
	}
	httpx.JSON(writer, 202, map[string]any{"data": map[string]string{"message": "If an eligible account exists, check your email for reset instructions."}})
}

func (handler Handler) reset(writer http.ResponseWriter, request *http.Request) {
	if !handler.requireOrigin(writer, request) {
		return
	}
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
	}
	if !decode(writer, request, &input) || !handler.throttle(writer, request, "RESET", input.Token, 5, time.Hour) {
		return
	}
	err := handler.Service.Reset(request.Context(), input.Token, input.Password)
	if errors.Is(err, ErrInvalidInput) {
		httpx.Error(writer, request, 400, "INVALID_INPUT", "Password does not meet requirements")
		return
	}
	if errors.Is(err, ErrInvalidToken) {
		httpx.Error(writer, request, 400, "INVALID_RESET_TOKEN", "Reset link is invalid or expired")
		return
	}
	if err != nil {
		httpx.Error(writer, request, 503, "DEPENDENCY_UNAVAILABLE", "Password reset unavailable")
		return
	}
	handler.writeCookie(writer, "", -1)
	httpx.JSON(writer, 200, map[string]any{"data": map[string]bool{"reset": true}})
}
