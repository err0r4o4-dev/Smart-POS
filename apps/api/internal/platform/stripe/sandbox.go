package stripe

import (
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"time"
)

var ErrInput = errors.New("invalid sandbox request")
var ErrUnavailable = errors.New("Stripe sandbox unavailable")
var ErrNotFound = errors.New("sandbox checkout not found")
var ErrConflict = errors.New("sandbox payment state conflict")

var testKeyPattern = regexp.MustCompile(`^sk_test_[A-Za-z0-9]{1,200}$`)

type Client struct {
	secret string
	origin string
	http   *http.Client
}

func NewSandbox(secret, origin string) (*Client, error) {
	if secret != "" && !testKeyPattern.MatchString(secret) {
		return nil, errors.New("Stripe sandbox requires a test secret key")
	}
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.ForceQuery || parsed.Fragment != "" ||
		(parsed.Scheme != "https" && (parsed.Scheme != "http" || (parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1"))) {
		return nil, errors.New("Stripe sandbox requires a safe public origin")
	}
	return &Client{secret: secret, origin: origin, http: &http.Client{
		Timeout:       10 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	}}, nil
}

func (client *Client) Configured() bool { return client != nil && client.secret != "" }
