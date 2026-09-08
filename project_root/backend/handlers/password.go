package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const (
	passwordResetTTL      = time.Hour
	forgotPasswordMessage = "If an account exists for that email, a reset link has been sent."
)

type forgotPasswordRequest struct {
	Email string `json:"email" binding:"required"`
}

type resetPasswordRequest struct {
	Token    string `json:"token" binding:"required"`
	Password string `json:"password" binding:"required,min=6"`
}

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func (h *AuthHandler) ForgotPassword(c *gin.Context) {
	var req forgotPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a valid email is required"})
		return
	}

	email, err := normalizeEmail(req.Email)
	if err != nil || email == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "a valid email is required"})
		return
	}

	if !h.Cfg.MailConfigured() {
		c.JSON(http.StatusServiceUnavailable, gin.H{
			"error": "password recovery is not configured on this server",
		})
		return
	}

	respondOK := func() {
		c.JSON(http.StatusOK, gin.H{"message": forgotPasswordMessage})
	}

	var userID int
	var username string
	err = h.DB.QueryRow(
		"SELECT id, username FROM users WHERE email = ?",
		email,
	).Scan(&userID, &username)
	if err != nil {
		if err != sql.ErrNoRows {
			log.Printf("forgot-password lookup failed: %v", err)
		}
		respondOK()
		return
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		log.Printf("forgot-password token generate failed: %v", err)
		respondOK()
		return
	}
	token := hex.EncodeToString(raw)
	tokenHash := hashResetToken(token)
	expiresAt := time.Now().Add(passwordResetTTL)

	_, err = h.DB.Exec(
		"INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
		userID, tokenHash, expiresAt,
	)
	if err != nil {
		log.Printf("forgot-password token store failed: %v", err)
		respondOK()
		return
	}

	origin := strings.TrimRight(h.Cfg.AppOrigin, "/")
	resetURL := origin + "/reset-password?token=" + token
	body := "Hi " + username + ",\n\n" +
		"Someone requested a password reset for your Home Planner account.\n" +
		"Open this link to choose a new password (it expires in 1 hour):\n\n" +
		resetURL + "\n\n" +
		"If you did not request this, you can ignore this email.\n"

	if err := h.sendMail(email, "Reset your Home Planner password", body); err != nil {
		log.Printf("forgot-password send failed: %v", err)
	}

	respondOK()
}

func (h *AuthHandler) ResetPassword(c *gin.Context) {
	var req resetPasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token and a password of at least 6 characters are required"})
		return
	}

	token := strings.TrimSpace(req.Token)
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reset token is required"})
		return
	}

	tokenHash := hashResetToken(token)

	var id, userID int
	var expiresAt time.Time
	var usedAt sql.NullTime
	err := h.DB.QueryRow(
		"SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ?",
		tokenHash,
	).Scan(&id, &userID, &expiresAt, &usedAt)
	if err != nil || usedAt.Valid || time.Now().After(expiresAt) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "this reset link is invalid or has expired"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update password"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update password"})
		return
	}
	defer tx.Rollback()

	if _, err := tx.Exec("UPDATE users SET password = ? WHERE id = ?", string(hash), userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update password"})
		return
	}
	if _, err := tx.Exec("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update password"})
		return
	}
	if _, err := tx.Exec(
		"UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = ? AND used_at IS NULL",
		userID,
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update password"})
		return
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update password"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}
