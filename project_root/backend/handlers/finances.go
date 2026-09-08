package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"fullstack-app/hub"
	"fullstack-app/middleware"
	"fullstack-app/recurrence"

	"github.com/gin-gonic/gin"
)

type FinanceHandler struct {
	DB  *sql.DB
	Hub *hub.Hub
}

type incomeOccurrencePayload struct {
	SeriesID         int     `json:"series_id"`
	OccurrenceID     string  `json:"occurrence_id"`
	ID               int     `json:"id"`
	WorkspaceID      int     `json:"workspace_id"`
	Title            string  `json:"title"`
	Amount           float64 `json:"amount"`
	EntryDate        string  `json:"entry_date"`
	Recurrence       string  `json:"recurrence"`
	IsRecurring      bool    `json:"is_recurring"`
	SeriesAnchorDate string  `json:"series_anchor_date"`
	Notes            string  `json:"notes"`
	CreatedBy        int     `json:"created_by"`
}

type billOccurrencePayload struct {
	SeriesID         int     `json:"series_id"`
	OccurrenceID     string  `json:"occurrence_id"`
	ID               int     `json:"id"`
	WorkspaceID      int     `json:"workspace_id"`
	Title            string  `json:"title"`
	Amount           float64 `json:"amount"`
	DueDate          string  `json:"due_date"`
	Paid             bool    `json:"paid"`
	PaidAt           *string `json:"paid_at"`
	Skipped          bool    `json:"skipped"`
	PaymentNotes     string  `json:"payment_notes"`
	Recurrence       string  `json:"recurrence"`
	IsRecurring      bool    `json:"is_recurring"`
	SeriesAnchorDate string  `json:"series_anchor_date"`
	Category         string  `json:"category"`
	CreatedBy        int     `json:"created_by"`
}

type expensePayload struct {
	ID           int     `json:"id"`
	WorkspaceID  int     `json:"workspace_id"`
	Title        string  `json:"title"`
	Amount       float64 `json:"amount"`
	ExpenseDate  string  `json:"expense_date"`
	Paid         bool    `json:"paid"`
	PaidAt       *string `json:"paid_at"`
	Skipped      bool    `json:"skipped"`
	PaymentNotes string  `json:"payment_notes"`
	Category     string  `json:"category"`
	Notes        string  `json:"notes"`
	CreatedBy    int     `json:"created_by"`
}

type expensePatchRequest struct {
	Title        string  `json:"title"`
	Amount       float64 `json:"amount"`
	Date         string  `json:"date"`
	Category     string  `json:"category"`
	Notes        string  `json:"notes"`
	Paid         *bool   `json:"paid"`
	PaidAt       *string `json:"paid_at"`
	Skipped      *bool   `json:"skipped"`
	PaymentNotes *string `json:"payment_notes"`
}

type expenseSeriesRow struct {
	ID           int
	WorkspaceID  int
	Title        string
	Amount       float64
	ExpenseDate  time.Time
	Paid         bool
	PaidAt       sql.NullString
	Skipped      bool
	PaymentNotes string
	Category     string
	Notes        string
	CreatedBy    int
}

type financeEntryRequest struct {
	Title      string  `json:"title" binding:"required"`
	Amount     float64 `json:"amount" binding:"required"`
	Date       string  `json:"date" binding:"required"`
	Recurrence string  `json:"recurrence"`
	Category   string  `json:"category"`
	Notes      string  `json:"notes"`
	Paid       *bool   `json:"paid"`
}

type financeOccurrencePatchRequest struct {
	Scope        string   `json:"scope" binding:"required"`
	Title        string   `json:"title"`
	Amount       *float64 `json:"amount"`
	Date         string   `json:"date"`
	Recurrence   string   `json:"recurrence"`
	Category     string   `json:"category"`
	Notes        string   `json:"notes"`
	Paid         *bool    `json:"paid"`
	PaidOff      *bool    `json:"paid_off"`
	PaidAt       *string  `json:"paid_at"`
	Skipped      *bool    `json:"skipped"`
	PaymentNotes string   `json:"payment_notes"`
}

type incomeSeriesRow struct {
	ID          int
	WorkspaceID int
	Title       string
	Amount      float64
	EntryDate   time.Time
	Recurrence  string
	Notes       string
	CreatedBy   int
}

type billSeriesRow struct {
	ID           int
	WorkspaceID  int
	Title        string
	Amount       float64
	DueDate      time.Time
	Paid         bool
	PaidOff      bool
	Skipped      bool
	PaymentNotes string
	Recurrence   string
	Category     string
	CreatedBy    int
}

type billSeriesPayload struct {
	ID               int     `json:"id"`
	WorkspaceID      int     `json:"workspace_id"`
	Title            string  `json:"title"`
	Amount           float64 `json:"amount"`
	DueDate          string  `json:"due_date"`
	Paid             bool    `json:"paid"`
	PaidOff          bool    `json:"paid_off"`
	Skipped          bool    `json:"skipped"`
	PaymentNotes     string  `json:"payment_notes"`
	Recurrence       string  `json:"recurrence"`
	IsRecurring      bool    `json:"is_recurring"`
	SeriesAnchorDate string  `json:"series_anchor_date"`
	Category         string  `json:"category"`
	CreatedBy        int     `json:"created_by"`
	LastPaidAt       *string `json:"last_paid_at"`
}

type incomeSeriesPayload struct {
	ID               int     `json:"id"`
	WorkspaceID      int     `json:"workspace_id"`
	Title            string  `json:"title"`
	Amount           float64 `json:"amount"`
	EntryDate        string  `json:"entry_date"`
	Recurrence       string  `json:"recurrence"`
	IsRecurring      bool    `json:"is_recurring"`
	SeriesAnchorDate string  `json:"series_anchor_date"`
	Notes            string  `json:"notes"`
	CreatedBy        int     `json:"created_by"`
}

func (h *FinanceHandler) ListIncome(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	from, to, ok := parseFinanceRange(c)
	if !ok {
		from = time.Now().UTC().AddDate(0, -1, 0)
		to = time.Now().UTC().AddDate(0, 3, 0)
	}

	rows, err := h.DB.Query(`
		SELECT id, workspace_id, title, amount, entry_date, COALESCE(recurrence, ''), notes, created_by
		FROM income_entries WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load income"})
		return
	}
	defer rows.Close()

	store := recurrence.Store{DB: h.DB}
	exceptionMap, err := store.LoadExceptionsForWorkspace(recurrence.EntityIncome, workspaceID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load recurrence exceptions"})
		return
	}

	items := []incomeOccurrencePayload{}
	for rows.Next() {
		var row incomeSeriesRow
		if err := rows.Scan(
			&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.EntryDate,
			&row.Recurrence, &row.Notes, &row.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read income"})
			return
		}

		series := recurrence.Series{
			ID: row.ID, StartAt: row.EntryDate, RRule: row.Recurrence, DateOnly: true,
		}
		occurrences := recurrence.ExpandSeries(series, from, to, exceptionMap[row.ID])
		exceptions := exceptionMap[row.ID]
		for _, at := range occurrences {
			ex := recurrence.FindException(exceptions, at, true)
			occurrenceAt, amount := recurrence.ApplyFinanceOverride(at, row.Amount, ex, nil)
			title := row.Title
			notes := row.Notes
			if ex != nil && ex.Action == recurrence.ActionModified && ex.OverrideJSON != "" {
				var override struct {
					Title  string  `json:"title"`
					Amount float64 `json:"amount"`
					Notes  string  `json:"notes"`
				}
				if err := json.Unmarshal([]byte(ex.OverrideJSON), &override); err == nil {
					if override.Title != "" {
						title = override.Title
					}
					if override.Amount > 0 {
						amount = override.Amount
					}
					if override.Notes != "" {
						notes = override.Notes
					}
				}
			}

			items = append(items, incomeOccurrencePayload{
				SeriesID: row.ID, OccurrenceID: recurrence.OccurrenceID(row.ID, at, true),
				ID: row.ID, WorkspaceID: row.WorkspaceID, Title: title, Amount: amount,
				EntryDate:  occurrenceAt.Format("2006-01-02"),
				Recurrence: recurrence.NormalizeRule(row.Recurrence), IsRecurring: recurrence.IsRecurring(row.Recurrence),
				SeriesAnchorDate: row.EntryDate.Format("2006-01-02"),
				Notes:            notes, CreatedBy: row.CreatedBy,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"income": items})
}

func (h *FinanceHandler) ListIncomeSeries(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")

	rows, err := h.DB.Query(`
		SELECT id, workspace_id, title, amount, entry_date, COALESCE(recurrence, ''), COALESCE(notes, ''), created_by
		FROM income_entries
		WHERE workspace_id = ?
		ORDER BY entry_date DESC, title ASC`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load income series"})
		return
	}
	defer rows.Close()

	items := []incomeSeriesPayload{}
	for rows.Next() {
		var row incomeSeriesRow
		if err := rows.Scan(
			&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.EntryDate,
			&row.Recurrence, &row.Notes, &row.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read income series"})
			return
		}
		rule := recurrence.NormalizeRule(row.Recurrence)
		items = append(items, incomeSeriesPayload{
			ID: row.ID, WorkspaceID: row.WorkspaceID, Title: row.Title, Amount: row.Amount,
			EntryDate: row.EntryDate.Format("2006-01-02"), Recurrence: rule,
			IsRecurring: recurrence.IsRecurring(rule),
			SeriesAnchorDate: row.EntryDate.Format("2006-01-02"), Notes: row.Notes, CreatedBy: row.CreatedBy,
		})
	}

	c.JSON(http.StatusOK, gin.H{"income": items})
}

func (h *FinanceHandler) CreateIncome(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req financeEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rrule := recurrence.NormalizeRule(req.Recurrence)
	result, err := h.DB.Exec(`
		INSERT INTO income_entries (workspace_id, title, amount, entry_date, recurrence, notes, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, req.Title, req.Amount, req.Date, nullableString(rrule), req.Notes, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create income"})
		return
	}

	id64, _ := result.LastInsertId()
	entryDate, _ := time.Parse("2006-01-02", req.Date)
	item := incomeOccurrencePayload{
		SeriesID: int(id64), OccurrenceID: recurrence.OccurrenceID(int(id64), entryDate, true),
		ID: int(id64), WorkspaceID: workspaceID.(int), Title: req.Title, Amount: req.Amount,
		EntryDate: req.Date, Recurrence: rrule, IsRecurring: recurrence.IsRecurring(rrule),
		SeriesAnchorDate: req.Date,
		Notes:            req.Notes, CreatedBy: userID.(int),
	}
	h.broadcastFinance(workspaceID.(int), "income", "created", item)
	c.JSON(http.StatusCreated, item)
}

func (h *FinanceHandler) ListBills(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	from, to, ok := parseFinanceRange(c)
	if !ok {
		from = time.Now().UTC().AddDate(0, -1, 0)
		to = time.Now().UTC().AddDate(0, 3, 0)
	}

	rows, err := h.DB.Query(`
		SELECT id, workspace_id, title, amount, due_date, paid, COALESCE(paid_off, FALSE), COALESCE(skipped, FALSE), COALESCE(payment_notes, ''), COALESCE(recurrence, ''), category, created_by
		FROM bills WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load bills"})
		return
	}
	defer rows.Close()

	store := recurrence.Store{DB: h.DB}
	exceptionMap, err := store.LoadExceptionsForWorkspace(recurrence.EntityBill, workspaceID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load recurrence exceptions"})
		return
	}
	stateMap, err := store.LoadOccurrenceStates(recurrence.EntityBill, workspaceID.(int))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load bill occurrence states"})
		return
	}

	items := []billOccurrencePayload{}
	for rows.Next() {
		var row billSeriesRow
		if err := rows.Scan(
			&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.DueDate, &row.Paid, &row.PaidOff, &row.Skipped,
			&row.PaymentNotes, &row.Recurrence, &row.Category, &row.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read bill"})
			return
		}

		if row.PaidOff {
			continue
		}

		series := recurrence.Series{
			ID: row.ID, StartAt: row.DueDate, RRule: row.Recurrence, DateOnly: true,
		}
		occurrences := recurrence.ExpandSeries(series, from, to, exceptionMap[row.ID])
		exceptions := exceptionMap[row.ID]
		for _, at := range occurrences {
			dateKey := at.Format("2006-01-02")
			var state *recurrence.OccurrenceState
			if rowStates, ok := stateMap[row.ID]; ok {
				if value, ok := rowStates[dateKey]; ok {
					state = &value
				}
			}
			ex := recurrence.FindException(exceptions, at, true)
			occurrenceAt, amount := recurrence.ApplyFinanceOverride(at, row.Amount, ex, state)
			title := row.Title
			category := row.Category
			paid := row.Paid && !recurrence.IsRecurring(row.Recurrence)
			skipped := row.Skipped && !recurrence.IsRecurring(row.Recurrence)
			paymentNotes := row.PaymentNotes
			var paidAt *string
			if state != nil {
				paid = state.Paid
				if state.PaidAt != nil {
					formatted := normalizeDateOnly(*state.PaidAt)
					paidAt = &formatted
				}
				skipped = state.Skipped
				if state.PaymentNotes != nil {
					paymentNotes = *state.PaymentNotes
				}
			}
			if ex != nil && ex.Action == recurrence.ActionModified && ex.OverrideJSON != "" {
				var override struct {
					Title    string  `json:"title"`
					Amount   float64 `json:"amount"`
					Category string  `json:"category"`
					Paid     *bool   `json:"paid"`
				}
				if err := json.Unmarshal([]byte(ex.OverrideJSON), &override); err == nil {
					if override.Title != "" {
						title = override.Title
					}
					if override.Amount > 0 {
						amount = override.Amount
					}
					if override.Category != "" {
						category = override.Category
					}
					if override.Paid != nil {
						paid = *override.Paid
					}
				}
			}

			items = append(items, billOccurrencePayload{
				SeriesID: row.ID, OccurrenceID: recurrence.OccurrenceID(row.ID, at, true),
				ID: row.ID, WorkspaceID: row.WorkspaceID, Title: title, Amount: amount,
				DueDate: occurrenceAt.Format("2006-01-02"), Paid: paid, PaidAt: paidAt, Skipped: skipped,
				PaymentNotes: paymentNotes,
				Recurrence:   recurrence.NormalizeRule(row.Recurrence), IsRecurring: recurrence.IsRecurring(row.Recurrence),
				SeriesAnchorDate: row.DueDate.Format("2006-01-02"),
				Category:         category, CreatedBy: row.CreatedBy,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"bills": items})
}

func (h *FinanceHandler) ListBillSeries(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	status := strings.ToLower(strings.TrimSpace(c.DefaultQuery("status", "active")))

	query := `
		SELECT b.id, b.workspace_id, b.title, b.amount, b.due_date, b.paid, COALESCE(b.paid_off, FALSE), COALESCE(b.skipped, FALSE), COALESCE(b.payment_notes, ''), COALESCE(b.recurrence, ''), b.category, b.created_by, b.paid_at,
			(
				SELECT MAX(ros.paid_at)
				FROM recurrence_occurrence_states ros
				WHERE ros.entity_type = 'bill'
					AND ros.series_id = b.id
					AND ros.workspace_id = b.workspace_id
					AND ros.paid = TRUE
					AND COALESCE(ros.skipped, FALSE) = FALSE
					AND ros.paid_at IS NOT NULL
			) AS occurrence_last_paid
		FROM bills b
		WHERE b.workspace_id = ?`
	switch status {
	case "paid_off":
		query += " AND COALESCE(paid_off, FALSE) = TRUE"
	case "all":
	default:
		query += " AND COALESCE(paid_off, FALSE) = FALSE"
	}
	query += " ORDER BY due_date DESC, title ASC"

	rows, err := h.DB.Query(query, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load bill series"})
		return
	}
	defer rows.Close()

	items := []billSeriesPayload{}
	for rows.Next() {
		var row billSeriesRow
		var billPaidAt sql.NullTime
		var occurrenceLastPaid sql.NullTime
		if err := rows.Scan(
			&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.DueDate, &row.Paid, &row.PaidOff, &row.Skipped,
			&row.PaymentNotes, &row.Recurrence, &row.Category, &row.CreatedBy, &billPaidAt, &occurrenceLastPaid,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read bill series"})
			return
		}
		rule := recurrence.NormalizeRule(row.Recurrence)
		items = append(items, billSeriesPayload{
			ID: row.ID, WorkspaceID: row.WorkspaceID, Title: row.Title, Amount: row.Amount,
			DueDate: row.DueDate.Format("2006-01-02"), Paid: row.Paid, PaidOff: row.PaidOff, Skipped: row.Skipped,
			PaymentNotes: row.PaymentNotes, Recurrence: rule, IsRecurring: recurrence.IsRecurring(rule),
			SeriesAnchorDate: row.DueDate.Format("2006-01-02"), Category: row.Category, CreatedBy: row.CreatedBy,
			LastPaidAt: latestPaidDate(billPaidAt, occurrenceLastPaid),
		})
	}

	c.JSON(http.StatusOK, gin.H{"bills": items})
}

func (h *FinanceHandler) CreateBill(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req financeEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	paid := false
	if req.Paid != nil {
		paid = *req.Paid
	}
	rrule := recurrence.NormalizeRule(req.Recurrence)

	result, err := h.DB.Exec(`
		INSERT INTO bills (workspace_id, title, amount, due_date, paid, recurrence, category, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, req.Title, req.Amount, req.Date, paid,
		nullableString(rrule), defaultString(req.Category, "general"), userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create bill"})
		return
	}

	id64, _ := result.LastInsertId()
	dueDate, _ := time.Parse("2006-01-02", req.Date)
	item := billOccurrencePayload{
		SeriesID: int(id64), OccurrenceID: recurrence.OccurrenceID(int(id64), dueDate, true),
		ID: int(id64), WorkspaceID: workspaceID.(int), Title: req.Title, Amount: req.Amount,
		DueDate: req.Date, Paid: paid, Recurrence: rrule, IsRecurring: recurrence.IsRecurring(rrule),
		SeriesAnchorDate: req.Date,
		Category:         defaultString(req.Category, "general"), CreatedBy: userID.(int),
	}
	h.broadcastFinance(workspaceID.(int), "bill", "created", item)
	c.JSON(http.StatusCreated, item)
}

func (h *FinanceHandler) PatchBillOccurrence(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	billID := c.Param("billId")
	occurrenceRaw := c.Param("occurrenceAt")

	var req financeOccurrencePatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	occurrenceAt, err := parseOccurrenceParam(occurrenceRaw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.loadBillSeries(workspaceID.(int), billID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bill not found"})
		return
	}

	store := recurrence.Store{DB: h.DB}
	scope := strings.ToLower(req.Scope)

	switch scope {
	case "this":
		notes := optionalPaymentNotes(req.PaymentNotes)
		if req.Skipped != nil && *req.Skipped {
			if err := store.UpsertOccurrenceState(workspaceID.(int), recurrence.EntityBill, row.ID, occurrenceAt, false, nil, nil, notes, true); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not skip bill payment"})
				return
			}
		} else if req.Paid != nil && *req.Paid {
			paidAt := resolvePaidAt(req.PaidAt)
			if err := store.UpsertOccurrenceState(workspaceID.(int), recurrence.EntityBill, row.ID, occurrenceAt, true, &paidAt, req.Amount, notes, false); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not mark bill paid"})
				return
			}
		} else if (req.Paid != nil && !*req.Paid) || (req.Skipped != nil && !*req.Skipped) {
			if err := store.UpsertOccurrenceState(workspaceID.(int), recurrence.EntityBill, row.ID, occurrenceAt, false, nil, nil, nil, false); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not clear bill payment state"})
				return
			}
		} else if req.PaymentNotes != "" || req.Amount != nil {
			state, _ := store.LoadOccurrenceStates(recurrence.EntityBill, workspaceID.(int))
			var current recurrence.OccurrenceState
			if rowStates, ok := state[row.ID]; ok {
				if value, ok := rowStates[occurrenceAt.Format("2006-01-02")]; ok {
					current = value
				}
			}
			mergedNotes := notes
			if mergedNotes == nil && current.PaymentNotes != nil {
				mergedNotes = current.PaymentNotes
			}
			amount := req.Amount
			if amount == nil {
				amount = current.AmountOverride
			}
			if err := store.UpsertOccurrenceState(
				workspaceID.(int), recurrence.EntityBill, row.ID, occurrenceAt,
				current.Paid, current.PaidAt, amount, mergedNotes, current.Skipped,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update bill payment notes"})
				return
			}
		} else {
			override, err := recurrence.MarshalOverride(gin.H{
				"title":    req.Title,
				"amount":   req.Amount,
				"date":     req.Date,
				"category": req.Category,
				"paid":     req.Paid,
			})
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not encode override"})
				return
			}
			if err := store.UpsertException(workspaceID.(int), recurrence.EntityBill, row.ID, occurrenceAt, recurrence.ActionModified, override); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update bill occurrence"})
				return
			}
		}
	case "all":
		title := defaultString(req.Title, row.Title)
		category := defaultString(req.Category, row.Category)
		dueDate := row.DueDate.Format("2006-01-02")
		if req.Date != "" {
			dueDate = req.Date
		}
		amount := row.Amount
		if req.Amount != nil {
			amount = *req.Amount
		}
		paid := row.Paid
		if req.Paid != nil {
			paid = *req.Paid
		}
		paidOff := row.PaidOff
		if req.PaidOff != nil {
			paidOff = *req.PaidOff
		}
		skipped := row.Skipped
		if req.Skipped != nil {
			skipped = *req.Skipped
			if skipped {
				paid = false
			}
		}
		if req.Paid != nil && *req.Paid {
			skipped = false
		}
		paymentNotes := row.PaymentNotes
		if req.PaymentNotes != "" {
			paymentNotes = req.PaymentNotes
		}
		var paidAt any
		if req.Paid != nil && *req.Paid {
			value := resolvePaidAt(req.PaidAt)
			paidAt = value
		}
		rrule := row.Recurrence
		if req.Recurrence != "" {
			rrule = recurrence.NormalizeRule(req.Recurrence)
		}
		_, err = h.DB.Exec(`
			UPDATE bills SET title = ?, amount = ?, due_date = ?, paid = ?, paid_at = ?, paid_off = ?, skipped = ?, payment_notes = ?, recurrence = ?, category = ?
			WHERE id = ? AND workspace_id = ?`,
			title, amount, dueDate, paid, paidAt, paidOff, skipped, nullableString(paymentNotes), nullableString(rrule), category, row.ID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update bill series"})
			return
		}
		_ = store.DeleteAllExceptions(recurrence.EntityBill, row.ID)
	case "following":
		if !recurrence.IsRecurring(row.Recurrence) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "following scope requires a recurring bill"})
			return
		}
		truncated := recurrence.TruncateRule(row.Recurrence, occurrenceAt)
		if _, err := h.DB.Exec(`UPDATE bills SET recurrence = ? WHERE id = ? AND workspace_id = ?`, nullableString(truncated), row.ID, workspaceID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not split bill series"})
			return
		}
		_ = store.DeleteExceptionsFrom(recurrence.EntityBill, row.ID, occurrenceAt)

		title := defaultString(req.Title, row.Title)
		category := defaultString(req.Category, row.Category)
		dueDate := occurrenceAt.Format("2006-01-02")
		if req.Date != "" {
			dueDate = req.Date
		}
		amount := row.Amount
		if req.Amount != nil {
			amount = *req.Amount
		}
		paid := false
		if req.Paid != nil {
			paid = *req.Paid
		}
		rrule := recurrence.SplitRuleFrom(row.Recurrence, occurrenceAt)
		if req.Recurrence != "" {
			rrule = recurrence.NormalizeRule(req.Recurrence)
		}
		_, err = h.DB.Exec(`
			INSERT INTO bills (workspace_id, title, amount, due_date, paid, recurrence, category, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			workspaceID, title, amount, dueDate, paid, nullableString(rrule), category, row.CreatedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create split bill series"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be this, following, or all"})
		return
	}

	h.broadcastFinance(workspaceID.(int), "bill", "updated", gin.H{"series_id": row.ID})
	c.Status(http.StatusNoContent)
}

func (h *FinanceHandler) PatchIncomeOccurrence(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	incomeID := c.Param("incomeId")
	occurrenceRaw := c.Param("occurrenceAt")

	var req financeOccurrencePatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	occurrenceAt, err := parseOccurrenceParam(occurrenceRaw)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.loadIncomeSeries(workspaceID.(int), incomeID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "income not found"})
		return
	}

	store := recurrence.Store{DB: h.DB}
	scope := strings.ToLower(req.Scope)

	switch scope {
	case "this":
		override, err := recurrence.MarshalOverride(gin.H{
			"title":  req.Title,
			"amount": req.Amount,
			"date":   req.Date,
			"notes":  req.Notes,
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not encode override"})
			return
		}
		if err := store.UpsertException(workspaceID.(int), recurrence.EntityIncome, row.ID, occurrenceAt, recurrence.ActionModified, override); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update income occurrence"})
			return
		}
	case "all":
		title := defaultString(req.Title, row.Title)
		entryDate := row.EntryDate.Format("2006-01-02")
		if req.Date != "" {
			entryDate = req.Date
		}
		amount := row.Amount
		if req.Amount != nil {
			amount = *req.Amount
		}
		notes := row.Notes
		if req.Notes != "" {
			notes = req.Notes
		}
		rrule := row.Recurrence
		if req.Recurrence != "" {
			rrule = recurrence.NormalizeRule(req.Recurrence)
		}
		_, err = h.DB.Exec(`
			UPDATE income_entries SET title = ?, amount = ?, entry_date = ?, recurrence = ?, notes = ?
			WHERE id = ? AND workspace_id = ?`,
			title, amount, entryDate, nullableString(rrule), notes, row.ID, workspaceID,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update income series"})
			return
		}
		_ = store.DeleteAllExceptions(recurrence.EntityIncome, row.ID)
	case "following":
		if !recurrence.IsRecurring(row.Recurrence) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "following scope requires recurring income"})
			return
		}
		truncated := recurrence.TruncateRule(row.Recurrence, occurrenceAt)
		if _, err := h.DB.Exec(`UPDATE income_entries SET recurrence = ? WHERE id = ? AND workspace_id = ?`, nullableString(truncated), row.ID, workspaceID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not split income series"})
			return
		}
		_ = store.DeleteExceptionsFrom(recurrence.EntityIncome, row.ID, occurrenceAt)

		title := defaultString(req.Title, row.Title)
		entryDate := occurrenceAt.Format("2006-01-02")
		if req.Date != "" {
			entryDate = req.Date
		}
		amount := row.Amount
		if req.Amount != nil {
			amount = *req.Amount
		}
		notes := defaultString(req.Notes, row.Notes)
		rrule := recurrence.SplitRuleFrom(row.Recurrence, occurrenceAt)
		if req.Recurrence != "" {
			rrule = recurrence.NormalizeRule(req.Recurrence)
		}
		_, err = h.DB.Exec(`
			INSERT INTO income_entries (workspace_id, title, amount, entry_date, recurrence, notes, created_by)
			VALUES (?, ?, ?, ?, ?, ?, ?)`,
			workspaceID, title, amount, entryDate, nullableString(rrule), notes, row.CreatedBy,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create split income series"})
			return
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be this, following, or all"})
		return
	}

	h.broadcastFinance(workspaceID.(int), "income", "updated", gin.H{"series_id": row.ID})
	c.Status(http.StatusNoContent)
}

func (h *FinanceHandler) DeleteIncome(c *gin.Context) {
	h.deleteFinanceSeries(c, recurrence.EntityIncome, "income_entries", "incomeId", "income")
}

func (h *FinanceHandler) DeleteBill(c *gin.Context) {
	h.deleteFinanceSeries(c, recurrence.EntityBill, "bills", "billId", "bill")
}

func (h *FinanceHandler) deleteFinanceSeries(c *gin.Context, entityType, table, paramName, broadcastEntity string) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	seriesID := c.Param(paramName)
	scope := defaultString(c.Query("scope"), "all")
	occurrenceRaw := c.Query("occurrence")

	if scope == "all" && occurrenceRaw == "" {
		id, _ := strconv.Atoi(seriesID)
		if _, err := h.DB.Exec(
			fmt.Sprintf("DELETE FROM %s WHERE id = ? AND workspace_id = ?", table),
			seriesID, workspaceID,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete entry"})
			return
		}
		store := recurrence.Store{DB: h.DB}
		_ = store.DeleteAllExceptions(entityType, id)
		h.broadcastFinance(workspaceID.(int), broadcastEntity, "deleted", gin.H{"id": seriesID})
		c.Status(http.StatusNoContent)
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

	var recurrenceRule string
	err = h.DB.QueryRow(
		fmt.Sprintf("SELECT COALESCE(recurrence, '') FROM %s WHERE id = ? AND workspace_id = ?", table),
		seriesID, workspaceID,
	).Scan(&recurrenceRule)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "entry not found"})
		return
	}

	id, _ := strconv.Atoi(seriesID)
	store := recurrence.Store{DB: h.DB}
	switch scope {
	case "this":
		if err := store.UpsertException(workspaceID.(int), entityType, id, occurrenceAt, recurrence.ActionCancelled, ""); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not skip occurrence"})
			return
		}
	case "following":
		if recurrence.IsRecurring(recurrenceRule) {
			newRule := recurrence.TruncateRule(recurrenceRule, occurrenceAt)
			if _, err := h.DB.Exec(
				fmt.Sprintf("UPDATE %s SET recurrence = ? WHERE id = ? AND workspace_id = ?", table),
				nullableString(newRule), seriesID, workspaceID,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not truncate series"})
				return
			}
			_ = store.DeleteExceptionsFrom(entityType, id, occurrenceAt)
		} else {
			if _, err := h.DB.Exec(
				fmt.Sprintf("DELETE FROM %s WHERE id = ? AND workspace_id = ?", table),
				seriesID, workspaceID,
			); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete entry"})
				return
			}
			_ = store.DeleteAllExceptions(entityType, id)
		}
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "scope must be this, following, or all"})
		return
	}

	h.broadcastFinance(workspaceID.(int), broadcastEntity, "updated", gin.H{"series_id": id})
	c.Status(http.StatusNoContent)
}

func (h *FinanceHandler) PatchExpense(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	expenseID := c.Param("expenseId")

	var req expensePatchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	row, err := h.loadExpenseRow(workspaceID.(int), expenseID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "expense not found"})
		return
	}

	title := row.Title
	amount := row.Amount
	expenseDate := row.ExpenseDate.Format("2006-01-02")
	category := row.Category
	notes := row.Notes
	if req.Title != "" {
		title = req.Title
		amount = req.Amount
		if req.Date != "" {
			expenseDate = req.Date
		}
		category = defaultString(req.Category, row.Category)
		notes = req.Notes
	}

	paid := row.Paid
	skipped := row.Skipped
	paidAt := row.PaidAt
	paymentNotes := row.PaymentNotes

	if req.Paid != nil || req.Skipped != nil {
		if req.Skipped != nil && *req.Skipped {
			skipped = true
			paid = false
			paidAt = sql.NullString{}
		} else if req.Paid != nil && *req.Paid {
			paid = true
			skipped = false
			value := resolvePaidAt(req.PaidAt)
			paidAt = sql.NullString{String: value, Valid: true}
			if req.Amount > 0 {
				amount = req.Amount
			}
		} else if (req.Paid != nil && !*req.Paid) || (req.Skipped != nil && !*req.Skipped) {
			paid = false
			skipped = false
			paidAt = sql.NullString{}
			paymentNotes = ""
		} else if req.PaymentNotes != nil {
			paymentNotes = *req.PaymentNotes
		}
	}

	var paidAtValue any
	if paidAt.Valid {
		paidAtValue = paidAt.String
	}

	_, err = h.DB.Exec(`
		UPDATE expenses
		SET title = ?, amount = ?, expense_date = ?, category = ?, notes = ?, paid = ?, paid_at = ?, skipped = ?, payment_notes = ?
		WHERE id = ? AND workspace_id = ?`,
		title, amount, expenseDate, category, notes, paid, paidAtValue, skipped, nullableString(paymentNotes),
		expenseID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update expense"})
		return
	}

	h.broadcastFinance(workspaceID.(int), "expense", "updated", gin.H{"id": expenseID})
	c.Status(http.StatusNoContent)
}

func (h *FinanceHandler) DeleteExpense(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	expenseID := c.Param("expenseId")

	_, err := h.DB.Exec(
		"DELETE FROM expenses WHERE id = ? AND workspace_id = ?",
		expenseID, workspaceID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not delete expense"})
		return
	}

	h.broadcastFinance(workspaceID.(int), "expense", "deleted", gin.H{"id": expenseID})
	c.Status(http.StatusNoContent)
}

func (h *FinanceHandler) ListExpenses(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	rows, err := h.DB.Query(`
		SELECT id, workspace_id, title, amount, expense_date, paid, paid_at, COALESCE(skipped, FALSE), COALESCE(payment_notes, ''), category, notes, created_by
		FROM expenses WHERE workspace_id = ? ORDER BY expense_date DESC`, workspaceID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not load expenses"})
		return
	}
	defer rows.Close()

	items := []expensePayload{}
	for rows.Next() {
		var item expensePayload
		var expenseDate time.Time
		var paidAt sql.NullString
		if err := rows.Scan(
			&item.ID, &item.WorkspaceID, &item.Title, &item.Amount, &expenseDate,
			&item.Paid, &paidAt, &item.Skipped, &item.PaymentNotes,
			&item.Category, &item.Notes, &item.CreatedBy,
		); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "could not read expense"})
			return
		}
		item.ExpenseDate = expenseDate.Format("2006-01-02")
		if paidAt.Valid {
			formatted := normalizeDateOnly(paidAt.String)
			item.PaidAt = &formatted
		}
		items = append(items, item)
	}
	c.JSON(http.StatusOK, gin.H{"expenses": items})
}

func (h *FinanceHandler) CreateExpense(c *gin.Context) {
	if !middleware.RequireManage(c, middleware.AreaFinances) {
		return
	}
	workspaceID, _ := c.Get("workspaceID")
	userID, _ := c.Get("userID")

	var req financeEntryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result, err := h.DB.Exec(`
		INSERT INTO expenses (workspace_id, title, amount, expense_date, category, notes, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, req.Title, req.Amount, req.Date,
		defaultString(req.Category, "general"), req.Notes, userID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create expense"})
		return
	}

	id64, _ := result.LastInsertId()
	item := expensePayload{
		ID: int(id64), WorkspaceID: workspaceID.(int), Title: req.Title, Amount: req.Amount,
		ExpenseDate: req.Date, Category: defaultString(req.Category, "general"), Notes: req.Notes, CreatedBy: userID.(int),
	}
	h.broadcastFinance(workspaceID.(int), "expense", "created", item)
	c.JSON(http.StatusCreated, item)
}

func (h *FinanceHandler) Summary(c *gin.Context) {
	workspaceID, _ := c.Get("workspaceID")
	from, to, ok := parseFinanceRange(c)
	if !ok {
		from = time.Now().UTC().AddDate(0, 0, -time.Now().Day()+1)
		to = time.Now().UTC().AddDate(0, 1, 0)
	}

	incomeTotal := h.sumExpandedIncome(workspaceID.(int), from, to)
	billsTotal := h.sumExpandedBills(workspaceID.(int), from, to)

	var expenseTotal float64
	h.DB.QueryRow(`
		SELECT COALESCE(SUM(amount),0) FROM expenses
		WHERE workspace_id = ? AND expense_date >= ? AND expense_date <= ?
			AND COALESCE(skipped, FALSE) = FALSE`,
		workspaceID, from.Format("2006-01-02"), to.Format("2006-01-02")).Scan(&expenseTotal)

	c.JSON(http.StatusOK, gin.H{
		"income_total":  incomeTotal,
		"bills_due":     billsTotal,
		"expense_total": expenseTotal,
		"net":           incomeTotal - expenseTotal - billsTotal,
	})
}

func (h *FinanceHandler) sumExpandedIncome(workspaceID int, from, to time.Time) float64 {
	rows, err := h.DB.Query(`
		SELECT id, amount, entry_date, COALESCE(recurrence, '')
		FROM income_entries WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	store := recurrence.Store{DB: h.DB}
	exceptionMap, _ := store.LoadExceptionsForWorkspace(recurrence.EntityIncome, workspaceID)

	total := 0.0
	for rows.Next() {
		var id int
		var amount float64
		var entryDate time.Time
		var rule string
		if err := rows.Scan(&id, &amount, &entryDate, &rule); err != nil {
			continue
		}
		series := recurrence.Series{ID: id, StartAt: entryDate, RRule: rule, DateOnly: true}
		for _, at := range recurrence.ExpandSeries(series, from, to, exceptionMap[id]) {
			_, value := recurrence.ApplyFinanceOverride(at, amount, recurrence.FindException(exceptionMap[id], at, true), nil)
			total += value
		}
	}
	return total
}

func (h *FinanceHandler) sumExpandedBills(workspaceID int, from, to time.Time) float64 {
	rows, err := h.DB.Query(`
		SELECT id, amount, due_date, paid, COALESCE(paid_off, FALSE), COALESCE(skipped, FALSE), COALESCE(recurrence, '')
		FROM bills WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	store := recurrence.Store{DB: h.DB}
	exceptionMap, _ := store.LoadExceptionsForWorkspace(recurrence.EntityBill, workspaceID)
	stateMap, _ := store.LoadOccurrenceStates(recurrence.EntityBill, workspaceID)

	total := 0.0
	for rows.Next() {
		var id int
		var amount float64
		var dueDate time.Time
		var paid bool
		var paidOff bool
		var skipped bool
		var rule string
		if err := rows.Scan(&id, &amount, &dueDate, &paid, &paidOff, &skipped, &rule); err != nil {
			continue
		}
		if paidOff {
			continue
		}
		series := recurrence.Series{ID: id, StartAt: dueDate, RRule: rule, DateOnly: true}
		for _, at := range recurrence.ExpandSeries(series, from, to, exceptionMap[id]) {
			dateKey := at.Format("2006-01-02")
			var state *recurrence.OccurrenceState
			if rowStates, ok := stateMap[id]; ok {
				if value, ok := rowStates[dateKey]; ok {
					state = &value
				}
			}
			isSkipped := skipped && !recurrence.IsRecurring(rule)
			if state != nil {
				isSkipped = state.Skipped
			}
			if isSkipped {
				continue
			}
			_, value := recurrence.ApplyFinanceOverride(at, amount, recurrence.FindException(exceptionMap[id], at, true), state)
			total += value
		}
	}
	return total
}

func (h *FinanceHandler) sumExpandedUnpaidBills(workspaceID int, from, to time.Time) float64 {
	rows, err := h.DB.Query(`
		SELECT id, amount, due_date, paid, COALESCE(paid_off, FALSE), COALESCE(skipped, FALSE), COALESCE(recurrence, '')
		FROM bills WHERE workspace_id = ?`, workspaceID)
	if err != nil {
		return 0
	}
	defer rows.Close()

	store := recurrence.Store{DB: h.DB}
	exceptionMap, _ := store.LoadExceptionsForWorkspace(recurrence.EntityBill, workspaceID)
	stateMap, _ := store.LoadOccurrenceStates(recurrence.EntityBill, workspaceID)

	total := 0.0
	for rows.Next() {
		var id int
		var amount float64
		var dueDate time.Time
		var paid bool
		var paidOff bool
		var skipped bool
		var rule string
		if err := rows.Scan(&id, &amount, &dueDate, &paid, &paidOff, &skipped, &rule); err != nil {
			continue
		}
		if paidOff {
			continue
		}
		series := recurrence.Series{ID: id, StartAt: dueDate, RRule: rule, DateOnly: true}
		for _, at := range recurrence.ExpandSeries(series, from, to, exceptionMap[id]) {
			dateKey := at.Format("2006-01-02")
			var state *recurrence.OccurrenceState
			if rowStates, ok := stateMap[id]; ok {
				if value, ok := rowStates[dateKey]; ok {
					state = &value
				}
			}
			isPaid := paid && !recurrence.IsRecurring(rule)
			isSkipped := skipped && !recurrence.IsRecurring(rule)
			if state != nil {
				isPaid = state.Paid
				isSkipped = state.Skipped
			}
			if isPaid || isSkipped {
				continue
			}
			_, value := recurrence.ApplyFinanceOverride(at, amount, recurrence.FindException(exceptionMap[id], at, true), state)
			total += value
		}
	}
	return total
}

func (h *FinanceHandler) loadExpenseRow(workspaceID int, expenseID string) (expenseSeriesRow, error) {
	var row expenseSeriesRow
	err := h.DB.QueryRow(`
		SELECT id, workspace_id, title, amount, expense_date, paid, paid_at, COALESCE(skipped, FALSE), COALESCE(payment_notes, ''), category, notes, created_by
		FROM expenses WHERE id = ? AND workspace_id = ?`, expenseID, workspaceID,
	).Scan(
		&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.ExpenseDate,
		&row.Paid, &row.PaidAt, &row.Skipped, &row.PaymentNotes, &row.Category, &row.Notes, &row.CreatedBy,
	)
	return row, err
}

func (h *FinanceHandler) loadBillSeries(workspaceID int, billID string) (billSeriesRow, error) {
	var row billSeriesRow
	err := h.DB.QueryRow(`
		SELECT id, workspace_id, title, amount, due_date, paid, COALESCE(paid_off, FALSE), COALESCE(skipped, FALSE), COALESCE(payment_notes, ''), COALESCE(recurrence, ''), category, created_by
		FROM bills WHERE id = ? AND workspace_id = ?`, billID, workspaceID,
	).Scan(&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.DueDate, &row.Paid, &row.PaidOff, &row.Skipped, &row.PaymentNotes, &row.Recurrence, &row.Category, &row.CreatedBy)
	return row, err
}

func (h *FinanceHandler) loadIncomeSeries(workspaceID int, incomeID string) (incomeSeriesRow, error) {
	var row incomeSeriesRow
	err := h.DB.QueryRow(`
		SELECT id, workspace_id, title, amount, entry_date, COALESCE(recurrence, ''), notes, created_by
		FROM income_entries WHERE id = ? AND workspace_id = ?`, incomeID, workspaceID,
	).Scan(&row.ID, &row.WorkspaceID, &row.Title, &row.Amount, &row.EntryDate, &row.Recurrence, &row.Notes, &row.CreatedBy)
	return row, err
}

func parseFinanceRange(c *gin.Context) (time.Time, time.Time, bool) {
	return parseQueryRange(c.Query("start"), c.Query("end"))
}

func (h *FinanceHandler) broadcastFinance(workspaceID int, entity, action string, payload any) {
	raw, _ := json.Marshal(payload)
	h.Hub.BroadcastWorkspace(workspaceID, hub.Message{
		Type: "update", Entity: entity, Action: action, Payload: raw,
	})
}

func resolvePaidAt(value *string) string {
	if value != nil && strings.TrimSpace(*value) != "" {
		return strings.TrimSpace(*value)
	}
	return time.Now().UTC().Format("2006-01-02")
}

func latestPaidDate(dates ...sql.NullTime) *string {
	var latest *time.Time
	for _, date := range dates {
		if !date.Valid {
			continue
		}
		t := date.Time
		if latest == nil || t.After(*latest) {
			copy := t
			latest = &copy
		}
	}
	if latest == nil {
		return nil
	}
	formatted := latest.Format("2006-01-02")
	return &formatted
}

func optionalPaymentNotes(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func normalizeDateOnly(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 10 {
		return value[:10]
	}
	return value
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
