package config

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost       string
	DBPort       string
	DBUser       string
	DBPass       string
	DBName       string
	LegacyDBName string
	JWTSecret    string
	Port         string
	CORSOrigin   string
	AppOrigin    string
	UploadDir    string
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPass     string
	SMTPFrom     string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		DBHost:       getEnv("DB_HOST", "localhost"),
		DBPort:       getEnv("DB_PORT", "3306"),
		DBUser:       getEnv("DB_USER", "root"),
		DBPass:       getEnv("DB_PASS", ""),
		DBName:       getEnv("DB_NAME", "tracking_app"),
		LegacyDBName: getEnv("LEGACY_DB_NAME", "bill_dashboard_dev"),
		JWTSecret:    getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		Port:         getEnv("PORT", "8080"),
		CORSOrigin:   getEnv("CORS_ORIGIN", "http://localhost:5173"),
		AppOrigin:    getEnv("APP_ORIGIN", ""),
		UploadDir:    getEnv("UPLOAD_DIR", "uploads"),
		SMTPHost:     getEnv("SMTP_HOST", ""),
		SMTPPort:     getEnv("SMTP_PORT", "587"),
		SMTPUser:     getEnv("SMTP_USER", ""),
		SMTPPass:     getEnv("SMTP_PASS", ""),
		SMTPFrom:     getEnv("SMTP_FROM", ""),
	}

	if cfg.AppOrigin == "" {
		cfg.AppOrigin = cfg.CORSOrigin
	}

	if cfg.JWTSecret == "dev-secret-change-in-production" {
		fmt.Println("Warning: using default JWT_SECRET; set JWT_SECRET in .env for production")
	}

	return cfg, nil
}

func (c *Config) DSN() string {
	return c.DSNFor(c.DBName)
}

func (c *Config) LegacyDSN() string {
	return c.DSNFor(c.LegacyDBName)
}

func (c *Config) DSNFor(database string) string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4",
		c.DBUser, c.DBPass, c.DBHost, c.DBPort, database)
}

func (c *Config) MailConfigured() bool {
	return strings.TrimSpace(c.SMTPHost) != "" && c.MailFrom() != ""
}

func (c *Config) MailFrom() string {
	if strings.TrimSpace(c.SMTPFrom) != "" {
		return strings.TrimSpace(c.SMTPFrom)
	}
	return strings.TrimSpace(c.SMTPUser)
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
