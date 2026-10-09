package identity

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"net"
	"net/smtp"
	"net/url"
	"strings"
	"time"
)

type SMTPMailer struct {
	Address    string
	Username   string
	Password   string
	From       string
	Origin     string
	Production bool
}

func (mailer SMTPMailer) SendReset(ctx context.Context, to, token string) error {
	link := mailer.Origin + "/reset-password?token=" + url.QueryEscape(token)
	body := "A password reset was requested for your SmartPOS account. This link expires in 15 minutes.\r\n\r\n" + link + "\r\n\r\nIf you did not request this, you can ignore this email.\r\n"
	return mailer.send(ctx, to, "Reset your SmartPOS password", body)
}

func (mailer SMTPMailer) SendInvitation(ctx context.Context, to, token string) error {
	link := mailer.Origin + "/setup#invitation=" + url.QueryEscape(token)
	return mailer.send(ctx, to, "SmartPOS organization invitation", "Sign in with this email to accept your invitation within 48 hours.\r\n\r\n"+link+"\r\n")
}

func (mailer SMTPMailer) send(ctx context.Context, to, subject, body string) error {
	host, _, err := net.SplitHostPort(mailer.Address)
	if err != nil {
		return errors.New("invalid SMTP address")
	}
	message := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", mailer.From, to, subject, body))
	dialer := net.Dialer{Timeout: 3 * time.Second}
	connection, err := dialer.DialContext(ctx, "tcp", mailer.Address)
	if err != nil {
		return errors.New("mail service unavailable")
	}
	defer connection.Close()
	stopCancellation := context.AfterFunc(ctx, func() { connection.Close() })
	defer stopCancellation()
	deadline := time.Now().Add(10 * time.Second)
	if contextDeadline, ok := ctx.Deadline(); ok && contextDeadline.Before(deadline) {
		deadline = contextDeadline
	}
	if err := connection.SetDeadline(deadline); err != nil {
		return errors.New("mail service unavailable")
	}
	client, err := smtp.NewClient(connection, host)
	if err != nil {
		return errors.New("mail service unavailable")
	}
	defer client.Close()
	if mailer.Production {
		ok, _ := client.Extension("STARTTLS")
		if !ok {
			return errors.New("mail service does not support TLS")
		}
		if err = client.StartTLS(&tls.Config{ServerName: host, MinVersion: tls.VersionTLS12}); err != nil {
			return errors.New("mail TLS failed")
		}
	}
	if mailer.Username != "" {
		if err = client.Auth(smtp.PlainAuth("", mailer.Username, mailer.Password, host)); err != nil {
			return errors.New("mail authentication failed")
		}
	}
	from := mailer.From
	if strings.Contains(from, "<") {
		from = strings.TrimSuffix(strings.SplitN(from, "<", 2)[1], ">")
	}
	if err = client.Mail(from); err != nil {
		return errors.New("mail sender rejected")
	}
	if err = client.Rcpt(to); err != nil {
		return errors.New("mail recipient rejected")
	}
	writer, err := client.Data()
	if err != nil {
		return errors.New("mail delivery failed")
	}
	if _, err = writer.Write(message); err != nil {
		return errors.New("mail delivery failed")
	}
	if err = writer.Close(); err != nil {
		return errors.New("mail delivery failed")
	}
	return client.Quit()
}
