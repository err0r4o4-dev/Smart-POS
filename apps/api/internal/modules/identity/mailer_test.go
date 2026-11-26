package identity

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"strings"
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

func TestSMTPMailerUsesFragmentForVerificationAndQueryForReset(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	bodies := make(chan string, 2)
	serverDone := make(chan struct{})
	go func() {
		defer close(serverDone)
		for range 2 {
			connection, acceptErr := listener.Accept()
			if acceptErr != nil {
				return
			}
			readSMTPMessage(connection, bodies)
			_ = connection.Close()
		}
	}()

	mailer := SMTPMailer{Address: listener.Addr().String(), From: "noreply@example.test", Origin: "https://example.test"}
	if err := mailer.SendEmailVerification(context.Background(), "person@example.test", "verification-token"); err != nil {
		t.Fatal(err)
	}
	if err := mailer.SendReset(context.Background(), "person@example.test", "reset-token"); err != nil {
		t.Fatal(err)
	}

	verificationBody := <-bodies
	resetBody := <-bodies
	if !strings.Contains(verificationBody, "https://example.test/setup#verify=verification-token") {
		t.Fatalf("verification body=%q, want fragment link", verificationBody)
	}
	if strings.Contains(verificationBody, "/setup?verify=") {
		t.Fatalf("verification body=%q still contains query token", verificationBody)
	}
	if !strings.Contains(resetBody, "https://example.test/reset-password?token=reset-token") {
		t.Fatalf("reset body=%q, want query link", resetBody)
	}
	select {
	case <-serverDone:
	case <-time.After(time.Second):
		t.Fatal("SMTP test server did not finish")
	}
}

func readSMTPMessage(connection net.Conn, bodies chan<- string) {
	reader := bufio.NewReader(connection)
	writeResponse := func(response string) { _, _ = fmt.Fprint(connection, response) }
	writeResponse("220 test SMTP\r\n")
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return
		}
		switch {
		case strings.HasPrefix(line, "EHLO"):
			writeResponse("250-test\r\n250 OK\r\n")
		case strings.HasPrefix(line, "MAIL FROM"), strings.HasPrefix(line, "RCPT TO"):
			writeResponse("250 OK\r\n")
		case strings.HasPrefix(line, "DATA"):
			writeResponse("354 End data with <CR><LF>.<CR><LF>\r\n")
			var message strings.Builder
			for {
				dataLine, dataErr := reader.ReadString('\n')
				if dataErr != nil {
					return
				}
				if dataLine == ".\r\n" {
					break
				}
				message.WriteString(dataLine)
			}
			bodies <- message.String()
			writeResponse("250 OK\r\n")
		case strings.HasPrefix(line, "QUIT"):
			writeResponse("221 Bye\r\n")
			return
		}
	}
}
