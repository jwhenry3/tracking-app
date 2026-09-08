package handlers

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
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
	workspaceID, err := strconv.Atoi(c.Query("workspace_id"))
	if token == "" || err != nil || workspaceID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "token and workspace_id are required"})
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

	var memberRole string
	err = h.DB.QueryRow(
		`SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
		workspaceID, claims.UserID,
	).Scan(&memberRole)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "workspace access denied"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}

	client := &hub.Client{
		Hub:         h.Hub,
		Conn:        conn,
		Send:        make(chan []byte, 256),
		Username:    claims.Username,
		WorkspaceID: workspaceID,
	}

	go client.WritePump()
	go client.ReadPump()
	h.Hub.Register(client)

	welcome, _ := json.Marshal(hub.Message{
		Type:        "connected",
		WorkspaceID: workspaceID,
		Username:    claims.Username,
		Timestamp:   time.Now().UTC().Format(time.RFC3339),
	})
	client.Send <- welcome
}
