package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"fullstack-app/hub"
	"fullstack-app/middleware"

	"github.com/gin-gonic/gin"
)

type WorkspaceHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
}

type workspaceResponse struct {
	ID          int      `json:"id"`
	Name        string   `json:"name"`
	Slug        string   `json:"slug"`
	Role        string   `json:"role"`
	FocusAreas  []string `json:"focus_areas"`
	ManageAreas []string `json:"manage_areas"`
}

type createWorkspaceRequest struct {
	Name       string   `json:"name" binding:"required,min=2,max=100"`
	Message    string   `json:"message"`
	FocusAreas []string `json:"focus_areas"`
}

type updateWorkspaceSettingsRequest struct {
	Name       string   `json:"name" binding:"required,min=2,max=100"`
	FocusAreas []string `json:"focus_areas"`
}

var defaultFocusAreas = []string{"planning", "finances"}

var validFocusAreas = map[string]bool{
	"planning": true,
	"finances": true,
}

func parseFocusAreas(raw sql.NullString) []string {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return append([]string(nil), defaultFocusAreas...)
	}

	var areas []string
	if err := json.Unmarshal([]byte(raw.String), &areas); err != nil {
		return append([]string(nil), defaultFocusAreas...)
	}

	normalized := make([]string, 0, len(areas))
	seen := map[string]bool{}
	for _, area := range areas {
		area = strings.ToLower(strings.TrimSpace(area))
		if !validFocusAreas[area] || seen[area] {
			continue
		}
		seen[area] = true
		normalized = append(normalized, area)
	}

	return normalized
}

func normalizeFocusAreasInput(areas []string) []string {
	normalized := make([]string, 0, len(areas))
	seen := map[string]bool{}
	for _, area := range areas {
		area = strings.ToLower(strings.TrimSpace(area))
		if !validFocusAreas[area] || seen[area] {
			continue
		}
		seen[area] = true
		normalized = append(normalized, area)
	}
	return normalized
}

func focusAreasJSON(areas []string) (string, error) {
	raw, err := json.Marshal(areas)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

type updateMemberRequest struct {
	ManageAreas []string `json:"manage_areas"`
}

func parseManageAreas(raw sql.NullString) []string {
	return middleware.ParseManageAreas(raw)
}

func intersectManageAreas(stored, focus []string) []string {
	allowed := map[string]bool{}
	for _, area := range focus {
		allowed[area] = true
	}
	next := make([]string, 0, len(stored))
	seen := map[string]bool{}
	for _, area := range stored {
		if !allowed[area] || seen[area] {
			continue
		}
		seen[area] = true
		next = append(next, area)
	}
	return next
}

func effectiveManageAreas(role string, stored, focus []string) []string {
	if role == middleware.RoleOwner {
		return append([]string(nil), focus...)
	}
	return intersectManageAreas(stored, focus)
}

func (h *WorkspaceHandler) loadWorkspaceResponse(workspaceID int, role string, storedManage []string) (workspaceResponse, error) {
	var ws workspaceResponse
	var focusRaw sql.NullString
	err := h.DB.QueryRow(
		`SELECT id, name, slug, focus_areas FROM workspaces WHERE id = ?`,
		workspaceID,
	).Scan(&ws.ID, &ws.Name, &ws.Slug, &focusRaw)
	if err != nil {
		return workspaceResponse{}, err
	}
	ws.Role = role
	ws.FocusAreas = parseFocusAreas(focusRaw)
	ws.ManageAreas = effectiveManageAreas(role, storedManage, ws.FocusAreas)
	return ws, nil
}

func (h *WorkspaceHandler) pruneMemberManageAreas(workspaceID int, focusAreas []string) error {
	rows, err := h.DB.Query(
		`SELECT user_id, manage_areas FROM workspace_members WHERE workspace_id = ? AND role = 'member'`,
		workspaceID,
	)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var userID int
		var manageRaw sql.NullString
		if err := rows.Scan(&userID, &manageRaw); err != nil {
			return err
		}

		pruned := intersectManageAreas(parseManageAreas(manageRaw), focusAreas)
		value, err := json.Marshal(pruned)
		if err != nil {
			return err
		}

		if _, err := h.DB.Exec(
			`UPDATE workspace_members SET manage_areas = ? WHERE workspace_id = ? AND user_id = ?`,
			string(value), workspaceID, userID,
		); err != nil {
			return err
		}
	}

	return rows.Err()
}

type addMemberRequest struct {
	Username string `json:"username" binding:"required"`
}

type inviteRequest struct {
	Username string `json:"username" binding:"required"`
}

type reviewAccessRequest struct {
	Action string `json:"action" binding:"required"`
}

type memberResponse struct {
	UserID      int      `json:"user_id"`
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name"`
	Role        string   `json:"role"`
	ManageAreas []string `json:"manage_areas"`
	JoinedAt    string   `json:"joined_at"`
}

type accessRequestResponse struct {
	ID            int    `json:"id"`
	WorkspaceID   int    `json:"workspace_id"`
	WorkspaceName string `json:"workspace_name"`
	UserID        int    `json:"user_id"`
	Username      string `json:"username"`
	Message       string `json:"message"`
	Status        string `json:"status"`
	CreatedAt     string `json:"created_at"`
}

type inviteResponse struct {
	ID            int    `json:"id"`
	WorkspaceID   int    `json:"workspace_id"`
	WorkspaceName string `json:"workspace_name"`
	InvitedBy     string `json:"invited_by"`
	Status        string `json:"status"`
	CreatedAt     string `json:"created_at"`
}

func (h *WorkspaceHandler) List(c *gin.Context) {
	userID, _ := c.Get("userID")

	rows, err := h.DB.Query(`
		SELECT w.id, w.name, w.slug, wm.role, w.focus_areas, wm.manage_areas
		FROM workspaces w
		INNER JOIN workspace_members wm ON wm.workspace_id = w.id
		WHERE wm.user_id = ? AND w.archived_at IS NULL
		ORDER BY w.name ASC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load workspaces"})
		return
	}
	defer rows.Close()

	workspaces := []workspaceResponse{}
	for rows.Next() {
		var ws workspaceResponse
		var focusRaw sql.NullString
		var manageRaw sql.NullString
		if err := rows.Scan(&ws.ID, &ws.Name, &ws.Slug, &ws.Role, &focusRaw, &manageRaw); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read workspace"})
			return
		}
		ws.FocusAreas = parseFocusAreas(focusRaw)
		ws.ManageAreas = effectiveManageAreas(ws.Role, parseManageAreas(manageRaw), ws.FocusAreas)
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

	var existingID int
	var existingName, existingSlug string
	err := h.DB.QueryRow(
		`SELECT id, name, slug FROM workspaces WHERE (slug = ? OR LOWER(name) = LOWER(?)) AND archived_at IS NULL LIMIT 1`,
		slugBase, strings.TrimSpace(req.Name),
	).Scan(&existingID, &existingName, &existingSlug)

	if err == nil {
		var memberRole string
		var manageRaw sql.NullString
		memberErr := h.DB.QueryRow(
			`SELECT role, manage_areas FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
			existingID, userID,
		).Scan(&memberRole, &manageRaw)
		if memberErr == nil {
			ws, wsErr := h.loadWorkspaceResponse(existingID, memberRole, parseManageAreas(manageRaw))
			if wsErr != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load workspace"})
				return
			}
			c.JSON(http.StatusOK, gin.H{
				"status":    "already_member",
				"workspace": ws,
			})
			return
		}

		_, err = h.DB.Exec(`
			INSERT INTO workspace_access_requests (workspace_id, user_id, message, status)
			VALUES (?, ?, ?, 'pending')
			ON DUPLICATE KEY UPDATE message = VALUES(message), status = 'pending', reviewed_by = NULL, reviewed_at = NULL`,
			existingID, userID, req.Message,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not request workspace access"})
			return
		}

		raw, _ := json.Marshal(gin.H{"workspace_id": existingID, "username": c.GetString("username")})
		h.Hub.BroadcastWorkspace(existingID, hub.Message{
			Type: "update", Entity: "access_request", Action: "created", Payload: raw,
		})

		c.JSON(http.StatusAccepted, gin.H{
			"status": "access_requested",
			"workspace": workspaceResponse{
				ID: existingID, Name: existingName, Slug: existingSlug, FocusAreas: defaultFocusAreas, ManageAreas: []string{},
			},
		})
		return
	}
	if err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not check workspace"})
		return
	}

	slug := slugBase
	var workspaceID int
	focusAreas := normalizeFocusAreasInput(req.FocusAreas)
	if len(focusAreas) == 0 {
		focusAreas = append([]string(nil), defaultFocusAreas...)
	}
	focusAreasValue, err := focusAreasJSON(focusAreas)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not encode workspace focus areas"})
		return
	}

	for i := 1; i < 100; i++ {
		result, insertErr := h.DB.Exec(
			"INSERT INTO workspaces (name, slug, created_by, focus_areas) VALUES (?, ?, ?, ?)",
			req.Name, slug, userID, focusAreasValue,
		)
		if insertErr != nil {
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

	_, err = h.DB.Exec(
		"INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')",
		workspaceID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add workspace owner"})
		return
	}

	if err := EnsureWorkspaceGroupConversation(h.DB, workspaceID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not initialize workspace chat"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"status": "created",
		"workspace": workspaceResponse{
			ID: workspaceID, Name: req.Name, Slug: slug, Role: "owner", FocusAreas: focusAreas, ManageAreas: focusAreas,
		},
	})
}

func (h *WorkspaceHandler) Get(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	role, _ := c.Get("workspaceRole")

	ws, err := h.loadWorkspaceResponse(workspaceID.(int), role.(string), middleware.ManageAreas(c))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}

	c.JSON(http.StatusOK, ws)
}

func (h *WorkspaceHandler) UpdateSettings(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	role, _ := c.Get("workspaceRole")

	if !middleware.RequireOwner(c) {
		return
	}

	var req updateWorkspaceSettingsRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	focusAreas := normalizeFocusAreasInput(req.FocusAreas)
	focusAreasValue, err := focusAreasJSON(focusAreas)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not encode workspace focus areas"})
		return
	}

	trimmedName := strings.TrimSpace(req.Name)
	slug, err := uniqueWorkspaceSlug(h.DB, trimmedName, workspaceID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update workspace name"})
		return
	}

	_, err = h.DB.Exec(
		`UPDATE workspaces SET name = ?, slug = ?, focus_areas = ? WHERE id = ?`,
		trimmedName, slug, focusAreasValue, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update workspace settings"})
		return
	}

	if err := h.pruneMemberManageAreas(workspaceID.(int), focusAreas); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update workspace settings"})
		return
	}

	ws, err := h.loadWorkspaceResponse(workspaceID.(int), role.(string), middleware.ManageAreas(c))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load workspace"})
		return
	}

	raw, _ := json.Marshal(gin.H{"workspace_id": workspaceID, "focus_areas": ws.FocusAreas})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type: "update", Entity: "workspace", Action: "updated", Payload: raw,
	})

	c.JSON(http.StatusOK, ws)
}

func (h *WorkspaceHandler) ListMembers(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")

	var focusRaw sql.NullString
	if err := h.DB.QueryRow(`SELECT focus_areas FROM workspaces WHERE id = ?`, workspaceID).Scan(&focusRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load members"})
		return
	}
	focusAreas := parseFocusAreas(focusRaw)

	rows, err := h.DB.Query(`
		SELECT u.id, u.username, u.display_name, wm.role, wm.manage_areas, wm.joined_at
		FROM workspace_members wm
		INNER JOIN users u ON u.id = wm.user_id
		WHERE wm.workspace_id = ?
		ORDER BY wm.role ASC, u.username ASC`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load members"})
		return
	}
	defer rows.Close()

	members := []memberResponse{}
	for rows.Next() {
		var member memberResponse
		var displayName sql.NullString
		var manageRaw sql.NullString
		var joinedAt sql.NullTime
		if err := rows.Scan(&member.UserID, &member.Username, &displayName, &member.Role, &manageRaw, &joinedAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read member"})
			return
		}
		member.DisplayName = userDisplayName(displayName, member.Username)
		member.ManageAreas = effectiveManageAreas(member.Role, parseManageAreas(manageRaw), focusAreas)
		if joinedAt.Valid {
			member.JoinedAt = joinedAt.Time.UTC().Format("2006-01-02T15:04:05Z")
		}
		members = append(members, member)
	}

	c.JSON(http.StatusOK, gin.H{"members": members})
}

func (h *WorkspaceHandler) UpdateMember(c *gin.Context) {
	if !middleware.RequireOwner(c) {
		return
	}

	workspaceID, _ := c.Get("workspaceID")
	memberID, err := strconv.Atoi(c.Param("userId"))
	if err != nil || memberID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member id"})
		return
	}

	var req updateMemberRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var role string
	var manageRaw sql.NullString
	err = h.DB.QueryRow(
		`SELECT role, manage_areas FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
		workspaceID, memberID,
	).Scan(&role, &manageRaw)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "member not found"})
		return
	}
	if role == middleware.RoleOwner {
		c.JSON(http.StatusBadRequest, gin.H{"error": "the workspace owner already manages every section"})
		return
	}

	var focusRaw sql.NullString
	if err := h.DB.QueryRow(`SELECT focus_areas FROM workspaces WHERE id = ?`, workspaceID).Scan(&focusRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update member"})
		return
	}
	focusAreas := parseFocusAreas(focusRaw)
	manageAreas := intersectManageAreas(normalizeFocusAreasInput(req.ManageAreas), focusAreas)
	encoded, err := focusAreasJSON(manageAreas)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update member"})
		return
	}

	_, err = h.DB.Exec(
		`UPDATE workspace_members SET manage_areas = ? WHERE workspace_id = ? AND user_id = ?`,
		encoded, workspaceID, memberID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update member"})
		return
	}

	var username string
	_ = h.DB.QueryRow(`SELECT username FROM users WHERE id = ?`, memberID).Scan(&username)

	raw, _ := json.Marshal(gin.H{"user_id": memberID, "username": username, "manage_areas": manageAreas})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type: "update", Entity: "member", Action: "updated", Payload: raw,
	})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type: "update", Entity: "workspace", Action: "updated", Payload: raw,
	})

	c.JSON(http.StatusOK, gin.H{
		"member": memberResponse{
			UserID:      memberID,
			Username:    username,
			Role:        role,
			ManageAreas: manageAreas,
		},
	})
}

func (h *WorkspaceHandler) AddMember(c *gin.Context) {
	h.InviteMember(c)
}

func (h *WorkspaceHandler) InviteMember(c *gin.Context) {
	if !middleware.RequireOwner(c) {
		return
	}

	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req inviteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var inviteeID int
	err := h.DB.QueryRow("SELECT id FROM users WHERE username = ?", req.Username).Scan(&inviteeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var existingMember int
	err = h.DB.QueryRow(
		`SELECT user_id FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
		workspaceID, inviteeID,
	).Scan(&existingMember)
	if err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "user is already in this workspace"})
		return
	}

	_, err = h.DB.Exec(`
		INSERT INTO workspace_invites (workspace_id, invitee_user_id, invited_by, status)
		VALUES (?, ?, ?, 'pending')
		ON DUPLICATE KEY UPDATE invited_by = VALUES(invited_by), status = 'pending'`,
		workspaceID, inviteeID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not invite member"})
		return
	}

	raw, _ := json.Marshal(gin.H{"username": req.Username})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type: "update", Entity: "invite", Action: "created", Payload: raw,
	})

	c.JSON(http.StatusCreated, gin.H{"message": "invite sent"})
}

func (h *WorkspaceHandler) ListAccessRequests(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")

	rows, err := h.DB.Query(`
		SELECT ar.id, ar.workspace_id, w.name, ar.user_id, u.username, COALESCE(ar.message, ''), ar.status, ar.created_at
		FROM workspace_access_requests ar
		INNER JOIN users u ON u.id = ar.user_id
		INNER JOIN workspaces w ON w.id = ar.workspace_id
		WHERE ar.workspace_id = ? AND ar.status = 'pending'
		ORDER BY ar.created_at ASC`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load access requests"})
		return
	}
	defer rows.Close()

	requests := []accessRequestResponse{}
	for rows.Next() {
		var req accessRequestResponse
		var createdAt sql.NullTime
		if err := rows.Scan(
			&req.ID, &req.WorkspaceID, &req.WorkspaceName, &req.UserID, &req.Username,
			&req.Message, &req.Status, &createdAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read access request"})
			return
		}
		if createdAt.Valid {
			req.CreatedAt = createdAt.Time.UTC().Format("2006-01-02T15:04:05Z")
		}
		requests = append(requests, req)
	}

	c.JSON(http.StatusOK, gin.H{"requests": requests})
}

func (h *WorkspaceHandler) ReviewAccessRequest(c *gin.Context) {
	if !middleware.RequireOwner(c) {
		return
	}

	workspaceID, _ := c.Get("workspaceID")
	reviewerID, _ := c.Get("userID")
	requestID, err := strconv.Atoi(c.Param("requestId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request id"})
		return
	}

	var req accessRequestResponse
	err = h.DB.QueryRow(`
		SELECT ar.id, ar.workspace_id, w.name, ar.user_id, u.username, COALESCE(ar.message, ''), ar.status
		FROM workspace_access_requests ar
		INNER JOIN users u ON u.id = ar.user_id
		INNER JOIN workspaces w ON w.id = ar.workspace_id
		WHERE ar.id = ? AND ar.workspace_id = ?`, requestID, workspaceID,
	).Scan(&req.ID, &req.WorkspaceID, &req.WorkspaceName, &req.UserID, &req.Username, &req.Message, &req.Status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "access request not found"})
		return
	}
	if req.Status != "pending" {
		c.JSON(http.StatusConflict, gin.H{"error": "access request already reviewed"})
		return
	}

	var body reviewAccessRequest
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	action := strings.ToLower(strings.TrimSpace(body.Action))
	if action != "approve" && action != "deny" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "action must be approve or deny"})
		return
	}

	status := "denied"
	if action == "approve" {
		status = "approved"
		_, err = h.DB.Exec(
			`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')`,
			workspaceID, req.UserID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add approved member"})
			return
		}
		if err := AddUserToWorkspaceChats(h.DB, workspaceID.(int), req.UserID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add member to chat"})
			return
		}

		raw, _ := json.Marshal(gin.H{"username": req.Username})
		h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
			Type: "update", Entity: "member", Action: "joined", Payload: raw,
		})
	}

	_, err = h.DB.Exec(`
		UPDATE workspace_access_requests
		SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
		WHERE id = ?`, status, reviewerID, requestID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update access request"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "access request " + status, "status": status})
}

func (h *WorkspaceHandler) ListMyInvites(c *gin.Context) {
	userID, _ := c.Get("userID")

	rows, err := h.DB.Query(`
		SELECT i.id, i.workspace_id, w.name, u.username, i.status, i.created_at
		FROM workspace_invites i
		INNER JOIN workspaces w ON w.id = i.workspace_id
		INNER JOIN users u ON u.id = i.invited_by
		WHERE i.invitee_user_id = ? AND i.status = 'pending' AND w.archived_at IS NULL
		ORDER BY i.created_at DESC`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load invites"})
		return
	}
	defer rows.Close()

	invites := []inviteResponse{}
	for rows.Next() {
		var invite inviteResponse
		var createdAt sql.NullTime
		if err := rows.Scan(&invite.ID, &invite.WorkspaceID, &invite.WorkspaceName, &invite.InvitedBy, &invite.Status, &createdAt); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read invite"})
			return
		}
		if createdAt.Valid {
			invite.CreatedAt = createdAt.Time.UTC().Format("2006-01-02T15:04:05Z")
		}
		invites = append(invites, invite)
	}

	c.JSON(http.StatusOK, gin.H{"invites": invites})
}

func (h *WorkspaceHandler) AcceptInvite(c *gin.Context) {
	userID, _ := c.Get("userID")
	inviteID, err := strconv.Atoi(c.Param("inviteId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite id"})
		return
	}

	var workspaceID int
	var status string
	err = h.DB.QueryRow(`
		SELECT workspace_id, status FROM workspace_invites
		WHERE id = ? AND invitee_user_id = ?`, inviteID, userID,
	).Scan(&workspaceID, &status)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "invite not found"})
		return
	}
	if status != "pending" {
		c.JSON(http.StatusConflict, gin.H{"error": "invite is no longer pending"})
		return
	}

	_, err = h.DB.Exec(
		`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'member')`,
		workspaceID, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not join workspace"})
		return
	}

	if err := AddUserToWorkspaceChats(h.DB, workspaceID, userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not add member to chat"})
		return
	}

	_, _ = h.DB.Exec(`UPDATE workspace_invites SET status = 'accepted' WHERE id = ?`, inviteID)

	var name, slug string
	var focusRaw sql.NullString
	_ = h.DB.QueryRow(`SELECT name, slug, focus_areas FROM workspaces WHERE id = ?`, workspaceID).Scan(&name, &slug, &focusRaw)

	raw, _ := json.Marshal(gin.H{"username": c.GetString("username")})
	h.Hub.BroadcastWorkspace(workspaceID, hub.Message{
		Type: "update", Entity: "member", Action: "joined", Payload: raw,
	})

	c.JSON(http.StatusOK, gin.H{
		"message": "invite accepted",
		"workspace": workspaceResponse{
			ID: workspaceID, Name: name, Slug: slug, Role: "member",
			FocusAreas: parseFocusAreas(focusRaw), ManageAreas: []string{},
		},
	})
}

func (h *WorkspaceHandler) DeclineInvite(c *gin.Context) {
	userID, _ := c.Get("userID")
	inviteID, err := strconv.Atoi(c.Param("inviteId"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite id"})
		return
	}

	result, err := h.DB.Exec(`
		UPDATE workspace_invites SET status = 'declined'
		WHERE id = ? AND invitee_user_id = ? AND status = 'pending'`, inviteID, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not decline invite"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "invite not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "invite declined"})
}

func (h *WorkspaceHandler) Archive(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	role, _ := c.Get("workspaceRole")

	if role.(string) != middleware.RoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "only workspace owners can archive a workspace"})
		return
	}

	var archivedAt sql.NullTime
	err := h.DB.QueryRow(
		`SELECT archived_at FROM workspaces WHERE id = ?`,
		workspaceID,
	).Scan(&archivedAt)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "workspace not found"})
		return
	}
	if archivedAt.Valid {
		c.JSON(http.StatusConflict, gin.H{"error": "workspace is already archived"})
		return
	}

	_, err = h.DB.Exec(
		`UPDATE workspaces SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
		workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not archive workspace"})
		return
	}

	raw, _ := json.Marshal(gin.H{"workspace_id": workspaceID})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type: "update", Entity: "workspace", Action: "archived", Payload: raw,
	})

	c.JSON(http.StatusOK, gin.H{"message": "workspace archived"})
}

func (h *WorkspaceHandler) Leave(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")
	role, _ := c.Get("workspaceRole")

	if role.(string) == middleware.RoleOwner {
		c.JSON(http.StatusForbidden, gin.H{"error": "workspace owners must archive the workspace instead of leaving"})
		return
	}

	result, err := h.DB.Exec(
		`DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ? AND role != ?`,
		workspaceID, userID, middleware.RoleOwner,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not leave workspace"})
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusConflict, gin.H{"error": "could not leave workspace"})
		return
	}

	if err := RemoveUserFromWorkspaceChats(h.DB, workspaceID.(int), userID.(int)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not remove member from chat"})
		return
	}

	raw, _ := json.Marshal(gin.H{"username": c.GetString("username")})
	h.Hub.BroadcastWorkspace(workspaceID.(int), hub.Message{
		Type: "update", Entity: "member", Action: "left", Payload: raw,
	})

	c.JSON(http.StatusOK, gin.H{"message": "left workspace"})
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

func uniqueWorkspaceSlug(db *sql.DB, name string, excludeWorkspaceID int) (string, error) {
	slugBase := slugifyWorkspace(name)
	slug := slugBase
	for i := 1; i < 100; i++ {
		var existingID int
		err := db.QueryRow(
			`SELECT id FROM workspaces WHERE slug = ? AND id != ? LIMIT 1`,
			slug, excludeWorkspaceID,
		).Scan(&existingID)
		if err == sql.ErrNoRows {
			return slug, nil
		}
		if err != nil {
			return "", err
		}
		slug = fmt.Sprintf("%s-%d", slugBase, i+1)
	}
	return "", fmt.Errorf("could not allocate unique slug for %q", name)
}
