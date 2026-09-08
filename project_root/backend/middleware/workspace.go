package middleware

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

const (
	RoleOwner    = "owner"
	AreaPlanning = "planning"
	AreaFinances = "finances"
)

func WorkspaceAccess(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, _ := c.Get("userID")
		uid, ok := userID.(int)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		workspaceID, err := strconv.Atoi(c.Param("workspaceId"))
		if err != nil || workspaceID <= 0 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "invalid workspace id"})
			return
		}

		var role string
		var manageRaw sql.NullString
		var archivedAt sql.NullTime
		err = db.QueryRow(
			`SELECT wm.role, wm.manage_areas, w.archived_at
			 FROM workspace_members wm
			 INNER JOIN workspaces w ON w.id = wm.workspace_id
			 WHERE wm.workspace_id = ? AND wm.user_id = ?`,
			workspaceID, uid,
		).Scan(&role, &manageRaw, &archivedAt)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "workspace access denied"})
			return
		}
		if archivedAt.Valid {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "workspace has been archived"})
			return
		}

		c.Set("workspaceID", workspaceID)
		c.Set("workspaceRole", role)
		c.Set("workspaceManageAreas", ParseManageAreas(manageRaw))
		c.Next()
	}
}

func ParseManageAreas(raw sql.NullString) []string {
	if !raw.Valid || strings.TrimSpace(raw.String) == "" {
		return []string{}
	}

	var areas []string
	if err := json.Unmarshal([]byte(raw.String), &areas); err != nil {
		return []string{}
	}

	normalized := make([]string, 0, len(areas))
	seen := map[string]bool{}
	for _, area := range areas {
		area = strings.ToLower(strings.TrimSpace(area))
		if (area != AreaPlanning && area != AreaFinances) || seen[area] {
			continue
		}
		seen[area] = true
		normalized = append(normalized, area)
	}
	return normalized
}

func WorkspaceRole(c *gin.Context) string {
	role, _ := c.Get("workspaceRole")
	value, _ := role.(string)
	return value
}

func IsOwner(c *gin.Context) bool {
	return WorkspaceRole(c) == RoleOwner
}

func ManageAreas(c *gin.Context) []string {
	areas, _ := c.Get("workspaceManageAreas")
	value, _ := areas.([]string)
	return value
}

func CanManage(c *gin.Context, area string) bool {
	if IsOwner(c) {
		return true
	}
	for _, granted := range ManageAreas(c) {
		if granted == area {
			return true
		}
	}
	return false
}

func RequireOwner(c *gin.Context) bool {
	if IsOwner(c) {
		return true
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "only the workspace owner can do that"})
	return false
}

func RequireManage(c *gin.Context, area string) bool {
	if CanManage(c, area) {
		return true
	}
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "you do not have permission to manage this section"})
	return false
}
