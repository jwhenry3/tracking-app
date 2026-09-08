package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"fullstack-app/config"
	"fullstack-app/hub"
	"fullstack-app/middleware"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
)

type WSHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
	Cfg *config.Config
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func (h *WSHandler) Serve(c *gin.Context) {
	token := c.Query("token")
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token is required"})
		return
	}

	claims := &middleware.Claims{}
	parsed, err := jwt.ParseWithClaims(token, claims, func(token *jwt.Token) (interface{}, error) {
		return []byte(h.Cfg.JWTSecret), nil
	})
	if err != nil || !parsed.Valid {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
		return
	}

	workspaceIDs, err := loadUserWorkspaceIDs(h.DB, claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load workspace memberships"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := &hub.Client{
		Hub:          h.Hub,
		Conn:         conn,
		Send:         make(chan []byte, 256),
		UserID:       claims.UserID,
		Username:     claims.Username,
		WorkspaceIDs: hub.WorkspaceIDSet(workspaceIDs),
	}

	go client.WritePump()
	go client.ReadPump()
	h.Hub.Register(client)

	welcome, _ := json.Marshal(hub.Message{
		Type:      "connected",
		Username:  claims.Username,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
	client.Send <- welcome
}

func loadUserWorkspaceIDs(db *sql.DB, userID int) ([]int, error) {
	rows, err := db.Query(`SELECT workspace_id FROM workspace_members WHERE user_id = ?`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var workspaceIDs []int
	for rows.Next() {
		var workspaceID int
		if err := rows.Scan(&workspaceID); err != nil {
			return nil, err
		}
		workspaceIDs = append(workspaceIDs, workspaceID)
	}

	return workspaceIDs, rows.Err()
}
