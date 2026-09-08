package handlers

import (
	"errors"
	"regexp"
	"strings"

	"github.com/go-sql-driver/mysql"
)

var emailPattern = regexp.MustCompile(`^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$`)

func normalizeEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" {
		return "", nil
	}
	if len(email) > 255 || !emailPattern.MatchString(email) {
		return "", errors.New("invalid email address")
	}
	return email, nil
}

func optionalEmail(raw string) string {
	email, err := normalizeEmail(raw)
	if err != nil {
		return ""
	}
	return email
}

func duplicateConstraint(err error) string {
	var mysqlErr *mysql.MySQLError
	if !errors.As(err, &mysqlErr) || mysqlErr.Number != 1062 {
		return ""
	}
	message := strings.ToLower(mysqlErr.Message)
	if strings.Contains(message, "email") {
		return "email"
	}
	if strings.Contains(message, "username") {
		return "username"
	}
	return "unknown"
}

func duplicateConstraintError(err error) string {
	switch duplicateConstraint(err) {
	case "email":
		return "email already in use"
	case "username":
		return "username already exists"
	default:
		return ""
	}
}
