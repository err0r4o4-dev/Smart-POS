package identity

import (
	"context"
	"io"
	"log/slog"
	"testing"
	"time"
)

func TestResendAcceptsBeforeAccountLookup(t *testing.T) {
	workerCtx, cancel := context.WithCancel(context.Background())
	cancel()
	service, err := NewService(workerCtx, nil, nil, slog.New(slog.NewTextHandler(io.Discard, nil)), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	if err := service.ResendEmailVerification(context.Background(), "person@example.test"); err != nil {
		t.Fatalf("resend should be accepted before account lookup: %v", err)
	}
}

func TestResendQueueSaturationAndCancellation(t *testing.T) {
	service := &Service{verificationRequests: make(chan string, 1)}
	if err := service.ResendEmailVerification(context.Background(), "  Person@Example.test "); err != nil {
		t.Fatal(err)
	}
	if err := service.ResendEmailVerification(context.Background(), "other@example.test"); err != nil {
		t.Fatalf("full queue must have a generic response: %v", err)
	}
	if got := <-service.verificationRequests; got != "person@example.test" {
		t.Fatalf("queued email = %q", got)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := service.ResendEmailVerification(ctx, "person@example.test"); err != context.Canceled {
		t.Fatalf("canceled request = %v", err)
	}
}
