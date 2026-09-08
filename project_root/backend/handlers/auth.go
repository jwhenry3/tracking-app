package handlers

import (
	"database/sql"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"fullstack-app/config"
	"fullstack-app/hub"
	"fullstack-app/middleware"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	DB  *sql.DB
	Cfg *config.Config
	Hub *hub.Hub
}

type registerRequest struct {
	Username      string `json:"username" binding:"required,min=3,max=50"`
	Password      string `json:"password" binding:"required,min=6"`
	Email         string `json:"email"`
	WorkspaceName string `json:"workspace_name"`
}

type loginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func slugify(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	re := regexp.MustCompile(`[^a-z0-9]+`)
	slug = re.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "workspace"
	}
	return slug
}

func (h *AuthHandler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	email, err := normalizeEmail(req.Email)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not hash password"})
		return
	}

	tx, err := h.DB.Begin()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not start transaction"})
		return
	}
	defer tx.Rollback()

	var emailValue any
	if email != "" {
		emailValue = email
	}

	result, err := tx.Exec(
		"INSERT INTO users (username, password, email) VALUES (?, ?, ?)",
		req.Username, string(hash), emailValue,
	)
	if err != nil {
		if message := duplicateConstraintError(err); message != "" {
			c.JSON(http.StatusConflict, gin.H{"error": message})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not register user"})
		return
	}

	userID64, _ := result.LastInsertId()
	userID := int(userID64)

	workspaceName := strings.TrimSpace(req.WorkspaceName)
	var workspaceID int
	if workspaceName != "" {
		slugBase := slugify(workspaceName)
		slug := slugBase
		for i := 1; i < 100; i++ {
			_, err = tx.Exec(
				"INSERT INTO workspaces (name, slug, created_by) VALUES (?, ?, ?)",
				workspaceName, slug, userID,
			)
			if err == nil {
				break
			}
			slug = fmt.Sprintf("%s-%d", slugBase, i+1)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create workspace"})
			return
		}

		err = tx.QueryRow("SELECT id FROM workspaces WHERE slug = ?", slug).Scan(&workspaceID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load workspace"})
			return
		}

		_, err = tx.Exec(
			"INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
			workspaceID, userID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add workspace member"})
			return
		}
	}

	if err := tx.Commit(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not complete registration"})
		return
	}

	if workspaceID > 0 {
		_ = EnsureWorkspaceGroupConversation(h.DB, workspaceID)
	}

	token, err := h.signToken(userID, req.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create token"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"token":    token,
		"username": req.Username,
	})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	identifier := strings.TrimSpace(req.Username)
	email := optionalEmail(identifier)

	var userID int
	var username, passwordHash string
	err := h.DB.QueryRow(
		"SELECT id, username, password FROM users WHERE username = ?",
		identifier,
	).Scan(&userID, &username, &passwordHash)
	if err == sql.ErrNoRows && email != "" {
		err = h.DB.QueryRow(
			"SELECT id, username, password FROM users WHERE email = ?",
			email,
		).Scan(&userID, &username, &passwordHash)
	}
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := h.signToken(userID, username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token":    token,
		"username": username,
	})
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	response, err := h.loadUserResponse(userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load profile"})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) signToken(userID int, username string) (string, error) {
	claims := middleware.Claims{
		UserID:   userID,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.Cfg.JWTSecret))
}
