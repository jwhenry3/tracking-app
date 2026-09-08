package handlers

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"fullstack-app/hub"
	"fullstack-app/middleware"

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
	Name     string `json:"name" binding:"required"`
	Kind     string `json:"kind"`
	ListDate string `json:"list_date"`
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

	query := `
		SELECT id, workspace_id, name, kind, list_date
		FROM todo_lists WHERE workspace_id = ?`
	args := []any{workspaceID}

	if listDate != "" {
		query += " AND (kind = 'general' OR list_date = ?)"
		args = append(args, listDate)
	}
	query += " ORDER BY kind ASC, list_date DESC, name ASC"

	rows, err := h.DB.Query(query, args...)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load todo lists"})
		return
	}
	defer rows.Close()

	lists := []todoListPayload{}
	for rows.Next() {
		var list todoListPayload
		var date sql.NullString
		if err := rows.Scan(&list.ID, &list.WorkspaceID, &list.Name, &list.Kind, &date); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read todo list"})
			return
		}
		if date.Valid {
			list.ListDate = &date.String
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

	kind := req.Kind
	if kind == "" {
		kind = "general"
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

func (h *TodoHandler) DeleteList(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaPlanning) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	listID := c.Param("listId")

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

	var listID int
	err := h.DB.QueryRow(`
		SELECT id FROM todo_lists WHERE workspace_id = ? AND kind = 'daily' AND list_date = ?`,
		workspaceID, date,
	).Scan(&listID)
	if err == sql.ErrNoRows {
		result, insertErr := h.DB.Exec(`
			INSERT INTO todo_lists (workspace_id, name, kind, list_date)
			VALUES (?, ?, 'daily', ?)`, workspaceID, "Daily Plan", date)
		if insertErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create daily list"})
			return
		}
		id64, _ := result.LastInsertId()
		listID = int(id64)
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load daily list"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"list_id": listID, "date": date})
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

func (h *TodoHandler) broadcastTodo(workspaceID int, entity, action string, payload any) {
	raw, _ := json.Marshal(payload)
	h.Hub.BroadcastWorkspace(workspaceID, hub.Message{
		Type: "update", Entity: entity, Action: action, Payload: raw,
	})
}
