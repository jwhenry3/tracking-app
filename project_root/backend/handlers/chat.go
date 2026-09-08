package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"fullstack-app/hub"

	"github.com/gin-gonic/gin"
)

type ChatHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
}

type conversationResponse struct {
	ID          int      `json:"id"`
	WorkspaceID int      `json:"workspace_id"`
	Kind        string   `json:"kind"`
	Title       string   `json:"title"`
	Members     []string `json:"members,omitempty"`
}

type messageResponse struct {
	ID             int    `json:"id"`
	ConversationID int    `json:"conversation_id"`
	SenderID       int    `json:"sender_id"`
	SenderUsername string `json:"sender_username"`
	Content        string `json:"content"`
	CreatedAt      string `json:"created_at"`
}

type sendMessageRequest struct {
	Content string `json:"content" binding:"required,min=1"`
}

type directConversationRequest struct {
	Username string `json:"username" binding:"required"`
}

func (h *ChatHandler) ListConversations(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	if err := EnsureWorkspaceGroupConversation(h.DB, workspaceID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not initialize workspace chat"})
		return
	}
	if err := AddUserToWorkspaceChats(h.DB, workspaceID.(int), userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not sync chat membership"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT c.id, c.workspace_id, c.kind
		FROM chat_conversations c
		INNER JOIN chat_conversation_members cm ON cm.conversation_id = c.id
		WHERE c.workspace_id = ? AND cm.user_id = ?
		ORDER BY c.kind ASC, c.id ASC`, workspaceID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load conversations"})
		return
	}
	defer rows.Close()

	conversations := []conversationResponse{}
	for rows.Next() {
		var conv conversationResponse
		if err := rows.Scan(&conv.ID, &conv.WorkspaceID, &conv.Kind); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read conversation"})
			return
		}
		conv.Title = conversationTitle(h.DB, conv)
		conv.Members = conversationMembernames(h.DB, conv.ID)
		conversations = append(conversations, conv)
	}

	c.JSON(http.StatusOK, gin.H{"conversations": conversations})
}

func (h *ChatHandler) ListMessages(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")
	conversationID, err := strconv.Atoi(c.Param("conversationId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	if !h.userInConversation(conversationID, workspaceID.(int), userID.(int)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "conversation access denied"})
		return
	}

	rows, err := h.DB.Query(`
		SELECT m.id, m.conversation_id, m.sender_id, u.username, m.content, m.created_at
		FROM chat_messages m
		INNER JOIN users u ON u.id = m.sender_id
		INNER JOIN chat_conversations c ON c.id = m.conversation_id
		WHERE m.conversation_id = ? AND c.workspace_id = ?
		ORDER BY m.created_at ASC, m.id ASC`, conversationID, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load messages"})
		return
	}
	defer rows.Close()

	messages := []messageResponse{}
	for rows.Next() {
		var msg messageResponse
		var createdAt time.Time
		if err := rows.Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.SenderUsername, &msg.Content, &createdAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read message"})
			return
		}
		msg.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		messages = append(messages, msg)
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

func (h *ChatHandler) SendMessage(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")
	conversationID, err := strconv.Atoi(c.Param("conversationId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid conversation id"})
		return
	}

	if !h.userInConversation(conversationID, workspaceID.(int), userID.(int)) {
		c.JSON(http.StatusForbidden, gin.H{"error": "conversation access denied"})
		return
	}

	var req sendMessageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.DB.Exec(
		`INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)`,
		conversationID, userID, req.Content,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not send message"})
		return
	}

	id64, _ := result.LastInsertId()
	msg, err := loadMessageByID(h.DB, int(id64))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load saved message"})
		return
	}

	raw, _ := json.Marshal(msg)
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type:    "update",
		Entity:  "message",
		Action:  "created",
		Payload: raw,
	})

	c.JSON(http.StatusCreated, msg)
}

func (h *ChatHandler) CreateDirectConversation(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req directConversationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var otherUserID int
	err := h.DB.QueryRow(`
		SELECT u.id FROM users u
		INNER JOIN workspace_members wm ON wm.user_id = u.id
		WHERE u.username = ? AND wm.workspace_id = ?`, req.Username, workspaceID,
	).Scan(&otherUserID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found in workspace"})
		return
	}

	conversationID, err := findDirectConversation(h.DB, workspaceID.(int), userID.(int), otherUserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load direct conversation"})
		return
	}
	if conversationID == 0 {
		conversationID, err = createDirectConversation(h.DB, workspaceID.(int), userID.(int), otherUserID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create direct conversation"})
			return
		}
	}

	conv := conversationResponse{
		ID: conversationID, WorkspaceID: workspaceID.(int), Kind: "direct",
	}
	conv.Title = conversationTitle(h.DB, conv)
	conv.Members = conversationMembernames(h.DB, conversationID)
	c.JSON(http.StatusOK, conv)
}

func (h *ChatHandler) userInConversation(conversationID, workspaceID, userID int) bool {
	var id int
	err := h.DB.QueryRow(`
		SELECT c.id
		FROM chat_conversations c
		INNER JOIN chat_conversation_members cm ON cm.conversation_id = c.id
		WHERE c.id = ? AND c.workspace_id = ? AND cm.user_id = ?`,
		conversationID, workspaceID, userID,
	).Scan(&id)
	return err == nil
}

func EnsureWorkspaceGroupConversation(db *sql.DB, workspaceID int) error {
	var conversationID int
	err := db.QueryRow(
		`SELECT id FROM chat_conversations WHERE workspace_id = ? AND kind = 'group' LIMIT 1`,
		workspaceID,
	).Scan(&conversationID)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return err
	}

	result, err := db.Exec(
		`INSERT INTO chat_conversations (workspace_id, kind) VALUES (?, 'group')`,
		workspaceID,
	)
	if err != nil {
		return err
	}
	id64, _ := result.LastInsertId()
	conversationID = int(id64)

	rows, err := db.Query(`SELECT user_id FROM workspace_members WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var memberID int
		if err := rows.Scan(&memberID); err != nil {
			return err
		}
		if _, err := db.Exec(
			`INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)`,
			conversationID, memberID,
		); err != nil {
			return err
		}
	}
	return nil
}

func AddUserToWorkspaceChats(db *sql.DB, workspaceID, userID int) error {
	if err := EnsureWorkspaceGroupConversation(db, workspaceID); err != nil {
		return err
	}

	var groupID int
	if err := db.QueryRow(
		`SELECT id FROM chat_conversations WHERE workspace_id = ? AND kind = 'group' LIMIT 1`,
		workspaceID,
	).Scan(&groupID); err != nil {
		return err
	}

	if _, err := db.Exec(
		`INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)`,
		groupID, userID,
	); err != nil {
		return err
	}
	return nil
}

func findDirectConversation(db *sql.DB, workspaceID, userA, userB int) (int, error) {
	if userA == userB {
		var conversationID int
		err := db.QueryRow(`
			SELECT c.id
			FROM chat_conversations c
			INNER JOIN chat_conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = ?
			WHERE c.workspace_id = ? AND c.kind = 'direct'
			GROUP BY c.id
			HAVING COUNT(cm.user_id) = 1
			LIMIT 1`, userA, workspaceID,
		).Scan(&conversationID)
		if err == sql.ErrNoRows {
			return 0, nil
		}
		return conversationID, err
	}

	var conversationID int
	err := db.QueryRow(`
		SELECT c.id
		FROM chat_conversations c
		INNER JOIN chat_conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
		INNER JOIN chat_conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
		WHERE c.workspace_id = ? AND c.kind = 'direct'
		GROUP BY c.id
		HAVING COUNT(DISTINCT m1.user_id) = 2
		LIMIT 1`, userA, userB, workspaceID,
	).Scan(&conversationID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return conversationID, err
}

func loadMessageByID(db *sql.DB, messageID int) (messageResponse, error) {
	var msg messageResponse
	var createdAt time.Time
	err := db.QueryRow(`
		SELECT m.id, m.conversation_id, m.sender_id, u.username, m.content, m.created_at
		FROM chat_messages m
		INNER JOIN users u ON u.id = m.sender_id
		WHERE m.id = ?`, messageID,
	).Scan(&msg.ID, &msg.ConversationID, &msg.SenderID, &msg.SenderUsername, &msg.Content, &createdAt)
	if err != nil {
		return messageResponse{}, err
	}
	msg.CreatedAt = createdAt.UTC().Format(time.RFC3339)
	return msg, nil
}

func createDirectConversation(db *sql.DB, workspaceID, userA, userB int) (int, error) {
	result, err := db.Exec(
		`INSERT INTO chat_conversations (workspace_id, kind) VALUES (?, 'direct')`,
		workspaceID,
	)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	conversationID := int(id64)

	memberIDs := []int{userA, userB}
	if userA == userB {
		memberIDs = []int{userA}
	}

	for _, memberID := range memberIDs {
		if _, err := db.Exec(
			`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)`,
			conversationID, memberID,
		); err != nil {
			return 0, err
		}
	}
	return conversationID, nil
}

func conversationTitle(db *sql.DB, conv conversationResponse) string {
	if conv.Kind == "group" {
		var name string
		_ = db.QueryRow(`SELECT name FROM workspaces WHERE id = ?`, conv.WorkspaceID).Scan(&name)
		if name == "" {
			return "Group chat"
		}
		return name + " chat"
	}

	members := conversationMembernames(db, conv.ID)
	if len(members) == 1 {
		return members[0] + " (you)"
	}
	if len(members) == 2 {
		return members[0] + ", " + members[1]
	}
	if len(members) > 0 {
		return members[0]
	}
	return "Direct message"
}

func conversationMembernames(db *sql.DB, conversationID int) []string {
	rows, err := db.Query(`
		SELECT u.username
		FROM chat_conversation_members cm
		INNER JOIN users u ON u.id = cm.user_id
		WHERE cm.conversation_id = ?
		ORDER BY u.username ASC`, conversationID)
	if err != nil {
		return nil
	}
	defer rows.Close()

	names := []string{}
	for rows.Next() {
		var username string
		if err := rows.Scan(&username); err != nil {
			return names
		}
		names = append(names, username)
	}
	return names
}
