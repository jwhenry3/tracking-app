package config

import (
	"fmt"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPass     string
	DBName     string
	JWTSecret  string
	Port       string
	CORSOrigin string
}

func Load() (*Config, error) {
	_ = godotenv.Load()

	cfg := &Config{
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnv("DB_PORT", "3306"),
		DBUser:     getEnv("DB_USER", "root"),
		DBPass:     getEnv("DB_PASS", ""),
		DBName:     getEnv("DB_NAME", "tracking_app"),
		JWTSecret:  getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		Port:       getEnv("PORT", "8080"),
		CORSOrigin: getEnv("CORS_ORIGIN", "http://localhost:5173"),
	}

	if cfg.JWTSecret == "dev-secret-change-in-production" {
		fmt.Println("Warning: using default JWT_SECRET; set JWT_SECRET in .env for production")
	}

	return cfg, nil
}

func (c *Config) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&charset=utf8mb4",
		c.DBUser, c.DBPass, c.DBHost, c.DBPort, c.DBName)
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
