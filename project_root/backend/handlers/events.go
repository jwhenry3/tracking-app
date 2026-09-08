package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"fullstack-app/hub"
	"fullstack-app/middleware"
	"fullstack-app/recurrence"

	"github.com/gin-gonic/gin"
)

type EventHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
}

type eventOccurrencePayload struct {
	SeriesID         int       `json:"series_id"`
	OccurrenceID     string    `json:"occurrence_id"`
	ID               int       `json:"id"`
	WorkspaceID      int       `json:"workspace_id"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	StartAt          time.Time `json:"start_at"`
	EndAt            time.Time `json:"end_at"`
	AllDay           bool      `json:"all_day"`
	Color            string    `json:"color"`
	Recurrence       string    `json:"recurrence"`
	IsRecurring      bool      `json:"is_recurring"`
	SeriesAnchorDate string    `json:"series_anchor_date"`
	CreatedBy        int       `json:"created_by"`
}

type upsertEventRequest struct {
	Title       string `json:"title" binding:"required"`
	Description string `json:"description"`
	StartAt     string `json:"start_at" binding:"required"`
	EndAt       string `json:"end_at" binding:"required"`
	AllDay      bool   `json:"all_day"`
	Color       string `json:"color"`
	Recurrence  string `json:"recurrence"`
}

type patchOccurrenceRequest struct {
	Scope       string `json:"scope" binding:"required"`
	Title       string `json:"title"`
	Description string `json:"description"`
	StartAt     string `json:"start_at"`
	EndAt       string `json:"end_at"`
	AllDay      *bool  `json:"all_day"`
	Color       string `json:"color"`
	Recurrence  string `json:"recurrence"`
}

type eventSeriesRow struct {
	ID          int
	WorkspaceID int
	Title       string
	Description string
	StartAt     time.Time
	EndAt       time.Time
	AllDay      bool
	Color       string
	RRule       string
	CreatedBy   int
}

func (h *EventHandler) List(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	startRaw := c.Query("start")
	endRaw := c.Query("end")

	from, to, ok := parseQueryRange(startRaw, endRaw)
	if !ok {
		from = time.Now().UTC().AddDate(0, -1, 0)
		to = time.Now().UTC().AddDate(0, 2, 0)
	}

	rows, err := h.DB.Query(`
		SELECT id, workspace_id, title, description, start_at, end_at, all_day, color, COALESCE(rrule, ''), created_by
		FROM events WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load events"})
		return
	}
	defer rows.Close()

	store := recurrence.Store{DB: h.DB}
	exceptionMap, err := store.LoadExceptionsForWorkspace(recurrence.EntityEvent, workspaceID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load recurrence exceptions"})
		return
	}

	events := []eventOccurrencePayload{}
	for rows.Next() {
		var row eventSeriesRow
		if err := rows.Scan(
			&row.ID, &row.WorkspaceID, &row.Title, &row.Description,
			&row.StartAt, &row.EndAt, &row.AllDay, &row.Color, &row.RRule, &row.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read event"})
			return
		}

		series := recurrence.Series{
			ID: row.ID, StartAt: row.StartAt, EndAt: row.EndAt, RRule: row.RRule,
			AllDay: row.AllDay, Duration: row.EndAt.Sub(row.StartAt), DateOnly: false,
		}
		occurrences := recurrence.ExpandSeries(series, from, to, exceptionMap[row.ID])
		exceptions := exceptionMap[row.ID]
		for _, at := range occurrences {
			ex := recurrence.FindException(exceptions, at, false)
			startAt, endAt := recurrence.ApplyEventOverride(row.StartAt, row.EndAt, at, series.Duration, ex)
			title := row.Title
			description := row.Description
			color := row.Color
			allDay := row.AllDay
			if ex != nil && ex.Action == recurrence.ActionModified && ex.OverrideJSON != "" {
				var override struct {
					Title       string `json:"title"`
					Description string `json:"description"`
					Color       string `json:"color"`
					AllDay      *bool  `json:"all_day"`
				}
				if err := json.Unmarshal([]byte(ex.OverrideJSON), &override); err == nil {
					if override.Title != "" {
						title = override.Title
					}
					if override.Description != "" {
						description = override.Description
					}
					if override.Color != "" {
						color = override.Color
					}
					if override.AllDay != nil {
						allDay = *override.AllDay
					}
				}
			}

			events = append(events, eventOccurrencePayload{
				SeriesID: row.ID, OccurrenceID: recurrence.OccurrenceID(row.ID, at, false),
				ID: row.ID, WorkspaceID: row.WorkspaceID, Title: title, Description: description,
				StartAt: startAt, EndAt: endAt, AllDay: allDay, Color: color,
				Recurrence: recurrence.NormalizeRule(row.RRule), IsRecurring: recurrence.IsRecurring(row.RRule),
				SeriesAnchorDate: row.StartAt.Format("2006-01-02"),
				CreatedBy:        row.CreatedBy,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"events": events})
}

type eventSeriesPayload struct {
	ID               int    `json:"id"`
	WorkspaceID      int    `json:"workspace_id"`
	Title            string `json:"title"`
	Description      string `json:"description"`
	StartAt          string `json:"start_at"`
	EndAt            string `json:"end_at"`
	AllDay           bool   `json:"all_day"`
	Color            string `json:"color"`
	Recurrence       string `json:"recurrence"`
	IsRecurring      bool   `json:"is_recurring"`
	SeriesAnchorDate string `json:"series_anchor_date"`
	CreatedBy        int    `json:"created_by"`
}

func (h *EventHandler) ListSeries(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")

	rows, err := h.DB.Query(`
		SELECT id, workspace_id, title, description, start_at, end_at, all_day, color, COALESCE(rrule, ''), created_by
		FROM events WHERE workspace_id = ?
		ORDER BY start_at DESC, title ASC`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load event series"})
		return
	}
	defer rows.Close()

	items := []eventSeriesPayload{}
	for rows.Next() {
		var row eventSeriesRow
		if err := rows.Scan(
			&row.ID, &row.WorkspaceID, &row.Title, &row.Description,
			&row.StartAt, &row.EndAt, &row.AllDay, &row.Color, &row.RRule, &row.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read event series"})
			return
		}
		rule := recurrence.NormalizeRule(row.RRule)
		items = append(items, eventSeriesPayload{
			ID: row.ID, WorkspaceID: row.WorkspaceID, Title: row.Title, Description: row.Description,
			StartAt: row.StartAt.UTC().Format(time.RFC3339), EndAt: row.EndAt.UTC().Format(time.RFC3339),
			AllDay: row.AllDay, Color: row.Color, Recurrence: rule, IsRecurring: recurrence.IsRecurring(rule),
			SeriesAnchorDate: row.StartAt.UTC().Format("2006-01-02"), CreatedBy: row.CreatedBy,
		})
	}

	c.JSON(http.StatusOK, gin.H{"events": items})
}

func (h *EventHandler) Create(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}

	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req upsertEventRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	startAt, endAt, err := parseRange(req.StartAt, req.EndAt)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	color := req.Color
	if color == "" {
		color = "#3b82f6"
	}
	rrule := recurrence.NormalizeRule(req.Recurrence)

	result, err := h.DB.Exec(`
		INSERT INTO events (workspace_id, title, description, start_at, end_at, all_day, color, rrule, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, req.Title, req.Description, startAt, endAt, req.AllDay, color, nullableString(rrule), userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create event"})
		return
	}

	id64, _ := result.LastInsertId()
	event := eventOccurrencePayload{
		SeriesID: int(id64), OccurrenceID: recurrence.OccurrenceID(int(id64), startAt, false),
		ID: int(id64), WorkspaceID: workspaceID.(int), Title: req.Title, Description: req.Description,
		StartAt: startAt, EndAt: endAt, AllDay: req.AllDay, Color: color,
		Recurrence: rrule, IsRecurring: recurrence.IsRecurring(rrule),
		SeriesAnchorDate: startAt.Format("2006-01-02"),
		CreatedBy:        userID.(int),
	}

	h.broadcastEntity(workspaceID.(int), "event", "created", event)
	c.JSON(http.StatusCreated, event)
}

func (h *EventHandler) Delete(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}

	workspaceID, _ := c.Get("workspaceID")
	eventID := c.Param("eventId")
	scope := defaultString(c.Query("scope"), "all")
	occurrenceRaw := c.Query("occurrence")

	if scope == "all" && occurrenceRaw == "" {
		h.deleteSeries(workspaceID.(int), eventID, c)
		return
	}

	if occurrenceRaw == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "occurrence is required unless scope=all"})
		return
	}

	occurrenceAt, err := parseOccurrenceParam(occurrenceRaw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.loadSeries(workspaceID.(int), eventID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	store := recurrence.Store{DB: h.DB}
	switch scope {
	case "this":
		if err := store.UpsertException(workspaceID.(int), recurrence.EntityEvent, row.ID, occurrenceAt, recurrence.ActionCancelled, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not skip occurrence"})
			return
		}
	case "following":
		if recurrence.IsRecurring(row.RRule) {
			newRule := recurrence.TruncateRule(row.RRule, occurrenceAt)
			if _, err := h.DB.Exec(`UPDATE events SET rrule = ? WHERE id = ? AND workspace_id = ?`, nullableString(newRule), row.ID, workspaceID); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not truncate series"})
				return
			}
			_ = store.DeleteExceptionsFrom(recurrence.EntityEvent, row.ID, occurrenceAt)
		} else {
			h.deleteSeries(workspaceID.(int), eventID, c)
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be this, following, or all"})
		return
	}

	h.broadcastEntity(workspaceID.(int), "event", "updated", gin.H{"series_id": row.ID})
	c.Status(http.StatusNoContent)
}

func (h *EventHandler) PatchOccurrence(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}

	workspaceID, _ := c.Get("workspaceID")
	eventID := c.Param("eventId")
	occurrenceRaw := c.Param("occurrenceAt")

	var req patchOccurrenceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	occurrenceAt, err := parseOccurrenceParam(occurrenceRaw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.loadSeries(workspaceID.(int), eventID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "event not found"})
		return
	}

	store := recurrence.Store{DB: h.DB}
	scope := strings.ToLower(req.Scope)

	switch scope {
	case "all":
		startAt := row.StartAt
		endAt := row.EndAt
		if req.StartAt != "" && req.EndAt != "" {
			startAt, endAt, err = parseRange(req.StartAt, req.EndAt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}
		title := defaultString(req.Title, row.Title)
		description := row.Description
		if req.Description != "" {
			description = req.Description
		}
		color := defaultString(req.Color, row.Color)
		allDay := row.AllDay
		if req.AllDay != nil {
			allDay = *req.AllDay
		}
		rrule := row.RRule
		if req.Recurrence != "" {
			rrule = recurrence.NormalizeRule(req.Recurrence)
		}
		_, err = h.DB.Exec(`
			UPDATE events
			SET title = ?, description = ?, start_at = ?, end_at = ?, all_day = ?, color = ?, rrule = ?
			WHERE id = ? AND workspace_id = ?`,
			title, description, startAt, endAt, allDay, color, nullableString(rrule), row.ID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update series"})
			return
		}
		_ = store.DeleteAllExceptions(recurrence.EntityEvent, row.ID)
	case "following":
		if !recurrence.IsRecurring(row.RRule) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "following scope requires a recurring series"})
			return
		}
		truncated := recurrence.TruncateRule(row.RRule, occurrenceAt)
		if _, err := h.DB.Exec(`UPDATE events SET rrule = ? WHERE id = ? AND workspace_id = ?`, nullableString(truncated), row.ID, workspaceID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not split series"})
			return
		}
		_ = store.DeleteExceptionsFrom(recurrence.EntityEvent, row.ID, occurrenceAt)

		startAt, endAt := occurrenceAt, occurrenceAt.Add(row.EndAt.Sub(row.StartAt))
		if req.StartAt != "" && req.EndAt != "" {
			startAt, endAt, err = parseRange(req.StartAt, req.EndAt)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
		}
		title := defaultString(req.Title, row.Title)
		description := defaultString(req.Description, row.Description)
		color := defaultString(req.Color, row.Color)
		allDay := row.AllDay
		if req.AllDay != nil {
			allDay = *req.AllDay
		}
		rrule := recurrence.SplitRuleFrom(row.RRule, occurrenceAt)
		if req.Recurrence != "" {
			rrule = recurrence.NormalizeRule(req.Recurrence)
		}
		_, err = h.DB.Exec(`
			INSERT INTO events (workspace_id, title, description, start_at, end_at, all_day, color, rrule, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			workspaceID, title, description, startAt, endAt, allDay, color, nullableString(rrule), row.CreatedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create split series"})
			return
		}
	case "this":
		override, err := recurrence.MarshalOverride(gin.H{
			"title":       req.Title,
			"description": req.Description,
			"start_at":    req.StartAt,
			"end_at":      req.EndAt,
			"color":       req.Color,
			"all_day":     req.AllDay,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not encode override"})
			return
		}
		if err := store.UpsertException(workspaceID.(int), recurrence.EntityEvent, row.ID, occurrenceAt, recurrence.ActionModified, override); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update occurrence"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be this, following, or all"})
		return
	}

	h.broadcastEntity(workspaceID.(int), "event", "updated", gin.H{"series_id": row.ID})
	c.Status(http.StatusNoContent)
}

func (h *EventHandler) deleteSeries(workspaceID int, eventID string, c *gin.Context) {
	_, err := h.DB.Exec(`DELETE FROM events WHERE id = ? AND workspace_id = ?`, eventID, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete event"})
		return
	}
	store := recurrence.Store{DB: h.DB}
	id, _ := parseSeriesID(eventID)
	_ = store.DeleteAllExceptions(recurrence.EntityEvent, id)
	h.broadcastEntity(workspaceID, "event", "deleted", gin.H{"id": eventID})
	c.Status(http.StatusNoContent)
}

func (h *EventHandler) loadSeries(workspaceID int, eventID string) (eventSeriesRow, error) {
	var row eventSeriesRow
	err := h.DB.QueryRow(`
		SELECT id, workspace_id, title, description, start_at, end_at, all_day, color, COALESCE(rrule, ''), created_by
		FROM events WHERE id = ? AND workspace_id = ?`, eventID, workspaceID,
	).Scan(
		&row.ID, &row.WorkspaceID, &row.Title, &row.Description,
		&row.StartAt, &row.EndAt, &row.AllDay, &row.Color, &row.RRule, &row.CreatedBy,
	)
	return row, err
}

func (h *EventHandler) broadcastEntity(workspaceID int, entity, action string, payload any) {
	raw, _ := json.Marshal(payload)
	h.Hub.BroadcastWorkspace(workspaceID, hub.Message{
		Type:    "update",
		Entity:  entity,
		Action:  action,
		Payload: raw,
	})
}

func parseQueryRange(start, end string) (time.Time, time.Time, bool) {
	if start == "" || end == "" {
		return time.Time{}, time.Time{}, false
	}
	from, err := time.Parse(time.RFC3339, start)
	if err != nil {
		from, err = time.Parse("2006-01-02", start)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
	}
	to, err := time.Parse(time.RFC3339, end)
	if err != nil {
		to, err = time.Parse("2006-01-02", end)
		if err != nil {
			return time.Time{}, time.Time{}, false
		}
	}
	return from, to, true
}

func parseOccurrenceParam(raw string) (time.Time, error) {
	decoded, err := time.Parse(time.RFC3339, raw)
	if err == nil {
		return decoded, nil
	}
	return time.Parse("2006-01-02", raw)
}

func parseSeriesID(raw string) (int, error) {
	id, err := strconv.Atoi(raw)
	if err != nil {
		return 0, err
	}
	return id, nil
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func parseRange(start, end string) (time.Time, time.Time, error) {
	startAt, err := time.Parse(time.RFC3339, start)
	if err != nil {
		startAt, err = time.Parse("2006-01-02", start)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
	}

	endAt, err := time.Parse(time.RFC3339, end)
	if err != nil {
		endAt, err = time.Parse("2006-01-02", end)
		if err != nil {
			return time.Time{}, time.Time{}, err
		}
	}

	return startAt, endAt, nil
}
