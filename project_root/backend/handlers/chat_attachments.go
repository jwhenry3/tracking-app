package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	maxChatAttachmentSize = 10 << 20
	maxChatAttachments    = 8
	maxChatUploadBody     = 85 << 20
)

var allowedChatAttachmentExt = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true,
	".heic": true, ".heif": true, ".pdf": true, ".txt": true, ".md": true,
	".csv": true, ".json": true, ".zip": true, ".doc": true, ".docx": true,
	".xls": true, ".xlsx": true, ".ppt": true, ".pptx": true, ".odt": true,
	".ods": true, ".mp3": true, ".wav": true, ".m4a": true, ".mp4": true,
	".webm": true, ".mov": true,
}

func (h *ChatHandler) uploadRoot() string {
	if strings.TrimSpace(h.UploadDir) != "" {
		return h.UploadDir
	}
	return "uploads"
}

func parseSendMessage(c *gin.Context) (string, []*multipart.FileHeader, error) {
	contentType := c.ContentType()
	if strings.HasPrefix(contentType, "multipart/form-data") {
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxChatUploadBody)
		form, err := c.MultipartForm()
		if err != nil {
			return "", nil, errors.New("could not read attachments")
		}
		content := strings.TrimSpace(c.PostForm("content"))
		files := form.File["files"]
		if len(files) > maxChatAttachments {
			return "", nil, fmt.Errorf("at most %d attachments are allowed", maxChatAttachments)
		}
		return content, files, nil
	}

	var req sendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return "", nil, err
	}
	return strings.TrimSpace(req.Content), nil, nil
}

func (h *ChatHandler) storeAttachments(tx *sql.Tx, messageID, workspaceID int, files []*multipart.FileHeader) ([]string, error) {
	if len(files) == 0 {
		return nil, nil
	}

	dir := filepath.Join(h.uploadRoot(), "chat", strconv.Itoa(workspaceID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, errors.New("could not store attachment")
	}

	written := make([]string, 0, len(files))
	for _, header := range files {
		path, err := h.saveAttachment(tx, messageID, workspaceID, dir, header)
		if err != nil {
			return written, err
		}
		written = append(written, path)
	}
	return written, nil
}

func (h *ChatHandler) saveAttachment(tx *sql.Tx, messageID, workspaceID int, dir string, header *multipart.FileHeader) (string, error) {
	if header.Size > maxChatAttachmentSize {
		return "", fmt.Errorf("%s is larger than 10MB", displayName(header.Filename))
	}

	src, err := header.Open()
	if err != nil {
		return "", errors.New("could not read attachment")
	}
	defer src.Close()

	data, err := io.ReadAll(io.LimitReader(src, maxChatAttachmentSize+1))
	if err != nil {
		return "", errors.New("could not read attachment")
	}
	if len(data) == 0 {
		return "", fmt.Errorf("%s is empty", displayName(header.Filename))
	}
	if len(data) > maxChatAttachmentSize {
		return "", fmt.Errorf("%s is larger than 10MB", displayName(header.Filename))
	}

	originalName := displayName(header.Filename)
	mimeType := detectAttachmentMIME(header.Header.Get("Content-Type"), data)
	if !isAllowedChatAttachment(originalName, mimeType) {
		return "", fmt.Errorf("%s is not an allowed file type", originalName)
	}

	id, err := randomAttachmentID()
	if err != nil {
		return "", errors.New("could not store attachment")
	}
	ext := strings.ToLower(filepath.Ext(originalName))
	storedName := filepath.ToSlash(filepath.Join("chat", strconv.Itoa(workspaceID), id+ext))
	fullPath := filepath.Join(dir, id+ext)

	if err := os.WriteFile(fullPath, data, 0o644); err != nil {
		return "", errors.New("could not store attachment")
	}

	if _, err := tx.Exec(
		`INSERT INTO chat_attachments (message_id, original_name, stored_name, mime_type, size_bytes) VALUES (?, ?, ?, ?, ?)`,
		messageID, originalName, storedName, mimeType, int64(len(data)),
	); err != nil {
		_ = os.Remove(fullPath)
		return "", errors.New("could not store attachment")
	}

	return fullPath, nil
}

func (h *ChatHandler) GetAttachment(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")
	attachmentID, err := strconv.Atoi(c.Param("attachmentId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid attachment id"})
		return
	}

	var storedName, originalName, mimeType string
	var conversationID int
	err = h.DB.QueryRow(`
		SELECT a.stored_name, a.original_name, a.mime_type, c.id
		FROM chat_attachments a
		INNER JOIN chat_messages m ON m.id = a.message_id
		INNER JOIN chat_conversations c ON c.id = m.conversation_id
		WHERE a.id = ? AND c.workspace_id = ?`, attachmentID, workspaceID,
	).Scan(&storedName, &originalName, &mimeType, &conversationID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}

	if !h.userInConversation(conversationID, workspaceID.(int), userID.(int)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "conversation access denied"})
		return
	}

	fullPath := filepath.Join(h.uploadRoot(), filepath.FromSlash(storedName))
	root, err := filepath.Abs(h.uploadRoot())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load attachment"})
		return
	}
	absPath, err := filepath.Abs(fullPath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}
	rel, err := filepath.Rel(root, absPath)
	if err != nil || rel == "." || strings.HasPrefix(rel, "..") {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}

	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Type", mimeType)
	if strings.HasPrefix(mimeType, "image/") {
		c.Header("Content-Disposition", contentDisposition("inline", originalName))
	} else {
		c.Header("Content-Disposition", contentDisposition("attachment", originalName))
	}
	c.File(absPath)
}

func attachMessageAttachments(db *sql.DB, messages []messageResponse) error {
	if len(messages) == 0 {
		return nil
	}

	ids := make([]any, len(messages))
	placeholders := make([]string, len(messages))
	indexByID := make(map[int]int, len(messages))
	for i := range messages {
		ids[i] = messages[i].ID
		placeholders[i] = "?"
		indexByID[messages[i].ID] = i
		if messages[i].Attachments == nil {
			messages[i].Attachments = []attachmentResponse{}
		}
	}

	query := fmt.Sprintf(
		`SELECT id, message_id, original_name, mime_type, size_bytes
		 FROM chat_attachments
		 WHERE message_id IN (%s)
		 ORDER BY id ASC`,
		strings.Join(placeholders, ","),
	)
	rows, err := db.Query(query, ids...)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var attachment attachmentResponse
		if err := rows.Scan(&attachment.ID, &attachment.MessageID, &attachment.OriginalName, &attachment.MimeType, &attachment.SizeBytes); err != nil {
			return err
		}
		index, ok := indexByID[attachment.MessageID]
		if !ok {
			continue
		}
		messages[index].Attachments = append(messages[index].Attachments, attachment)
	}
	return rows.Err()
}

func removeFiles(paths []string) {
	for _, path := range paths {
		_ = os.Remove(path)
	}
}

func detectAttachmentMIME(declared string, data []byte) string {
	detected := http.DetectContentType(data)
	if detected != "" && detected != "application/octet-stream" {
		return detected
	}
	declared = strings.TrimSpace(strings.Split(declared, ";")[0])
	if declared != "" {
		return declared
	}
	if detected != "" {
		return detected
	}
	return "application/octet-stream"
}

func isAllowedChatAttachment(filename, mimeType string) bool {
	ext := strings.ToLower(filepath.Ext(filename))
	if allowedChatAttachmentExt[ext] {
		return mimeType != "image/svg+xml"
	}
	if strings.HasPrefix(mimeType, "image/") && mimeType != "image/svg+xml" {
		return true
	}
	if strings.HasPrefix(mimeType, "text/") {
		return true
	}
	switch mimeType {
	case "application/pdf", "application/zip", "application/x-zip-compressed",
		"application/json", "application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		return true
	}
	return false
}

func displayName(name string) string {
	cleaned := strings.TrimSpace(filepath.Base(strings.ReplaceAll(name, "\\", "/")))
	cleaned = strings.Trim(cleaned, ".")
	if cleaned == "" || cleaned == "." || cleaned == string(filepath.Separator) {
		return "attachment"
	}
	if len(cleaned) > 180 {
		ext := filepath.Ext(cleaned)
		cleaned = cleaned[:180-len(ext)] + ext
	}
	return cleaned
}

func randomAttachmentID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func contentDisposition(disposition, filename string) string {
	ascii := strings.Map(func(r rune) rune {
		if r < 32 || r > 126 || r == '"' {
			return '_'
		}
		return r
	}, filename)
	if ascii == "" {
		ascii = "attachment"
	}
	return fmt.Sprintf(`%s; filename="%s"`, disposition, ascii)
}
