package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"fullstack-app/hub"

	"github.com/gin-gonic/gin"
)

const maxAvatarSize = 2 << 20

var allowedAvatarExt = map[string]string{
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".png":  "image/png",
	".gif":  "image/gif",
	".webp": "image/webp",
}

type updateProfileSettingsRequest struct {
	Username    *string         `json:"username"`
	Email       *string         `json:"email"`
	DisplayName *string         `json:"display_name"`
	Settings    json.RawMessage `json:"settings"`
}

func (h *AuthHandler) loadUserResponse(userID int) (gin.H, error) {
	var username string
	var email sql.NullString
	var displayName sql.NullString
	var avatarPath sql.NullString
	var settingsJSON sql.NullString

	err := h.DB.QueryRow(
		"SELECT username, email, display_name, avatar_path, settings FROM users WHERE id = ?",
		userID,
	).Scan(&username, &email, &displayName, &avatarPath, &settingsJSON)
	if err != nil {
		return nil, err
	}

	settings := map[string]any{}
	if settingsJSON.Valid && strings.TrimSpace(settingsJSON.String) != "" {
		if err := json.Unmarshal([]byte(settingsJSON.String), &settings); err != nil {
			settings = map[string]any{}
		}
	}

	response := gin.H{
		"id":       userID,
		"username": username,
		"settings": settings,
	}
	if email.Valid && strings.TrimSpace(email.String) != "" {
		response["email"] = email.String
	} else {
		response["email"] = nil
	}
	if displayName.Valid && strings.TrimSpace(displayName.String) != "" {
		response["display_name"] = displayName.String
	} else {
		response["display_name"] = nil
	}
	if avatarPath.Valid && strings.TrimSpace(avatarPath.String) != "" {
		response["avatar_url"] = "/api/me/avatar"
	} else {
		response["avatar_url"] = nil
	}

	return response, nil
}

func (h *AuthHandler) UpdateProfileSettings(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var req updateProfileSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var previousUsername string
	var previousDisplayName sql.NullString
	if err := h.DB.QueryRow(
		"SELECT username, display_name FROM users WHERE id = ?",
		userID,
	).Scan(&previousUsername, &previousDisplayName); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
		return
	}

	usernameChanged := false
	displayNameChanged := false

	if req.Username != nil {
		newUsername := strings.TrimSpace(*req.Username)
		if len(newUsername) < 3 || len(newUsername) > 50 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "username must be between 3 and 50 characters"})
			return
		}

		var currentUsername string
		if err := h.DB.QueryRow("SELECT username FROM users WHERE id = ?", userID).Scan(&currentUsername); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
			return
		}

		if newUsername != currentUsername {
			_, err := h.DB.Exec("UPDATE users SET username = ? WHERE id = ?", newUsername, userID)
			if err != nil {
				if message := duplicateConstraintError(err); message != "" {
					c.JSON(http.StatusConflict, gin.H{"error": message})
					return
				}
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
				return
			}
			usernameChanged = true
		}
	}

	if req.Email != nil {
		email, err := normalizeEmail(*req.Email)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var execErr error
		if email == "" {
			_, execErr = h.DB.Exec("UPDATE users SET email = NULL WHERE id = ?", userID)
		} else {
			_, execErr = h.DB.Exec("UPDATE users SET email = ? WHERE id = ?", email, userID)
		}
		if execErr != nil {
			if message := duplicateConstraintError(execErr); message != "" {
				c.JSON(http.StatusConflict, gin.H{"error": message})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
			return
		}
	}

	if req.DisplayName != nil {
		trimmed := strings.TrimSpace(*req.DisplayName)
		previousValue := ""
		if previousDisplayName.Valid {
			previousValue = strings.TrimSpace(previousDisplayName.String)
		}
		if trimmed == "" {
			_, err := h.DB.Exec("UPDATE users SET display_name = NULL WHERE id = ?", userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
				return
			}
			displayNameChanged = previousValue != ""
		} else if len(trimmed) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "display name must be 100 characters or fewer"})
			return
		} else {
			_, err := h.DB.Exec("UPDATE users SET display_name = ? WHERE id = ?", trimmed, userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
				return
			}
			displayNameChanged = trimmed != previousValue
		}
	}

	if req.Settings != nil {
		if len(req.Settings) == 0 || string(req.Settings) == "null" {
			_, err := h.DB.Exec("UPDATE users SET settings = NULL WHERE id = ?", userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
				return
			}
		} else {
			var settings map[string]any
			if err := json.Unmarshal(req.Settings, &settings); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid settings payload"})
				return
			}
			encoded, err := json.Marshal(settings)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
				return
			}
			_, err = h.DB.Exec("UPDATE users SET settings = ? WHERE id = ?", string(encoded), userID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update profile"})
				return
			}
		}
	}

	response, err := h.loadUserResponse(userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load profile"})
		return
	}

	if usernameChanged {
		username, _ := response["username"].(string)
		token, err := h.signToken(userID.(int), username)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not refresh session"})
			return
		}
		response["token"] = token
	}

	if displayNameChanged || usernameChanged {
		h.broadcastUserProfileUpdate(userID.(int), response, previousUsername)
	}

	c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) broadcastUserProfileUpdate(userID int, profile gin.H, previousUsername string) {
	if h.Hub == nil {
		return
	}

	username, _ := profile["username"].(string)
	var displayName any
	if value, ok := profile["display_name"]; ok {
		displayName = value
	} else {
		displayName = nil
	}

	payloadData := gin.H{
		"user_id":      userID,
		"username":     username,
		"display_name": displayName,
	}
	if previousUsername != "" && previousUsername != username {
		payloadData["previous_username"] = previousUsername
	}

	payload, err := json.Marshal(payloadData)
	if err != nil {
		return
	}

	rows, err := h.DB.Query(`SELECT workspace_id FROM workspace_members WHERE user_id = ?`, userID)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var workspaceID int
		if err := rows.Scan(&workspaceID); err != nil {
			continue
		}
		h.Hub.BroadcastWorkspace(workspaceID, hub.Message{
			Type:    "update",
			Entity:  "user_profile",
			Action:  "updated",
			Payload: payload,
		})
	}
}

func (h *AuthHandler) UploadAvatar(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxAvatarSize+1024)
	file, header, err := c.Request.FormFile("avatar")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "could not read avatar upload"})
		return
	}
	defer file.Close()

	if header.Size > maxAvatarSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": "avatar must be 2 MB or smaller"})
		return
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if _, ok := allowedAvatarExt[ext]; !ok {
		c.JSON(http.StatusBadRequest, gin.H{"error": "avatar must be a JPG, PNG, GIF, or WebP image"})
		return
	}

	uploadRoot := h.Cfg.UploadDir
	if strings.TrimSpace(uploadRoot) == "" {
		uploadRoot = "uploads"
	}

	dir := filepath.Join(uploadRoot, "avatars", strconv.Itoa(userID.(int)))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not store avatar"})
		return
	}

	var oldPath sql.NullString
	_ = h.DB.QueryRow("SELECT avatar_path FROM users WHERE id = ?", userID).Scan(&oldPath)

	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not store avatar"})
		return
	}

	storedName := hex.EncodeToString(random) + ext
	storedPath := filepath.Join(dir, storedName)

	out, err := os.Create(storedPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not store avatar"})
		return
	}

	written, err := io.Copy(out, file)
	out.Close()
	if err != nil || written == 0 {
		_ = os.Remove(storedPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not store avatar"})
		return
	}

	relativePath := filepath.ToSlash(filepath.Join("avatars", strconv.Itoa(userID.(int)), storedName))
	_, err = h.DB.Exec("UPDATE users SET avatar_path = ? WHERE id = ?", relativePath, userID)
	if err != nil {
		_ = os.Remove(storedPath)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not store avatar"})
		return
	}

	if oldPath.Valid && strings.TrimSpace(oldPath.String) != "" {
		_ = os.Remove(filepath.Join(uploadRoot, filepath.FromSlash(oldPath.String)))
	}

	response, err := h.loadUserResponse(userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load profile"})
		return
	}

	c.JSON(http.StatusOK, response)
}

func (h *AuthHandler) GetAvatar(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var avatarPath sql.NullString
	err := h.DB.QueryRow("SELECT avatar_path FROM users WHERE id = ?", userID).Scan(&avatarPath)
	if err != nil || !avatarPath.Valid || strings.TrimSpace(avatarPath.String) == "" {
		c.JSON(http.StatusNotFound, gin.H{"error": "avatar not found"})
		return
	}

	uploadRoot := h.Cfg.UploadDir
	if strings.TrimSpace(uploadRoot) == "" {
		uploadRoot = "uploads"
	}

	fullPath := filepath.Join(uploadRoot, filepath.FromSlash(avatarPath.String))
	if _, err := os.Stat(fullPath); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "avatar not found"})
		return
	}

	ext := strings.ToLower(filepath.Ext(fullPath))
	mimeType, ok := allowedAvatarExt[ext]
	if !ok {
		mimeType = "application/octet-stream"
	}

	c.Header("Content-Type", mimeType)
	c.File(fullPath)
}

func (h *AuthHandler) DeleteAvatar(c *gin.Context) {
	userID, ok := c.Get("userID")
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var avatarPath sql.NullString
	err := h.DB.QueryRow("SELECT avatar_path FROM users WHERE id = ?", userID).Scan(&avatarPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not remove avatar"})
		return
	}

	_, err = h.DB.Exec("UPDATE users SET avatar_path = NULL WHERE id = ?", userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not remove avatar"})
		return
	}

	if avatarPath.Valid && strings.TrimSpace(avatarPath.String) != "" {
		uploadRoot := h.Cfg.UploadDir
		if strings.TrimSpace(uploadRoot) == "" {
			uploadRoot = "uploads"
		}
		_ = os.Remove(filepath.Join(uploadRoot, filepath.FromSlash(avatarPath.String)))
	}

	response, err := h.loadUserResponse(userID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load profile"})
		return
	}

	c.JSON(http.StatusOK, response)
}
