package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"fullstack-app/hub"
	"fullstack-app/middleware"
	"fullstack-app/recurrence"

	"github.com/gin-gonic/gin"
)

type TodoHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
}

type todoListPayload struct {
	ID           int     `json:"id"`
	WorkspaceID  int     `json:"workspace_id"`
	Name         string  `json:"name"`
	Kind         string  `json:"kind"`
	ListDate     *string `json:"list_date"`
	Recurrence   string  `json:"recurrence"`
	IsRecurring  bool    `json:"is_recurring"`
	SeriesID     *int    `json:"series_id"`
	OccurrenceID string  `json:"occurrence_id,omitempty"`
	PeriodScope  string  `json:"period_scope"`
	SpanStart    *string `json:"span_start,omitempty"`
	PeriodEnd    *string `json:"period_end,omitempty"`
}

type todoSeriesRow struct {
	ID          int
	WorkspaceID int
	Name        string
	ListDate    time.Time
	Recurrence  string
}

type todoPayload struct {
	ID          int     `json:"id"`
	WorkspaceID int     `json:"workspace_id"`
	ListID      int     `json:"list_id"`
	Title       string  `json:"title"`
	Completed   bool    `json:"completed"`
	DueDate     *string `json:"due_date"`
	Position    int     `json:"position"`
	CreatedBy   int     `json:"created_by"`
}

type notePayload struct {
	ID          int       `json:"id"`
	WorkspaceID int       `json:"workspace_id"`
	ListID      *int      `json:"list_id"`
	Title       string    `json:"title"`
	Content     string    `json:"content"`
	CreatedBy   int       `json:"created_by"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type createListRequest struct {
	Name        string `json:"name" binding:"required"`
	Kind        string `json:"kind"`
	ListDate    string `json:"list_date"`
	Recurrence  string `json:"recurrence"`
	PeriodScope string `json:"period_scope"`
}

type createTodoRequest struct {
	ListID  int    `json:"list_id" binding:"required"`
	Title   string `json:"title" binding:"required"`
	DueDate string `json:"due_date"`
}

type updateTodoRequest struct {
	Title      *string `json:"title"`
	Completed  *bool   `json:"completed"`
	Occurrence string  `json:"occurrence"`
}

type createNoteRequest struct {
	ListID  *int   `json:"list_id"`
	Title   string `json:"title" binding:"required"`
	Content string `json:"content"`
}

type updateNoteRequest struct {
	Title   *string `json:"title"`
	Content *string `json:"content"`
}

func (h *TodoHandler) ListLists(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	listDate := c.Query("date")
	rangeFrom, rangeTo, hasRange := parseQueryRange(c.Query("start"), c.Query("end"))

	query := `
		SELECT tl.id, tl.workspace_id, tl.name, tl.kind, tl.list_date, tl.series_id,
			COALESCE(tl.recurrence, '')
		FROM todo_lists tl
		WHERE tl.workspace_id = ? AND tl.kind != 'series' AND tl.series_id IS NULL`
	args := []any{workspaceID}

	switch {
	case hasRange:
		query += ` AND tl.kind = 'daily'`
	case listDate != "":
		query += ` AND (
			tl.kind = 'general'
			OR tl.kind = 'daily'
		)`
	}
	query += " ORDER BY tl.kind ASC, tl.list_date DESC, tl.name ASC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo lists"})
		return
	}
	defer rows.Close()

	lists := []todoListPayload{}
	dailyAnchors := []todoListPayload{}
	for rows.Next() {
		list, err := scanTodoListPayload(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read todo list"})
			return
		}
		if (hasRange || listDate != "") && list.Kind == "daily" {
			dailyAnchors = append(dailyAnchors, list)
			continue
		}
		lists = append(lists, list)
	}

	seriesRows, err := h.loadTodoSeriesRows(workspaceID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load check list series"})
		return
	}

	switch {
	case hasRange:
		from := recurrence.DateOnlyUTC(rangeFrom)
		to := recurrence.DateOnlyUTC(rangeTo)
		if to.Before(from) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date range"})
			return
		}
		lists = appendStandaloneDailyOccurrencesForRange(lists, from, to, dailyAnchors)
		store := recurrence.Store{DB: h.DB}
		exceptionMap, err := store.LoadExceptionsForWorkspace(recurrence.EntityTodoList, workspaceID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load recurrence exceptions"})
			return
		}
		lists = h.appendVirtualCheckListsForRange(lists, from, to, seriesRows, exceptionMap)
	case listDate != "":
		lists = appendStandaloneDailyOccurrences(lists, listDate, dailyAnchors)
		store := recurrence.Store{DB: h.DB}
		exceptionMap, err := store.LoadExceptionsForWorkspace(recurrence.EntityTodoList, workspaceID.(int))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load recurrence exceptions"})
			return
		}
		lists, err = h.appendVirtualCheckListsForDate(lists, listDate, seriesRows, exceptionMap)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date"})
			return
		}
	default:
		for _, row := range seriesRows {
			lists = append(lists, seriesRowToManagementPayload(row))
		}
	}

	c.JSON(http.StatusOK, gin.H{"lists": lists})
}

func (h *TodoHandler) CreateList(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")

	var req createListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rrule := recurrence.NormalizeRule(req.Recurrence)
	periodScope := normalizePeriodScope(req.PeriodScope, req.Kind)
	if periodScope != "" {
		anchor := req.ListDate
		if anchor == "" {
			anchor = time.Now().Format("2006-01-02")
		}
		periodStart, err := recurrence.PeriodStartFromISODate(anchor, periodScope)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid list_date"})
			return
		}
		list, err := h.createPeriodicSeries(
			workspaceID.(int),
			req.Name,
			periodStart.Format("2006-01-02"),
			periodScope,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create periodic check list"})
			return
		}
		h.broadcastTodo(workspaceID.(int), "todo_list", "created", list)
		c.JSON(http.StatusCreated, list)
		return
	}

	if recurrence.IsRecurring(rrule) {
		if recurrence.IsPeriodicChecklistScope(rrule) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "use periodic list type for week, month, or year scoped lists"})
			return
		}
		if req.ListDate == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "list_date is required for recurring check lists"})
			return
		}
		list, err := h.createRecurringSeries(workspaceID.(int), req.Name, req.ListDate, rrule)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create recurring check list"})
			return
		}
		h.broadcastTodo(workspaceID.(int), "todo_list", "created", list)
		c.JSON(http.StatusCreated, list)
		return
	}

	kind := req.Kind
	if kind == "" {
		if req.ListDate != "" {
			kind = "daily"
		} else {
			kind = "general"
		}
	}

	if strings.EqualFold(kind, "daily") {
		if req.ListDate == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "list_date is required for daily check lists"})
			return
		}
		list, err := h.createRecurringSeries(
			workspaceID.(int),
			req.Name,
			req.ListDate,
			recurrence.DailyChecklistRule(),
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create daily check list"})
			return
		}
		h.broadcastTodo(workspaceID.(int), "todo_list", "created", list)
		c.JSON(http.StatusCreated, list)
		return
	}

	var listDate any
	if req.ListDate != "" {
		listDate = req.ListDate
	}

	result, err := h.DB.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date)
		VALUES (?, ?, ?, ?)`, workspaceID, req.Name, kind, listDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create todo list"})
		return
	}

	id64, _ := result.LastInsertId()
	list := todoListPayload{
		ID: int(id64), WorkspaceID: workspaceID.(int), Name: req.Name, Kind: kind,
	}
	if req.ListDate != "" {
		list.ListDate = &req.ListDate
	}

	h.broadcastTodo(workspaceID.(int), "todo_list", "created", list)
	c.JSON(http.StatusCreated, list)
}

type updateListRequest struct {
	Name        string `json:"name" binding:"required"`
	Kind        string `json:"kind"`
	ListDate    string `json:"list_date"`
	Recurrence  string `json:"recurrence"`
	PeriodScope string `json:"period_scope"`
}

type todoListRow struct {
	ID       int
	Kind     string
	SeriesID sql.NullInt64
	ListDate sql.NullTime
	Name     string
}

func (h *TodoHandler) UpdateList(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	listID := c.Param("listId")

	var req updateListRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.loadTodoListRow(workspaceID.(int), listID)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "todo list not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo list"})
		return
	}

	var updated todoListPayload
	if row.Kind == "series" {
		updated, err = h.updateCheckListSeries(workspaceID.(int), row.ID, row.ID, req)
	} else if row.SeriesID.Valid {
		updated, err = h.updateCheckListSeries(workspaceID.(int), int(row.SeriesID.Int64), row.ID, req)
	} else {
		updated, err = h.updateCheckListStandalone(workspaceID.(int), row, req)
	}
	if err != nil {
		switch {
		case errors.Is(err, errInvalidListDate), errors.Is(err, errInvalidRecurrence), errors.Is(err, errUnsupportedListKind):
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		default:
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update todo list"})
		}
		return
	}

	h.broadcastTodo(workspaceID.(int), "todo_list", "updated", updated)
	c.JSON(http.StatusOK, updated)
}

func (h *TodoHandler) DeleteList(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	listID := c.Param("listId")
	occurrence := strings.TrimSpace(c.Query("occurrence"))

	var kind string
	var seriesID sql.NullInt64
	var listDate sql.NullTime
	err := h.DB.QueryRow(`
		SELECT kind, series_id, list_date
		FROM todo_lists WHERE id = ? AND workspace_id = ?`, listID, workspaceID,
	).Scan(&kind, &seriesID, &listDate)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "todo list not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo list"})
		return
	}

	if kind == "series" && occurrence != "" {
		occurrenceAt, err := time.Parse("2006-01-02", occurrence)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid occurrence"})
			return
		}
		seriesIDInt, err := strconv.Atoi(listID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid list id"})
			return
		}
		store := recurrence.Store{DB: h.DB}
		if err := store.UpsertException(
			workspaceID.(int),
			recurrence.EntityTodoList,
			seriesIDInt,
			recurrence.DateOnlyUTC(occurrenceAt),
			recurrence.ActionCancelled,
			"",
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not skip recurring check list"})
			return
		}
		h.broadcastTodo(workspaceID.(int), "todo_list", "deleted", gin.H{"id": listID, "occurrence": occurrence})
		c.JSON(http.StatusOK, gin.H{"message": "check list occurrence skipped"})
		return
	}

	if kind == "series" {
		result, err := h.DB.Exec(
			"DELETE FROM todo_lists WHERE id = ? AND workspace_id = ?",
			listID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete todo list"})
			return
		}
		rows, _ := result.RowsAffected()
		if rows == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "todo list not found"})
			return
		}
		h.broadcastTodo(workspaceID.(int), "todo_list", "deleted", gin.H{"id": listID})
		c.JSON(http.StatusOK, gin.H{"message": "todo list deleted"})
		return
	}

	if seriesID.Valid && listDate.Valid {
		store := recurrence.Store{DB: h.DB}
		if err := store.UpsertException(
			workspaceID.(int),
			recurrence.EntityTodoList,
			int(seriesID.Int64),
			listDate.Time,
			recurrence.ActionCancelled,
			"",
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not skip recurring check list"})
			return
		}
	}

	result, err := h.DB.Exec(
		"DELETE FROM todo_lists WHERE id = ? AND workspace_id = ?",
		listID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete todo list"})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "todo list not found"})
		return
	}

	h.broadcastTodo(workspaceID.(int), "todo_list", "deleted", gin.H{"id": listID})
	c.JSON(http.StatusOK, gin.H{"message": "todo list deleted"})
}

func (h *TodoHandler) EnsureDailyList(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	date := c.Param("date")

	var listID sql.NullInt64
	err := h.DB.QueryRow(`
		SELECT id FROM todo_lists
		WHERE workspace_id = ? AND kind = 'daily' AND list_date = ? AND series_id IS NULL
		ORDER BY id ASC LIMIT 1`,
		workspaceID, date,
	).Scan(&listID)
	if err != nil && err != sql.ErrNoRows {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load daily list"})
		return
	}

	response := gin.H{"date": date}
	if listID.Valid {
		response["list_id"] = listID.Int64
	} else {
		response["list_id"] = nil
	}

	c.JSON(http.StatusOK, response)
}

func (h *TodoHandler) ListTodos(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	listIDRaw := c.Query("list_id")
	occurrence := strings.TrimSpace(c.Query("occurrence"))

	query := `
		SELECT id, workspace_id, list_id, title, completed, due_date, position, created_by
		FROM todos WHERE workspace_id = ?`
	args := []any{workspaceID}

	templateListID := 0
	seriesID := 0
	isSeriesTemplate := false

	if listIDRaw != "" {
		listID, err := strconv.Atoi(listIDRaw)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid list_id"})
			return
		}
		templateListID, seriesID, isSeriesTemplate, err = h.resolveTodoTemplateList(workspaceID.(int), listID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "todo list not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo list"})
			return
		}
		query += " AND list_id = ?"
		args = append(args, templateListID)
	}
	query += " ORDER BY completed ASC, position ASC, id ASC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todos"})
		return
	}
	defer rows.Close()

	todos := []todoPayload{}
	for rows.Next() {
		var todo todoPayload
		var dueDate sql.NullString
		if err := rows.Scan(
			&todo.ID, &todo.WorkspaceID, &todo.ListID, &todo.Title, &todo.Completed,
			&dueDate, &todo.Position, &todo.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read todo"})
			return
		}
		if dueDate.Valid {
			todo.DueDate = &dueDate.String
		}
		todos = append(todos, todo)
	}

	if len(todos) == 0 && isSeriesTemplate {
		legacyListID, legacyErr := h.findLegacyInstanceListWithTodos(workspaceID.(int), seriesID)
		if legacyErr == nil {
			todos, err = h.loadTodosForListID(workspaceID.(int), legacyListID)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todos"})
				return
			}
			for i := range todos {
				todos[i].ListID = templateListID
			}
		}
	}

	if isSeriesTemplate && occurrence != "" {
		completions, err := h.loadTodoCompletions(workspaceID.(int), seriesID, occurrence)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo completions"})
			return
		}
		for i := range todos {
			if completed, ok := completions[todos[i].ID]; ok {
				todos[i].Completed = completed
			} else {
				todos[i].Completed = false
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"todos": todos})
}

func (h *TodoHandler) CreateTodo(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req createTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var dueDate any
	if req.DueDate != "" {
		dueDate = req.DueDate
	}

	result, err := h.DB.Exec(`
		INSERT INTO todos (workspace_id, list_id, title, due_date, created_by)
		VALUES (?, ?, ?, ?, ?)`, workspaceID, req.ListID, req.Title, dueDate, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create todo"})
		return
	}

	id64, _ := result.LastInsertId()
	todo := todoPayload{
		ID: int(id64), WorkspaceID: workspaceID.(int), ListID: req.ListID,
		Title: req.Title, CreatedBy: userID.(int),
	}
	if req.DueDate != "" {
		todo.DueDate = &req.DueDate
	}

	h.broadcastTodo(workspaceID.(int), "todo", "created", todo)
	c.JSON(http.StatusCreated, todo)
}

func (h *TodoHandler) UpdateTodo(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	todoID := c.Param("todoId")
	todoIDInt, err := strconv.Atoi(todoID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid todo id"})
		return
	}

	var req updateTodoRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Title != nil {
		_, err := h.DB.Exec(
			"UPDATE todos SET title = ? WHERE id = ? AND workspace_id = ?",
			*req.Title, todoID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update todo"})
			return
		}
	}

	if req.Completed != nil {
		seriesID, isSeries, err := h.todoBelongsToSeries(workspaceID.(int), todoID)
		if err == sql.ErrNoRows {
			c.JSON(http.StatusNotFound, gin.H{"error": "todo not found"})
			return
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo"})
			return
		}

		if isSeries {
			occurrence := strings.TrimSpace(req.Occurrence)
			if occurrence == "" {
				occurrence = strings.TrimSpace(c.Query("occurrence"))
			}
			if occurrence == "" {
				c.JSON(http.StatusBadRequest, gin.H{"error": "occurrence is required for recurring check list tasks"})
				return
			}
			if _, err := time.Parse("2006-01-02", occurrence); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid occurrence"})
				return
			}
			if err := h.upsertTodoCompletion(workspaceID.(int), seriesID, todoIDInt, occurrence, *req.Completed); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update todo"})
				return
			}
		} else {
			_, err := h.DB.Exec(
				"UPDATE todos SET completed = ? WHERE id = ? AND workspace_id = ?",
				*req.Completed, todoID, workspaceID,
			)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update todo"})
				return
			}
		}
	}

	h.broadcastTodo(workspaceID.(int), "todo", "updated", gin.H{"id": todoID})
	c.JSON(http.StatusOK, gin.H{"message": "todo updated"})
}

func (h *TodoHandler) DeleteTodo(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	todoID := c.Param("todoId")

	result, err := h.DB.Exec(
		"DELETE FROM todos WHERE id = ? AND workspace_id = ?",
		todoID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete todo"})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "todo not found"})
		return
	}

	h.broadcastTodo(workspaceID.(int), "todo", "deleted", gin.H{"id": todoID})
	c.JSON(http.StatusOK, gin.H{"message": "todo deleted"})
}

func (h *TodoHandler) ListNotes(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	listID := c.Query("list_id")

	query := `
		SELECT id, workspace_id, list_id, title, content, created_by, updated_at
		FROM notes WHERE workspace_id = ?`
	args := []any{workspaceID}
	if listID != "" {
		query += " AND list_id = ?"
		args = append(args, listID)
	}
	query += " ORDER BY updated_at DESC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load notes"})
		return
	}
	defer rows.Close()

	notes := []notePayload{}
	for rows.Next() {
		var note notePayload
		var listRef sql.NullInt64
		if err := rows.Scan(
			&note.ID, &note.WorkspaceID, &listRef, &note.Title, &note.Content,
			&note.CreatedBy, &note.UpdatedAt,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read note"})
			return
		}
		if listRef.Valid {
			id := int(listRef.Int64)
			note.ListID = &id
		}
		notes = append(notes, note)
	}

	c.JSON(http.StatusOK, gin.H{"notes": notes})
}

func (h *TodoHandler) CreateNote(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req createNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var listID any
	if req.ListID != nil {
		listID = *req.ListID
	}

	result, err := h.DB.Exec(`
		INSERT INTO notes (workspace_id, list_id, title, content, created_by)
		VALUES (?, ?, ?, ?, ?)`, workspaceID, listID, req.Title, req.Content, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create note"})
		return
	}

	id64, _ := result.LastInsertId()
	note := notePayload{
		ID: int(id64), WorkspaceID: workspaceID.(int), ListID: req.ListID,
		Title: req.Title, Content: req.Content, CreatedBy: userID.(int), UpdatedAt: time.Now(),
	}

	h.broadcastTodo(workspaceID.(int), "note", "created", note)
	c.JSON(http.StatusCreated, note)
}

func (h *TodoHandler) UpdateNote(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	noteID := c.Param("noteId")

	var req updateNoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Title == nil && req.Content == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nothing to update"})
		return
	}

	if req.Title != nil {
		_, err := h.DB.Exec(
			"UPDATE notes SET title = ? WHERE id = ? AND workspace_id = ?",
			*req.Title, noteID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update note"})
			return
		}
	}

	if req.Content != nil {
		_, err := h.DB.Exec(
			"UPDATE notes SET content = ? WHERE id = ? AND workspace_id = ?",
			*req.Content, noteID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update note"})
			return
		}
	}

	h.broadcastTodo(workspaceID.(int), "note", "updated", gin.H{"id": noteID})
	c.JSON(http.StatusOK, gin.H{"message": "note updated"})
}

func (h *TodoHandler) DeleteNote(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	noteID := c.Param("noteId")

	result, err := h.DB.Exec(
		"DELETE FROM notes WHERE id = ? AND workspace_id = ?",
		noteID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete note"})
		return
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "note not found"})
		return
	}

	h.broadcastTodo(workspaceID.(int), "note", "deleted", gin.H{"id": noteID})
	c.JSON(http.StatusOK, gin.H{"message": "note deleted"})
}

func (h *TodoHandler) createPeriodicSeries(workspaceID int, name, periodStart, scope string) (todoListPayload, error) {
	rrule := recurrence.PeriodicChecklistRule(scope)
	tx, err := h.DB.Begin()
	if err != nil {
		return todoListPayload{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date, recurrence)
		VALUES (?, ?, 'series', ?, ?)`, workspaceID, name, periodStart, rrule)
	if err != nil {
		return todoListPayload{}, err
	}
	seriesID64, _ := result.LastInsertId()
	seriesID := int(seriesID64)

	if err := tx.Commit(); err != nil {
		return todoListPayload{}, err
	}

	seriesIDRef := seriesID
	return todoListPayload{
		ID:          seriesID,
		WorkspaceID: workspaceID,
		Name:        name,
		Kind:        "periodic",
		ListDate:    &periodStart,
		Recurrence:  rrule,
		IsRecurring: true,
		SeriesID:    &seriesIDRef,
		PeriodScope: scope,
	}, nil
}

func (h *TodoHandler) createRecurringSeries(workspaceID int, name, listDate, rrule string) (todoListPayload, error) {
	tx, err := h.DB.Begin()
	if err != nil {
		return todoListPayload{}, err
	}
	defer tx.Rollback()

	result, err := tx.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date, recurrence)
		VALUES (?, ?, 'series', ?, ?)`, workspaceID, name, listDate, rrule)
	if err != nil {
		return todoListPayload{}, err
	}
	seriesID64, _ := result.LastInsertId()
	seriesID := int(seriesID64)

	if err := tx.Commit(); err != nil {
		return todoListPayload{}, err
	}

	seriesIDRef := seriesID
	occAt, _ := time.Parse("2006-01-02", listDate)
	return todoListPayload{
		ID:           seriesID,
		WorkspaceID:  workspaceID,
		Name:         name,
		Kind:         "daily",
		ListDate:     &listDate,
		Recurrence:   rrule,
		IsRecurring:  true,
		SeriesID:     &seriesIDRef,
		OccurrenceID: recurrence.OccurrenceID(seriesID, recurrence.DateOnlyUTC(occAt), true),
	}, nil
}

func appendStandaloneDailyOccurrences(lists []todoListPayload, queryDate string, anchors []todoListPayload) []todoListPayload {
	day, err := time.Parse("2006-01-02", queryDate)
	if err != nil {
		return lists
	}
	dayUTC := recurrence.DateOnlyUTC(day)

	for _, anchor := range anchors {
		if anchor.ListDate == nil {
			continue
		}
		start, err := time.Parse("2006-01-02", *anchor.ListDate)
		if err != nil {
			continue
		}
		if dayUTC.Before(recurrence.DateOnlyUTC(start)) {
			continue
		}
		seriesID := anchor.ID
		virtual := anchor
		dateStr := queryDate
		virtual.ListDate = &dateStr
		virtual.IsRecurring = true
		virtual.SeriesID = &seriesID
		virtual.OccurrenceID = recurrence.OccurrenceID(anchor.ID, dayUTC, true)
		lists = append(lists, virtual)
	}
	return lists
}

func appendStandaloneDailyOccurrencesForRange(
	lists []todoListPayload,
	from, to time.Time,
	anchors []todoListPayload,
) []todoListPayload {
	for day := from; !day.After(to); day = day.AddDate(0, 0, 1) {
		lists = appendStandaloneDailyOccurrences(lists, day.Format("2006-01-02"), anchors)
	}
	return lists
}

func (h *TodoHandler) loadTodoSeriesRows(workspaceID int) ([]todoSeriesRow, error) {
	rows, err := h.DB.Query(`
		SELECT id, workspace_id, name, list_date, COALESCE(recurrence, '')
		FROM todo_lists
		WHERE workspace_id = ? AND kind = 'series'`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	seriesRows := []todoSeriesRow{}
	for rows.Next() {
		var row todoSeriesRow
		if err := rows.Scan(&row.ID, &row.WorkspaceID, &row.Name, &row.ListDate, &row.Recurrence); err != nil {
			return nil, err
		}
		if !recurrence.IsRecurring(row.Recurrence) {
			continue
		}
		seriesRows = append(seriesRows, row)
	}
	return seriesRows, nil
}

func (h *TodoHandler) loadTodoSeriesRowByID(workspaceID, seriesID int) (todoSeriesRow, error) {
	var row todoSeriesRow
	err := h.DB.QueryRow(`
		SELECT id, workspace_id, name, list_date, COALESCE(recurrence, '')
		FROM todo_lists
		WHERE workspace_id = ? AND id = ? AND kind = 'series'`, workspaceID, seriesID,
	).Scan(&row.ID, &row.WorkspaceID, &row.Name, &row.ListDate, &row.Recurrence)
	return row, err
}

func seriesRowToManagementPayload(row todoSeriesRow) todoListPayload {
	seriesID := row.ID
	anchor := row.ListDate.Format("2006-01-02")
	rule := recurrence.NormalizeRule(row.Recurrence)
	payload := todoListPayload{
		ID:          row.ID,
		WorkspaceID: row.WorkspaceID,
		Name:        row.Name,
		ListDate:    &anchor,
		Recurrence:  rule,
		IsRecurring: true,
		SeriesID:    &seriesID,
	}
	if scope, ok := recurrence.ParsePeriodScope(row.Recurrence); ok {
		payload.Kind = "periodic"
		payload.PeriodScope = scope
	} else if recurrence.IsDailyChecklistRule(row.Recurrence) {
		payload.Kind = "daily"
	} else {
		payload.Kind = "daily"
	}
	return payload
}

func (h *TodoHandler) appendVirtualCheckListsForDate(
	lists []todoListPayload,
	date string,
	seriesRows []todoSeriesRow,
	exceptionMap map[int][]recurrence.Exception,
) ([]todoListPayload, error) {
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return nil, err
	}
	dayUTC := recurrence.DateOnlyUTC(day)

	for _, row := range seriesRows {
		if scope, ok := recurrence.ParsePeriodScope(row.Recurrence); ok {
			if dayUTC.Before(recurrence.DateOnlyUTC(row.ListDate)) {
				continue
			}
			periodStart := recurrence.PeriodStartUTC(dayUTC, scope)
			seriesPeriodStart := recurrence.PeriodStartUTC(row.ListDate, scope)
			if periodStart.Before(seriesPeriodStart) {
				continue
			}
			if ex := recurrence.FindException(exceptionMap[row.ID], periodStart, true); ex != nil && ex.Action == recurrence.ActionCancelled {
				continue
			}
			periodEnd := recurrence.PeriodEndUTC(periodStart, scope)
			spanStart := periodStart
			seriesAnchor := recurrence.DateOnlyUTC(row.ListDate)
			if seriesAnchor.After(spanStart) {
				spanStart = seriesAnchor
			}
			if dayUTC.Before(spanStart) || dayUTC.After(periodEnd) {
				continue
			}
			lists = append(lists, seriesPeriodOccurrencePayload(row, periodStart, periodEnd, spanStart, scope))
			continue
		}

		from := recurrence.DateOnlyUTC(day)
		to := recurrence.DateOnlyEndUTC(day)
		series := recurrence.Series{
			ID: row.ID, StartAt: recurrence.DateOnlyUTC(row.ListDate),
			RRule: row.Recurrence, DateOnly: true,
		}
		occurrences := recurrence.ExpandSeries(series, from, to, exceptionMap[row.ID])
		for _, at := range occurrences {
			lists = append(lists, seriesOccurrencePayload(row, at, ""))
		}
	}
	return lists, nil
}

func (h *TodoHandler) appendVirtualCheckListsForRange(
	lists []todoListPayload,
	from, to time.Time,
	seriesRows []todoSeriesRow,
	exceptionMap map[int][]recurrence.Exception,
) []todoListPayload {
	for _, row := range seriesRows {
		if scope, ok := recurrence.ParsePeriodScope(row.Recurrence); ok {
			seriesAnchor := recurrence.DateOnlyUTC(row.ListDate)
			seriesPeriodStart := recurrence.PeriodStartUTC(row.ListDate, scope)
			periodStart := recurrence.PeriodStartUTC(from, scope)
			if periodStart.Before(seriesPeriodStart) {
				periodStart = seriesPeriodStart
			}

			for !periodStart.After(to) {
				periodEnd := recurrence.PeriodEndUTC(periodStart, scope)
				if periodEnd.Before(from) {
					periodStart = recurrence.NextPeriodStartUTC(periodStart, scope)
					continue
				}
				if seriesAnchor.After(periodEnd) {
					break
				}
				spanStart := periodStart
				if seriesAnchor.After(spanStart) {
					spanStart = seriesAnchor
				}
				if spanStart.After(to) {
					break
				}
				if ex := recurrence.FindException(exceptionMap[row.ID], periodStart, true); ex != nil && ex.Action == recurrence.ActionCancelled {
					periodStart = recurrence.NextPeriodStartUTC(periodStart, scope)
					continue
				}
				lists = append(lists, seriesPeriodOccurrencePayload(row, periodStart, periodEnd, spanStart, scope))
				periodStart = recurrence.NextPeriodStartUTC(periodStart, scope)
			}
			continue
		}

		series := recurrence.Series{
			ID: row.ID, StartAt: recurrence.DateOnlyUTC(row.ListDate),
			RRule: row.Recurrence, DateOnly: true,
		}
		occurrences := recurrence.ExpandSeries(series, from, to, exceptionMap[row.ID])
		for _, at := range occurrences {
			lists = append(lists, seriesOccurrencePayload(row, at, ""))
		}
	}
	return lists
}

func seriesPeriodOccurrencePayload(row todoSeriesRow, periodStart, periodEnd, spanStart time.Time, scope string) todoListPayload {
	periodStartStr := periodStart.Format("2006-01-02")
	periodEndStr := periodEnd.Format("2006-01-02")
	spanStartStr := spanStart.Format("2006-01-02")
	seriesID := row.ID
	return todoListPayload{
		ID:           row.ID,
		WorkspaceID:  row.WorkspaceID,
		Name:         row.Name,
		Kind:         "periodic",
		ListDate:     &periodStartStr,
		SpanStart:    &spanStartStr,
		PeriodEnd:    &periodEndStr,
		Recurrence:   recurrence.NormalizeRule(row.Recurrence),
		IsRecurring:  true,
		SeriesID:     &seriesID,
		OccurrenceID: recurrence.OccurrenceID(row.ID, periodStart, true),
		PeriodScope:  scope,
	}
}

func seriesOccurrencePayload(row todoSeriesRow, at time.Time, scope string) todoListPayload {
	atStr := at.Format("2006-01-02")
	seriesID := row.ID
	kind := "daily"
	if scope != "" {
		kind = "periodic"
	} else if !recurrence.IsDailyChecklistRule(row.Recurrence) {
		kind = "daily"
	}
	return todoListPayload{
		ID:           row.ID,
		WorkspaceID:  row.WorkspaceID,
		Name:         row.Name,
		Kind:         kind,
		ListDate:     &atStr,
		Recurrence:   recurrence.NormalizeRule(row.Recurrence),
		IsRecurring:  true,
		SeriesID:     &seriesID,
		OccurrenceID: recurrence.OccurrenceID(row.ID, at, true),
		PeriodScope:  scope,
	}
}

func (h *TodoHandler) resolveTodoTemplateList(workspaceID, listID int) (templateListID, seriesID int, isSeries bool, err error) {
	var kind string
	var series sql.NullInt64
	err = h.DB.QueryRow(`
		SELECT kind, series_id FROM todo_lists WHERE id = ? AND workspace_id = ?`, listID, workspaceID,
	).Scan(&kind, &series)
	if err != nil {
		return 0, 0, false, err
	}
	if kind == "series" {
		return listID, listID, true, nil
	}
	if kind == "daily" {
		return listID, listID, true, nil
	}
	if series.Valid {
		return int(series.Int64), int(series.Int64), true, nil
	}
	return listID, 0, false, nil
}

func (h *TodoHandler) findLegacyInstanceListWithTodos(workspaceID, seriesID int) (int, error) {
	var listID int
	err := h.DB.QueryRow(`
		SELECT tl.id
		FROM todo_lists tl
		INNER JOIN todos t ON t.list_id = tl.id AND t.workspace_id = tl.workspace_id
		WHERE tl.workspace_id = ? AND tl.series_id = ?
		ORDER BY tl.id ASC
		LIMIT 1`, workspaceID, seriesID,
	).Scan(&listID)
	return listID, err
}

func (h *TodoHandler) loadTodosForListID(workspaceID, listID int) ([]todoPayload, error) {
	rows, err := h.DB.Query(`
		SELECT id, workspace_id, list_id, title, completed, due_date, position, created_by
		FROM todos WHERE workspace_id = ? AND list_id = ?
		ORDER BY completed ASC, position ASC, id ASC`, workspaceID, listID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	todos := []todoPayload{}
	for rows.Next() {
		var todo todoPayload
		var dueDate sql.NullString
		if err := rows.Scan(
			&todo.ID, &todo.WorkspaceID, &todo.ListID, &todo.Title, &todo.Completed,
			&dueDate, &todo.Position, &todo.CreatedBy,
		); err != nil {
			return nil, err
		}
		if dueDate.Valid {
			todo.DueDate = &dueDate.String
		}
		todos = append(todos, todo)
	}
	return todos, nil
}

func (h *TodoHandler) loadTodoCompletions(workspaceID, seriesID int, occurrence string) (map[int]bool, error) {
	rows, err := h.DB.Query(`
		SELECT todo_id, completed
		FROM todo_occurrence_completions
		WHERE workspace_id = ? AND series_id = ? AND occurrence_at = ?`,
		workspaceID, seriesID, occurrence)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	completions := map[int]bool{}
	for rows.Next() {
		var todoID int
		var completed bool
		if err := rows.Scan(&todoID, &completed); err != nil {
			return nil, err
		}
		completions[todoID] = completed
	}
	return completions, nil
}

func (h *TodoHandler) upsertTodoCompletion(workspaceID, seriesID, todoID int, occurrence string, completed bool) error {
	_, err := h.DB.Exec(`
		INSERT INTO todo_occurrence_completions (workspace_id, series_id, occurrence_at, todo_id, completed)
		VALUES (?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE completed = VALUES(completed)`,
		workspaceID, seriesID, occurrence, todoID, completed)
	return err
}

func (h *TodoHandler) todoBelongsToSeries(workspaceID int, todoID string) (seriesID int, isSeries bool, err error) {
	var listKind string
	var listSeriesID sql.NullInt64
	var listID int
	err = h.DB.QueryRow(`
		SELECT tl.kind, tl.series_id, tl.id
		FROM todos t
		INNER JOIN todo_lists tl ON tl.id = t.list_id
		WHERE t.id = ? AND t.workspace_id = ?`, todoID, workspaceID,
	).Scan(&listKind, &listSeriesID, &listID)
	if err != nil {
		return 0, false, err
	}
	if listKind == "series" || listKind == "daily" {
		return listID, true, nil
	}
	if listSeriesID.Valid {
		return int(listSeriesID.Int64), true, nil
	}
	return 0, false, nil
}

func scanTodoListPayload(rows *sql.Rows) (todoListPayload, error) {
	var list todoListPayload
	var listDate sql.NullTime
	var seriesID sql.NullInt64
	var recurrenceRule string
	if err := rows.Scan(
		&list.ID, &list.WorkspaceID, &list.Name, &list.Kind, &listDate, &seriesID, &recurrenceRule,
	); err != nil {
		return todoListPayload{}, err
	}
	if listDate.Valid {
		formatted := listDate.Time.Format("2006-01-02")
		list.ListDate = &formatted
	}
	if seriesID.Valid {
		id := int(seriesID.Int64)
		list.SeriesID = &id
	}
	list.Recurrence = recurrence.NormalizeRule(recurrenceRule)
	list.IsRecurring = recurrence.IsRecurring(list.Recurrence)
	if scope, ok := recurrence.ParsePeriodScope(list.Recurrence); ok {
		list.PeriodScope = scope
	}
	if list.Kind == "weekly" {
		list.Kind = "periodic"
		if list.PeriodScope == "" {
			list.PeriodScope = "week"
		}
	}
	return list, nil
}

func normalizePeriodScope(periodScope, kind string) string {
	scope := strings.ToLower(strings.TrimSpace(periodScope))
	if scope == "week" || scope == "month" || scope == "year" {
		return scope
	}
	if strings.EqualFold(kind, "periodic") {
		return "week"
	}
	if strings.EqualFold(kind, "weekly") {
		return "week"
	}
	return ""
}

func (h *TodoHandler) loadTodoListRow(workspaceID int, listID string) (todoListRow, error) {
	var row todoListRow
	err := h.DB.QueryRow(`
		SELECT id, kind, series_id, list_date, name
		FROM todo_lists WHERE id = ? AND workspace_id = ?`, listID, workspaceID,
	).Scan(&row.ID, &row.Kind, &row.SeriesID, &row.ListDate, &row.Name)
	return row, err
}

func (h *TodoHandler) getListPayloadByID(workspaceID, listID int) (todoListPayload, error) {
	row := h.DB.QueryRow(`
		SELECT tl.id, tl.workspace_id, tl.name, tl.kind, tl.list_date, tl.series_id,
			COALESCE(parent.recurrence, tl.recurrence, '')
		FROM todo_lists tl
		LEFT JOIN todo_lists parent ON parent.id = tl.series_id
		WHERE tl.workspace_id = ? AND tl.id = ? AND tl.kind != 'series'`, workspaceID, listID)

	var list todoListPayload
	var listDate sql.NullTime
	var seriesID sql.NullInt64
	var recurrenceRule string
	if err := row.Scan(
		&list.ID, &list.WorkspaceID, &list.Name, &list.Kind, &listDate, &seriesID, &recurrenceRule,
	); err != nil {
		return todoListPayload{}, err
	}
	if listDate.Valid {
		formatted := listDate.Time.Format("2006-01-02")
		list.ListDate = &formatted
	}
	if seriesID.Valid {
		id := int(seriesID.Int64)
		list.SeriesID = &id
	}
	list.Recurrence = recurrence.NormalizeRule(recurrenceRule)
	list.IsRecurring = recurrence.IsRecurring(list.Recurrence)
	if scope, ok := recurrence.ParsePeriodScope(list.Recurrence); ok {
		list.PeriodScope = scope
	}
	if list.Kind == "weekly" {
		list.Kind = "periodic"
		if list.PeriodScope == "" {
			list.PeriodScope = "week"
		}
	}
	return list, nil
}

func (h *TodoHandler) updateCheckListStandalone(workspaceID int, row todoListRow, req updateListRequest) (todoListPayload, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return todoListPayload{}, sql.ErrNoRows
	}

	switch row.Kind {
	case "general":
		_, err := h.DB.Exec(
			`UPDATE todo_lists SET name = ? WHERE id = ? AND workspace_id = ?`,
			name, row.ID, workspaceID,
		)
		if err != nil {
			return todoListPayload{}, err
		}
	case "daily":
		listDate := req.ListDate
		if listDate == "" && row.ListDate.Valid {
			listDate = row.ListDate.Time.Format("2006-01-02")
		}
		if listDate == "" {
			return todoListPayload{}, errInvalidListDate
		}
		_, err := h.DB.Exec(
			`UPDATE todo_lists SET name = ?, list_date = ? WHERE id = ? AND workspace_id = ?`,
			name, listDate, row.ID, workspaceID,
		)
		if err != nil {
			return todoListPayload{}, err
		}
	default:
		return todoListPayload{}, errUnsupportedListKind
	}

	return h.getListPayloadByID(workspaceID, row.ID)
}

func (h *TodoHandler) updateCheckListSeries(workspaceID, seriesID, instanceID int, req updateListRequest) (todoListPayload, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return todoListPayload{}, sql.ErrNoRows
	}

	periodScope := normalizePeriodScope(req.PeriodScope, req.Kind)
	rrule := recurrence.NormalizeRule(req.Recurrence)

	var recurrenceRule string
	var anchorDate string

	switch {
	case periodScope != "":
		anchor := req.ListDate
		if anchor == "" {
			anchor = time.Now().Format("2006-01-02")
		}
		periodStart, err := recurrence.PeriodStartFromISODate(anchor, periodScope)
		if err != nil {
			return todoListPayload{}, err
		}
		recurrenceRule = recurrence.PeriodicChecklistRule(periodScope)
		anchorDate = periodStart.Format("2006-01-02")
	case recurrence.IsRecurring(rrule):
		if req.ListDate == "" {
			return todoListPayload{}, errInvalidListDate
		}
		recurrenceRule = rrule
		anchorDate = req.ListDate
	default:
		return todoListPayload{}, errInvalidRecurrence
	}

	tx, err := h.DB.Begin()
	if err != nil {
		return todoListPayload{}, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec(
		`UPDATE todo_lists SET name = ?, list_date = ?, recurrence = ? WHERE id = ? AND workspace_id = ? AND kind = 'series'`,
		name, anchorDate, recurrenceRule, seriesID, workspaceID,
	); err != nil {
		return todoListPayload{}, err
	}

	if err := tx.Commit(); err != nil {
		return todoListPayload{}, err
	}

	row, err := h.loadTodoSeriesRowByID(workspaceID, seriesID)
	if err != nil {
		return todoListPayload{}, err
	}
	return seriesRowToManagementPayload(row), nil
}

var (
	errInvalidListDate     = errors.New("invalid list_date")
	errInvalidRecurrence   = errors.New("invalid recurrence schedule")
	errUnsupportedListKind = errors.New("unsupported list kind")
)

func (h *TodoHandler) broadcastTodo(workspaceID int, entity, action string, payload any) {
	raw, _ := json.Marshal(payload)
	h.Hub.BroadcastWorkspace(workspaceID, hub.Message{
		Type: "update", Entity: entity, Action: action, Payload: raw,
	})
}
