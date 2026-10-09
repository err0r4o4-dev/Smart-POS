package config

import (
	"errors"
	"net"
	"net/netip"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Address        string
	DatabaseURL    string
	Environment    string
	PublicOrigin   string
	AllowedOrigins []string
	SessionTTL     time.Duration
	SMTPAddr       string
	SMTPUser       string
	SMTPPassword   string
	MailFrom       string
	TrustedProxyIP netip.Addr
}

func Load() (Config, error) { return Parse(os.Getenv) }

func Parse(getenv func(string) string) (Config, error) {
	address := getenv("API_ADDR")
	if address == "" {
		address = "127.0.0.1:8080"
	}
	_, port, err := net.SplitHostPort(address)
	number, parseErr := strconv.Atoi(port)
	if err != nil || parseErr != nil || number < 1 || number > 65535 {
		return Config{}, errors.New("API_ADDR must contain a valid host and port")
	}
	databaseURL := getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if _, err := pgxpool.ParseConfig(databaseURL); err != nil {
		return Config{}, errors.New("DATABASE_URL is invalid")
	}
	environment := getenv("APP_ENV")
	if environment != "development" && environment != "production" {
		return Config{}, errors.New("APP_ENV must be development or production")
	}
	origin := getenv("PUBLIC_ORIGIN")
	parsedOrigin, err := url.Parse(origin)
	if err != nil || parsedOrigin.Host == "" || parsedOrigin.Path != "" || parsedOrigin.RawQuery != "" || parsedOrigin.Fragment != "" || (parsedOrigin.Scheme != "https" && (environment != "development" || parsedOrigin.Scheme != "http")) {
		return Config{}, errors.New("PUBLIC_ORIGIN must be an allowed absolute origin")
	}
	if parsedOrigin.User != nil || (environment == "development" && parsedOrigin.Scheme == "http" && parsedOrigin.Hostname() != "localhost" && parsedOrigin.Hostname() != "127.0.0.1") {
		return Config{}, errors.New("development HTTP origin must be loopback")
	}
	origins := []string{origin}
	if environment == "development" {
		for _, candidate := range strings.Split(getenv("DEV_ORIGINS"), ",") {
			if candidate = strings.TrimSpace(candidate); candidate != "" {
				parsed, parseErr := url.Parse(candidate)
				if parseErr != nil || parsed.Host == "" || parsed.User != nil || parsed.Path != "" || parsed.Scheme != "http" || (parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1") {
					return Config{}, errors.New("DEV_ORIGINS must be loopback HTTP origins")
				}
				origins = append(origins, candidate)
			}
		}
	}
	smtpAddr := getenv("SMTP_ADDR")
	if _, _, err := net.SplitHostPort(smtpAddr); err != nil {
		return Config{}, errors.New("SMTP_ADDR must contain a host and port")
	}
	mailFrom := getenv("MAIL_FROM")
	if mailFrom == "" || strings.ContainsAny(mailFrom, "\r\n") {
		return Config{}, errors.New("MAIL_FROM is required")
	}
	if environment == "production" && (getenv("SMTP_USER") == "" || getenv("SMTP_PASSWORD") == "") {
		return Config{}, errors.New("production SMTP authentication is required")
	}
	var trustedProxyIP netip.Addr
	if value := getenv("AUTH_TRUSTED_PROXY_IP"); value != "" {
		trustedProxyIP, err = netip.ParseAddr(value)
		if err != nil || !trustedProxyIP.IsValid() || trustedProxyIP.IsLoopback() || trustedProxyIP.IsUnspecified() || trustedProxyIP.IsMulticast() || trustedProxyIP.Zone() != "" {
			return Config{}, errors.New("AUTH_TRUSTED_PROXY_IP must be a single non-loopback IP address")
		}
		trustedProxyIP = trustedProxyIP.Unmap()
	} else if environment == "production" {
		return Config{}, errors.New("AUTH_TRUSTED_PROXY_IP is required in production")
	}
	hours := 24
	if value := getenv("AUTH_SESSION_HOURS"); value != "" {
		hours, err = strconv.Atoi(value)
		if err != nil || hours < 1 || hours > 720 {
			return Config{}, errors.New("AUTH_SESSION_HOURS must be 1 through 720")
		}
	}
	return Config{Address: address, DatabaseURL: databaseURL, Environment: environment, PublicOrigin: origin, AllowedOrigins: origins, SessionTTL: time.Duration(hours) * time.Hour, SMTPAddr: smtpAddr, SMTPUser: getenv("SMTP_USER"), SMTPPassword: getenv("SMTP_PASSWORD"), MailFrom: mailFrom, TrustedProxyIP: trustedProxyIP}, nil
}
