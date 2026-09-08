package middleware

import (
	"database/sql"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
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
		err = db.QueryRow(
			`SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`,
			workspaceID, uid,
		).Scan(&role)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "workspace access denied"})
			return
		}

		c.Set("workspaceID", workspaceID)
		c.Set("workspaceRole", role)
		c.Next()
	}
}
