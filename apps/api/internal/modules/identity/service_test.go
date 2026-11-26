package identity

import (
	"context"
	"io"
	"log/slog"
	"testing"
)

func TestResetRequestQueuesWithoutAccountLookup(t *testing.T) {
	service := &Service{
		Logger:        slog.New(slog.NewTextHandler(io.Discard, nil)),
		resetRequests: make(chan string, 1),
	}
	if err := service.RequestReset(context.Background(), "  Person@Example.test  "); err != nil {
		t.Fatal(err)
	}
	if actual := <-service.resetRequests; actual != "person@example.test" {
		t.Fatalf("queued email = %q", actual)
	}
	service.resetRequests <- "already queued"
	if err := service.RequestReset(context.Background(), "other@example.test"); err != nil {
		t.Fatalf("queue saturation must not expose account state: %v", err)
	}
	if err := service.RequestReset(context.Background(), "invalid"); err != ErrInvalidInput {
		t.Fatalf("invalid email error = %v", err)
	}
}
