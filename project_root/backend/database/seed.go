package database

import (
	"database/sql"
	"fmt"
	"time"

	"golang.org/x/crypto/bcrypt"
)

const (
	seedDemoUsername    = "demo"
	seedPartnerUsername = "partner"
	seedPassword        = "password123"
	seedWorkspaceName   = "Demo Family"
	seedWorkspaceSlug   = "demo-family"
)

func Seed(db *sql.DB) error {
	var existingID int
	err := db.QueryRow("SELECT id FROM users WHERE username = ?", seedDemoUsername).Scan(&existingID)
	if err == nil {
		return nil
	}
	if err != sql.ErrNoRows {
		return fmt.Errorf("check seed user: %w", err)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(seedPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash seed password: %w", err)
	}

	partnerHash, err := bcrypt.GenerateFromPassword([]byte(seedPassword), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash partner password: %w", err)
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	demoID, err := insertUser(tx, seedDemoUsername, string(hash))
	if err != nil {
		return err
	}

	partnerID, err := insertUser(tx, seedPartnerUsername, string(partnerHash))
	if err != nil {
		return err
	}

	workspaceID, err := insertWorkspace(tx, seedWorkspaceName, seedWorkspaceSlug, demoID)
	if err != nil {
		return err
	}

	if _, err = tx.Exec(
		"INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner'), (?, ?, 'member')",
		workspaceID, demoID, workspaceID, partnerID,
	); err != nil {
		return fmt.Errorf("insert workspace members: %w", err)
	}

	now := time.Now()
	today := now.Format("2006-01-02")
	yesterday := now.AddDate(0, 0, -1).Format("2006-01-02")
	tomorrow := now.AddDate(0, 0, 1).Format("2006-01-02")
	nextWeek := now.AddDate(0, 0, 7).Format("2006-01-02")
	billDueSoon := now.AddDate(0, 0, 5).Format("2006-01-02")
	inThreeDays := now.AddDate(0, 0, 3).Format("2006-01-02")

	nextMonday := now
	for nextMonday.Weekday() != time.Monday {
		nextMonday = nextMonday.AddDate(0, 0, 1)
	}
	monday := nextMonday.Format("2006-01-02")

	nextSaturday := now
	for nextSaturday.Weekday() != time.Saturday {
		nextSaturday = nextSaturday.AddDate(0, 0, 1)
	}
	saturday := nextSaturday.Format("2006-01-02")
	firstOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC).Format("2006-01-02")
	paydayRule := "FREQ=MONTHLY;BYMONTHDAY=15,-1;X-ADJUST-WEEKEND=PREVIOUS"

	events := []struct {
		title, description, startAt, endAt, color, rrule string
		allDay                                            bool
	}{
		{"Family standup", "Monthly planning check-in", today + " 09:00:00", today + " 09:30:00", "#2563eb", "FREQ=MONTHLY", false},
		{"Grocery run", "Costco + farmer's market", monday + " 10:00:00", monday + " 12:00:00", "#16a34a", "FREQ=WEEKLY;BYDAY=MO", false},
		{"School concert", "Arrive 15 minutes early", nextWeek + " 18:30:00", nextWeek + " 20:00:00", "#9333ea", "", false},
		{"Home maintenance day", "Filters, batteries, yard work", saturday + " 00:00:00", saturday + " 23:59:59", "#ea580c", "FREQ=WEEKLY;BYDAY=SA", true},
	}
	for _, event := range events {
		if err := insertEvent(tx, workspaceID, demoID, event.title, event.description, event.startAt, event.endAt, event.allDay, event.color, event.rrule); err != nil {
			return err
		}
	}

	incomeRows := []struct {
		title, date, notes, recurrence string
		amount                         float64
	}{
		{"Payday", firstOfMonth, "15th and last day of month, previous weekday if weekend", paydayRule, 2600},
		{"Monthly salary", today, "Primary paycheck", "FREQ=MONTHLY", 5200},
		{"Freelance project", today, "Design contract", "", 850},
	}
	for _, row := range incomeRows {
		if err := insertIncome(tx, workspaceID, demoID, row.title, row.amount, row.date, row.notes, row.recurrence); err != nil {
			return err
		}
	}

	billRows := []struct {
		title, dueDate, category, recurrence string
		amount                                 float64
		paid                                   bool
		paidAt                                 string
		skipped                                bool
		paymentNotes                           string
		occurrencePaid                         bool
		occurrenceSkipped                      bool
	}{
		{"Mortgage", billDueSoon, "housing", "FREQ=MONTHLY", 1850, false, "", false, "", false, false},
		{"Electric bill", today, "utilities", "FREQ=MONTHLY", 142.50, false, today, false, "Autopay confirmation A4412", true, false},
		{"Internet", tomorrow, "utilities", "FREQ=MONTHLY", 79.99, false, "", false, "Paused this billing cycle", false, true},
		{"Water bill", yesterday, "utilities", "FREQ=MONTHLY", 64.30, false, "", false, "", false, false},
		{"Phone bill", inThreeDays, "utilities", "FREQ=MONTHLY", 95.00, false, "", false, "", false, false},
		{"Car insurance", today, "insurance", "", 156.00, true, today, false, "Autopay ref #8821", false, false},
	}
	for _, row := range billRows {
		billID, err := insertBill(
			tx, workspaceID, demoID, row.title, row.amount, row.dueDate,
			row.paid, row.paidAt, row.skipped, row.paymentNotes, row.category, row.recurrence,
		)
		if err != nil {
			return err
		}
		if row.recurrence != "" && (row.occurrencePaid || row.occurrenceSkipped) {
			if err := insertBillOccurrenceState(
				tx, workspaceID, billID, row.dueDate,
				row.occurrencePaid, row.paidAt, row.paymentNotes, row.occurrenceSkipped,
			); err != nil {
				return err
			}
		}
	}

	expenseRows := []struct {
		title, date, category, notes string
		amount                       float64
		paid                         bool
		paidAt                       string
		skipped                      bool
		paymentNotes                 string
	}{
		{"Groceries", today, "food", "Weekly shop", 186.42, true, today, false, "Debit card ending 4421"},
		{"Gas", today, "transport", "Two fill-ups", 58.20, false, "", false, ""},
		{"Dinner out", tomorrow, "food", "Anniversary dinner", 74.15, false, "", true, "Reservation cancelled"},
		{"Pharmacy", yesterday, "health", "Prescription refill", 24.88, true, yesterday, false, "FSA card"},
		{"Coffee subscription", billDueSoon, "food", "Monthly delivery", 19.99, false, "", false, ""},
		{"Home supplies", inThreeDays, "general", "Paper towels and detergent", 41.60, false, "", false, ""},
	}
	for _, row := range expenseRows {
		if err := insertExpense(
			tx, workspaceID, demoID, row.title, row.amount, row.date, row.category, row.notes,
			row.paid, row.paidAt, row.skipped, row.paymentNotes,
		); err != nil {
			return err
		}
	}

	dailyListID, err := insertTodoList(tx, workspaceID, "Daily Plan", "daily", today)
	if err != nil {
		return err
	}

	generalListID, err := insertTodoList(tx, workspaceID, "Home Projects", "general", "")
	if err != nil {
		return err
	}

	dailyTodos := []struct {
		title     string
		completed bool
	}{
		{"Review calendar for the week", true},
		{"Pay electric bill", false},
		{"Prep lunches", false},
		{"Walk the dog", true},
	}
	for i, todo := range dailyTodos {
		if err := insertTodo(tx, workspaceID, dailyListID, demoID, todo.title, todo.completed, i+1); err != nil {
			return err
		}
	}

	generalTodos := []struct {
		title     string
		completed bool
	}{
		{"Replace HVAC filter", false},
		{"Organize garage shelves", false},
		{"Schedule gutter cleaning", true},
	}
	for i, todo := range generalTodos {
		if err := insertTodo(tx, workspaceID, generalListID, demoID, todo.title, todo.completed, i+1); err != nil {
			return err
		}
	}

	notes := []struct {
		listID  sql.NullInt64
		title   string
		content string
	}{
		{sql.NullInt64{Int64: int64(dailyListID), Valid: true}, "Grocery staples", "Milk, eggs, bread, fruit, coffee, pasta, chicken"},
		{sql.NullInt64{Int64: int64(generalListID), Valid: true}, "Garage project plan", "Sort tools, add wall hooks, donate unused bins"},
		{sql.NullInt64{Valid: false}, "Family reminders", "Trash day is Thursday. Soccer practice moved to 5:30pm."},
	}
	for _, note := range notes {
		if err := insertNote(tx, workspaceID, note.listID, demoID, note.title, note.content); err != nil {
			return err
		}
	}

	if err := seedWorkspaceChat(tx, workspaceID, demoID, partnerID); err != nil {
		return err
	}

	return tx.Commit()
}

func insertUser(tx *sql.Tx, username, passwordHash string) (int, error) {
	result, err := tx.Exec("INSERT INTO users (username, password) VALUES (?, ?)", username, passwordHash)
	if err != nil {
		return 0, fmt.Errorf("insert user %s: %w", username, err)
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func insertWorkspace(tx *sql.Tx, name, slug string, createdBy int) (int, error) {
	result, err := tx.Exec(
		"INSERT INTO workspaces (name, slug, created_by) VALUES (?, ?, ?)",
		name, slug, createdBy,
	)
	if err != nil {
		return 0, fmt.Errorf("insert workspace: %w", err)
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func insertEvent(tx *sql.Tx, workspaceID, userID int, title, description, startAt, endAt string, allDay bool, color, rrule string) error {
	var rruleValue any
	if rrule != "" {
		rruleValue = rrule
	}
	_, err := tx.Exec(`
		INSERT INTO events (workspace_id, title, description, start_at, end_at, all_day, color, rrule, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, title, description, startAt, endAt, allDay, color, rruleValue, userID,
	)
	return err
}

func insertIncome(tx *sql.Tx, workspaceID, userID int, title string, amount float64, entryDate, notes, recurrence string) error {
	var recurrenceValue any
	if recurrence != "" {
		recurrenceValue = recurrence
	}
	_, err := tx.Exec(`
		INSERT INTO income_entries (workspace_id, title, amount, entry_date, recurrence, notes, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, title, amount, entryDate, recurrenceValue, notes, userID,
	)
	return err
}

func insertBill(
	tx *sql.Tx, workspaceID, userID int,
	title string, amount float64, dueDate string,
	paid bool, paidAt string, skipped bool, paymentNotes string,
	category, recurrence string,
) (int, error) {
	var recurrenceValue any
	if recurrence != "" {
		recurrenceValue = recurrence
	}
	var paidAtValue any
	if paidAt != "" {
		paidAtValue = paidAt
	}
	result, err := tx.Exec(`
		INSERT INTO bills (workspace_id, title, amount, due_date, paid, paid_at, skipped, payment_notes, recurrence, category, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, title, amount, dueDate, paid, paidAtValue, skipped, paymentNotes, recurrenceValue, category, userID,
	)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func insertBillOccurrenceState(
	tx *sql.Tx, workspaceID, seriesID int, occurrenceDate string,
	paid bool, paidAt, paymentNotes string, skipped bool,
) error {
	var paidAtValue any
	if paidAt != "" {
		paidAtValue = paidAt
	}
	var notesValue any
	if paymentNotes != "" {
		notesValue = paymentNotes
	}
	_, err := tx.Exec(`
		INSERT INTO recurrence_occurrence_states (
			workspace_id, entity_type, series_id, occurrence_at, paid, paid_at, payment_notes, skipped
		)
		VALUES (?, 'bill', ?, ?, ?, ?, ?, ?)`,
		workspaceID, seriesID, occurrenceDate, paid, paidAtValue, notesValue, skipped,
	)
	return err
}

func insertExpense(
	tx *sql.Tx, workspaceID, userID int,
	title string, amount float64, expenseDate, category, notes string,
	paid bool, paidAt string, skipped bool, paymentNotes string,
) error {
	var paidAtValue any
	if paidAt != "" {
		paidAtValue = paidAt
	}
	_, err := tx.Exec(`
		INSERT INTO expenses (workspace_id, title, amount, expense_date, category, notes, paid, paid_at, skipped, payment_notes, created_by)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		workspaceID, title, amount, expenseDate, category, notes, paid, paidAtValue, skipped, paymentNotes, userID,
	)
	return err
}

func insertTodoList(tx *sql.Tx, workspaceID int, name, kind, listDate string) (int, error) {
	var listDateValue any
	if listDate != "" {
		listDateValue = listDate
	}

	result, err := tx.Exec(`
		INSERT INTO todo_lists (workspace_id, name, kind, list_date)
		VALUES (?, ?, ?, ?)`, workspaceID, name, kind, listDateValue)
	if err != nil {
		return 0, err
	}
	id64, _ := result.LastInsertId()
	return int(id64), nil
}

func insertTodo(tx *sql.Tx, workspaceID, listID, userID int, title string, completed bool, position int) error {
	_, err := tx.Exec(`
		INSERT INTO todos (workspace_id, list_id, title, completed, position, created_by)
		VALUES (?, ?, ?, ?, ?, ?)`, workspaceID, listID, title, completed, position, userID)
	return err
}

func insertNote(tx *sql.Tx, workspaceID int, listID sql.NullInt64, userID int, title, content string) error {
	_, err := tx.Exec(`
		INSERT INTO notes (workspace_id, list_id, title, content, created_by)
		VALUES (?, ?, ?, ?, ?)`, workspaceID, listID, title, content, userID)
	return err
}
