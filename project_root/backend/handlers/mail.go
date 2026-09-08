package handlers

import (
	"crypto/tls"
	"fmt"
	"net"
	"net/smtp"
	"strings"
)

func (h *AuthHandler) sendMail(to, subject, body string) error {
	from := h.Cfg.MailFrom()
	if strings.TrimSpace(h.Cfg.SMTPHost) == "" || from == "" {
		return fmt.Errorf("mail is not configured")
	}

	port := strings.TrimSpace(h.Cfg.SMTPPort)
	if port == "" {
		port = "587"
	}
	addr := net.JoinHostPort(h.Cfg.SMTPHost, port)

	msg := strings.Join([]string{
		"From: " + from,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	var auth smtp.Auth
	if strings.TrimSpace(h.Cfg.SMTPUser) != "" {
		auth = smtp.PlainAuth("", h.Cfg.SMTPUser, h.Cfg.SMTPPass, h.Cfg.SMTPHost)
	}

	if port == "465" {
		return sendMailTLS(addr, h.Cfg.SMTPHost, auth, from, to, []byte(msg))
	}

	return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}

func sendMailTLS(addr, host string, auth smtp.Auth, from, to string, msg []byte) error {
	conn, err := tls.Dial("tcp", addr, &tls.Config{
		ServerName: host,
		MinVersion: tls.VersionTLS12,
	})
	if err != nil {
		return err
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, host)
	if err != nil {
		return err
	}
	defer client.Close()

	if auth != nil {
		if err := client.Auth(auth); err != nil {
			return err
		}
	}
	if err := client.Mail(from); err != nil {
		return err
	}
	if err := client.Rcpt(to); err != nil {
		return err
	}

	writer, err := client.Data()
	if err != nil {
		return err
	}
	if _, err := writer.Write(msg); err != nil {
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}

	return client.Quit()
}
