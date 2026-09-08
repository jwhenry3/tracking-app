package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
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
	ID          int     `json:"id"`
	WorkspaceID int     `json:"workspace_id"`
	Name        string  `json:"name"`
	Kind        string  `json:"kind"`
	ListDate    *string `json:"list_date"`
	Recurrence  string  `json:"recurrence"`
	IsRecurring bool    `json:"is_recurring"`
	SeriesID    *int    `json:"series_id"`
	PeriodScope string  `json:"period_scope"`
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
	Title     *string `json:"title"`
	Completed *bool   `json:"completed"`
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

	if listDate != "" {
		if err := h.ensureSeriesInstancesForDate(workspaceID.(int), listDate); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not prepare check lists"})
			return
		}
	}

	query := `
		SELECT tl.id, tl.workspace_id, tl.name, tl.kind, tl.list_date, tl.series_id,
			COALESCE(parent.recurrence, tl.recurrence, '')
		FROM todo_lists tl
		LEFT JOIN todo_lists parent ON parent.id = tl.series_id
		WHERE tl.workspace_id = ? AND tl.kind != 'series'`
	args := []any{workspaceID}

	if listDate != "" {
		weekStart, err := recurrence.PeriodStartFromISODate(listDate, "week")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date"})
			return
		}
		monthStart, err := recurrence.PeriodStartFromISODate(listDate, "month")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date"})
			return
		}
		yearStart, err := recurrence.PeriodStartFromISODate(listDate, "year")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid date"})
			return
		}
		query += ` AND (
			tl.kind = 'general'
			OR (tl.kind = 'daily' AND tl.list_date = ?)
			OR (tl.kind IN ('periodic', 'weekly') AND tl.list_date IN (?, ?, ?))
		)`
		args = append(
			args,
			listDate,
			weekStart.Format("2006-01-02"),
			monthStart.Format("2006-01-02"),
			yearStart.Format("2006-01-02"),
		)
	}
	query += " ORDER BY tl.kind ASC, tl.list_date DESC, tl.name ASC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo lists"})
		return
	}
	defer rows.Close()

	lists := []todoListPayload{}
	for rows.Next() {
		list, err := scanTodoListPayload(rows)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read todo list"})
			return
		}
		lists = append(lists, list)
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
	if row.Kind == "series" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot edit series rows directly"})
		return
	}

	var updated todoListPayload
	if row.SeriesID.Valid {
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

	if err := h.ensureSeriesInstancesForDate(workspaceID.(int), date); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not prepare daily lists"})
		return
	}

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
	listID := c.Query("list_id")

	query := `
		SELECT id, workspace_id, list_id, title, completed, due_date, position, created_by
		FROM todos WHERE workspace_id = ?`
	args := []any{workspaceID}
	if listID != "" {
		query += " AND list_id = ?"
		args = append(args, listID)
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
		_, err := h.DB.Exec(
			"UPDATE todos SET completed = ? WHERE id = ? AND workspace_id = ?",
			*req.Completed, todoID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update todo"})
			return
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

	instanceID, err := h.insertPeriodicInstanceTx(tx, workspaceID, seriesID, name, periodStart)
	if err != nil {
		return todoListPayload{}, err
	}

	if err := tx.Commit(); err != nil {
		return todoListPayload{}, err
	}

	seriesIDRef := seriesID
	return todoListPayload{
		ID:          instanceID,
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

	instanceID, err := h.insertDailyInstanceTx(tx, workspaceID, seriesID, name, listDate)
	if err != nil {
		return todoListPayload{}, err
	}

	if err := tx.Commit(); err != nil {
		return todoListPayload{}, err
	}

	seriesIDRef := seriesID
	return todoListPayload{
		ID:          instanceID,
		WorkspaceID: workspaceID,
		Name:        name,
		Kind:        "daily",
		ListDate:    &listDate,
		Recurrence:  rrule,
		IsRecurring: true,
		SeriesID:    &seriesIDRef,
	}, nil
}

func (h *TodoHandler) insertPeriodicInstanceTx(tx *sql.Tx, workspaceID, seriesID int, name, periodStart string) (int, error) {
	var existingID int
	err := tx.QueryRow(`
		SELECT id FROM todo_lists
		WHERE workspace_id = ? AND series_id = ? AND kind IN ('periodic', 'weekly') AND list_date = ?`,
		workspaceID, seriesID, periodStart,
	).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}

	result, err := tx.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date, series_id)
		VALUES (?, ?, 'periodic', ?, ?)`, workspaceID, name, periodStart, seriesID)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func (h *TodoHandler) insertDailyInstanceTx(tx *sql.Tx, workspaceID, seriesID int, name, listDate string) (int, error) {
	var existingID int
	err := tx.QueryRow(`
		SELECT id FROM todo_lists
		WHERE workspace_id = ? AND series_id = ? AND list_date = ?`,
		workspaceID, seriesID, listDate,
	).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}

	result, err := tx.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date, series_id)
		VALUES (?, ?, 'daily', ?, ?)`, workspaceID, name, listDate, seriesID)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func (h *TodoHandler) ensureSeriesInstancesForDate(workspaceID int, date string) error {
	day, err := time.Parse("2006-01-02", date)
	if err != nil {
		return err
	}
	from := recurrence.DateOnlyUTC(day)
	to := recurrence.DateOnlyEndUTC(day)

	rows, err := h.DB.Query(`
		SELECT id, workspace_id, name, list_date, COALESCE(recurrence, '')
		FROM todo_lists
		WHERE workspace_id = ? AND kind = 'series'`, workspaceID)
	if err != nil {
		return err
	}
	defer rows.Close()

	seriesRows := []todoSeriesRow{}
	for rows.Next() {
		var row todoSeriesRow
		if err := rows.Scan(&row.ID, &row.WorkspaceID, &row.Name, &row.ListDate, &row.Recurrence); err != nil {
			return err
		}
		if !recurrence.IsRecurring(row.Recurrence) {
			continue
		}
		seriesRows = append(seriesRows, row)
	}

	if len(seriesRows) == 0 {
		return nil
	}

	store := recurrence.Store{DB: h.DB}
	exceptionMap, err := store.LoadExceptionsForWorkspace(recurrence.EntityTodoList, workspaceID)
	if err != nil {
		return err
	}

	for _, row := range seriesRows {
		if scope, ok := recurrence.ParsePeriodScope(row.Recurrence); ok {
			periodStart := recurrence.PeriodStartUTC(day, scope)
			seriesPeriodStart := recurrence.PeriodStartUTC(row.ListDate, scope)
			if periodStart.Before(seriesPeriodStart) {
				continue
			}
			periodStartStr := periodStart.Format("2006-01-02")
			if _, err := h.insertPeriodicInstance(h.DB, workspaceID, row.ID, row.Name, periodStartStr); err != nil {
				return err
			}
			continue
		}

		series := recurrence.Series{
			ID:       row.ID,
			StartAt:  recurrence.DateOnlyUTC(row.ListDate),
			RRule:    row.Recurrence,
			DateOnly: true,
		}
		occurrences := recurrence.ExpandSeries(series, from, to, exceptionMap[row.ID])
		if len(occurrences) == 0 {
			continue
		}
		if _, err := h.insertDailyInstance(h.DB, workspaceID, row.ID, row.Name, date); err != nil {
			return err
		}
	}

	return nil
}

func (h *TodoHandler) insertPeriodicInstance(db queryExecer, workspaceID, seriesID int, name, periodStart string) (int, error) {
	var existingID int
	err := db.QueryRow(`
		SELECT id FROM todo_lists
		WHERE workspace_id = ? AND series_id = ? AND kind IN ('periodic', 'weekly') AND list_date = ?`,
		workspaceID, seriesID, periodStart,
	).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}

	result, err := db.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date, series_id)
		VALUES (?, ?, 'periodic', ?, ?)`, workspaceID, name, periodStart, seriesID)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func (h *TodoHandler) insertDailyInstance(db queryExecer, workspaceID, seriesID int, name, listDate string) (int, error) {
	var existingID int
	err := db.QueryRow(`
		SELECT id FROM todo_lists
		WHERE workspace_id = ? AND series_id = ? AND list_date = ?`,
		workspaceID, seriesID, listDate,
	).Scan(&existingID)
	if err == nil {
		return existingID, nil
	}
	if err != sql.ErrNoRows {
		return 0, err
	}

	result, err := db.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date, series_id)
		VALUES (?, ?, 'daily', ?, ?)`, workspaceID, name, listDate, seriesID)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

type queryExecer interface {
	Exec(query string, args ...any) (sql.Result, error)
	QueryRow(query string, args ...any) *sql.Row
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

	if _, err := tx.Exec(
		`UPDATE todo_lists SET name = ? WHERE series_id = ? AND workspace_id = ?`,
		name, seriesID, workspaceID,
	); err != nil {
		return todoListPayload{}, err
	}

	if err := tx.Commit(); err != nil {
		return todoListPayload{}, err
	}

	return h.getListPayloadByID(workspaceID, instanceID)
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
