package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"fullstack-app/hub"

	"github.com/gin-gonic/gin"
)

type WorkspaceHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
}

type workspaceResponse struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
	Role string `json:"role"`
}

type createWorkspaceRequest struct {
	Name string `json:"name" binding:"required,min=2,max=100"`
}

type addMemberRequest struct {
	Username string `json:"username" binding:"required"`
}

func (h *WorkspaceHandler) List(c *gin.Context) {
	userID, _ := c.Get("userID")

	rows, err := h.DB.Query(`
		SELECT w.id, w.name, w.slug, wm.role
		FROM workspaces w
		INNER JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = ?
		ORDER BY w.name ASC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load workspaces"})
		return
	}
	defer rows.Close()

	workspaces := []workspaceResponse{}
	for rows.Next() {
		var ws workspaceResponse
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.Role); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read workspace"})
			return
		}
		workspaces = append(workspaces, ws)
	}

	c.JSON(http.StatusOK, gin.H{"workspaces": workspaces})
}

func (h *WorkspaceHandler) Create(c *gin.Context) {
	userID, _ := c.Get("userID")

	var req createWorkspaceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	slugBase := slugifyWorkspace(req.Name)
	slug := slugBase
	var workspaceID int

	for i := 1; i < 100; i++ {
		result, err := h.DB.Exec(
			"INSERT INTO workspaces (name, slug, created_by) VALUES (?, ?, ?)",
			req.Name, slug, userID,
		)
		if err != nil {
			slug = fmt.Sprintf("%s-%d", slugBase, i+1)
			continue
		}

		id64, _ := result.LastInsertId()
		workspaceID = int(id64)
		break
	}

	if workspaceID == 0 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create workspace"})
		return
	}

	_, err := h.DB.Exec(
		"INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
		workspaceID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add workspace owner"})
		return
	}

	c.JSON(http.StatusCreated, workspaceResponse{
		ID: workspaceID, Name: req.Name, Slug: slug, Role: "owner",
	})
}

func (h *WorkspaceHandler) Get(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	role, _ := c.Get("workspaceRole")

	var name, slug string
	err := h.DB.QueryRow(
		"SELECT name, slug FROM workspaces WHERE id = ?",
		workspaceID,
	).Scan(&name, &slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}

	c.JSON(http.StatusOK, workspaceResponse{
		ID: workspaceID.(int), Name: name, Slug: slug, Role: role.(string),
	})
}

func (h *WorkspaceHandler) AddMember(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")

	var req addMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var memberID int
	err := h.DB.QueryRow("SELECT id FROM users WHERE username = ?", req.Username).Scan(&memberID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	_, err = h.DB.Exec(
		"INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')",
		workspaceID, memberID,
	)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user is already in this workspace"})
		return
	}

	raw, _ := json.Marshal(gin.H{"username": req.Username})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type:    "update",
		Entity:  "member",
		Action:  "joined",
		Payload: raw,
	})

	c.JSON(http.StatusCreated, gin.H{"message": "member added"})
}

func slugifyWorkspace(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	re := regexp.MustCompile(`[^a-z0-9]+`)
	slug = re.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "workspace"
	}
	return slug
}
