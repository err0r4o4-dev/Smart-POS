package transport_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/testsupport"
	"smartpos/api/internal/transport"
)

type marketReleaseMailbox struct{ tokens map[string]string }

func (*marketReleaseMailbox) SendReset(context.Context, string, string) error { return nil }
func (m *marketReleaseMailbox) SendEmailVerification(_ context.Context, recipient, token string) error {
	m.tokens[recipient] = token
	return nil
}

func TestMarketReleaseOwnerHTTP(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MARKET_RELEASE_TEST_DSN")
	if dsn == "" {
		t.Skip("requires a new disposable market release database")
	}
	parsed, err := pgxpool.ParseConfig(dsn)
	if err != nil || parsed.ConnConfig.Host != "127.0.0.1" || parsed.ConnConfig.Port != 15742 ||
		parsed.ConnConfig.Database != "smartpos_market_release_acceptance" || len(parsed.ConnConfig.Fallbacks) != 0 {
		t.Fatal("refusing database outside the dedicated market release test target")
	}
	ctx, stop := context.WithTimeout(context.Background(), 3*time.Minute)
	defer stop()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal("could not open test database")
	}
	defer pool.Close()
	checker := database.Checker{Pool: pool}
	var marker string
	var users int
	if pool.QueryRow(ctx, "SELECT value FROM market_release_test_marker").Scan(&marker) != nil ||
		marker != "market-release-disposable-v1" || checker.Ready(ctx) != nil ||
		pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&users) != nil || users != 0 {
		t.Fatal("expected clean schema and empty, explicitly marked test database")
	}
	logger := slog.New(slog.NewTextHandler(io.Discard, nil))
	box := &marketReleaseMailbox{tokens: map[string]string{}}
	accounts, err := identity.NewService(ctx, pool, box, logger, time.Hour)
	if err != nil {
		t.Fatal("could not start identity for test")
	}
	key := sha256.Sum256([]byte(rand.Text()))
	mfa, err := identity.NewMFAService(pool, "market-release-fixture", key[:])
	if err != nil {
		t.Fatal("could not start MFA for test")
	}
	auth := identity.Handler{Service: accounts, MFA: mfa, Origins: []string{testsupport.MFAOrigin}}
	makeSession := func(email string, enroll bool) map[string]string {
		password := rand.Text() + "-Aa7!"
		if _, failure := accounts.Register(ctx, email, password, "Market fixture"); failure != nil {
			t.Fatal("registration failed")
		}
		verified, failure := accounts.VerifyEmail(ctx, box.tokens[email])
		if failure != nil || !verified.Verified {
			t.Fatal("verification failed")
		}
		if enroll {
			session := testsupport.EnrollMFA(t, ctx, auth, email, password)
			return map[string]string{"token": session.Token, "csrf": session.CSRF}
		}
		_, token, csrf, failure := accounts.Login(ctx, email, password)
		if failure != nil {
			t.Fatal("primary login failed")
		}
		return map[string]string{"token": token, "csrf": csrf}
	}
	root := filepath.Join("..", "..", "..", "..")
	release := filepath.Join(root, ".local", "market-pilot", "main-release-v2")
	assets := os.DirFS(filepath.Join(release, "public"))
	router := http.NewServeMux()
	router.Handle("/images/market-sip-soi/v2/", http.FileServerFS(assets))
	router.Handle("/api/", transport.Router(checker, logger, auth))
	if os.Getenv("SMARTPOS_MARKET_RELEASE_BROWSER") != "" {
		dist := filepath.Join(root, ".local", "market-pilot", "release-browser", "dist")
		if _, err := os.Stat(filepath.Join(dist, "index.html")); err != nil {
			t.Fatal("build the isolated release browser bundle first")
		}
		static := http.FileServerFS(os.DirFS(dist))
		router.Handle("/assets/", static)
		router.Handle("/images/", static)
		router.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			http.ServeFile(w, r, filepath.Join(dist, "index.html"))
		})
	}
	server := httptest.NewServer(router)
	defer server.Close()
	data, err := json.Marshal(map[string]any{
		"origin": server.URL, "writeOrigin": testsupport.MFAOrigin,
		"owner":   makeSession("release-owner@example.test", true),
		"guest":   makeSession("release-other@example.test", true),
		"primary": makeSession("release-primary@example.test", false),
	})
	if err != nil {
		t.Fatal("could not prepare synthetic HTTP test")
	}
	node := os.Getenv("SMARTPOS_MARKET_RELEASE_NODE")
	if !filepath.IsAbs(node) {
		t.Fatal("set absolute Node executable path for acceptance")
	}
	script := filepath.Join(root, "tests", "fixtures", "market-pilot", "main-http-acceptance.mjs")
	command := exec.CommandContext(ctx, node, script)
	command.Stdin = bytes.NewReader(data)
	output, err := command.CombinedOutput()
	if err != nil {
		t.Fatalf("market release HTTP checks failed: %v\n%s", err, output)
	}
	t.Logf("%s", output)
}
