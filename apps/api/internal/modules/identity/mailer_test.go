package identity

import (
	"context"
	"net"
	"testing"
	"time"
)

func TestSMTPRespectsContextDeadline(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()
	finished := make(chan struct{})
	go func() {
		defer close(finished)
		connection, acceptErr := listener.Accept()
		if acceptErr != nil {
			return
		}
		defer connection.Close()
		buffer := make([]byte, 1)
		connection.Read(buffer)
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	mailer := SMTPMailer{Address: listener.Addr().String(), From: "noreply@example.test", Origin: "https://example.test"}
	started := time.Now()
	if err := mailer.SendReset(ctx, "person@example.test", "test-only-token"); err == nil {
		t.Fatal("stalled SMTP greeting must fail")
	}
	if time.Since(started) > time.Second {
		t.Fatal("SMTP ignored the context deadline")
	}
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("SMTP connection was not closed")
	}
}
