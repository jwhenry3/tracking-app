package legacy

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"time"

	"fullstack-app/recurrence"
)

type MigrateOptions struct {
	DryRun bool
}

type MigrateResult struct {
	UsersCreated       int
	UsersSkipped       int
	WorkspacesCreated  int
	BillsCreated       int
	BillsRepaired      int
	BillsSkipped       int
	PaymentsCreated    int
	PaymentsSkipped    int
	PreferencesPatched int
}

type idMaps struct {
	users      map[string]int
	workspaces map[string]int
	bills      map[string]int
}

func MigrateBillDashboard(legacyDB, targetDB *sql.DB, legacyDatabase string, opts MigrateOptions) (*MigrateResult, error) {
	if !looksLikeBillDashboardSchema(legacyDB, legacyDatabase) {
		return nil, fmt.Errorf("legacy database %q does not look like bill_dashboard (expected user, bill, payment tables)", legacyDatabase)
	}

	result := &MigrateResult{}
	maps := &idMaps{
		users:      map[string]int{},
		workspaces: map[string]int{},
		bills:      map[string]int{},
	}

	if err := ensureLegacyIDMapTable(targetDB, opts.DryRun); err != nil {
		return nil, err
	}
	if err := loadExistingIDMaps(targetDB, maps); err != nil {
		return nil, err
	}

	if err := migrateUsers(legacyDB, targetDB, legacyDatabase, opts, result, maps); err != nil {
		return nil, fmt.Errorf("users: %w", err)
	}
	if err := migrateWorkspaces(legacyDB, targetDB, legacyDatabase, opts, result, maps); err != nil {
		return nil, fmt.Errorf("workspaces: %w", err)
	}
	if err := migrateBills(legacyDB, targetDB, legacyDatabase, opts, result, maps); err != nil {
		return nil, fmt.Errorf("bills: %w", err)
	}
	if err := migratePayments(legacyDB, targetDB, legacyDatabase, opts, result, maps); err != nil {
		return nil, fmt.Errorf("payments: %w", err)
	}
	if err := migratePreferences(legacyDB, targetDB, legacyDatabase, opts, result, maps); err != nil {
		return nil, fmt.Errorf("preferences: %w", err)
	}

	return result, nil
}

func looksLikeBillDashboardSchema(db *sql.DB, database string) bool {
	schema, err := Introspect(db, database)
	if err != nil {
		return false
	}
	return looksLikeBillDashboard(schema)
}

func ensureLegacyIDMapTable(db *sql.DB, dryRun bool) error {
	stmt := `CREATE TABLE IF NOT EXISTS legacy_id_map (
		entity_type VARCHAR(50) NOT NULL,
		legacy_id VARCHAR(36) NOT NULL,
		new_id INT NOT NULL,
		migrated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (entity_type, legacy_id)
	)`
	if dryRun {
		return nil
	}
	_, err := db.Exec(stmt)
	return err
}

func loadExistingIDMaps(db *sql.DB, maps *idMaps) error {
	rows, err := db.Query(`SELECT entity_type, legacy_id, new_id FROM legacy_id_map`)
	if err != nil {
		if isMissingTable(err) {
			return nil
		}
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var entityType, legacyID string
		var newID int
		if err := rows.Scan(&entityType, &legacyID, &newID); err != nil {
			return err
		}
		switch entityType {
		case "user":
			maps.users[legacyID] = newID
		case "workspace":
			maps.workspaces[legacyID] = newID
		case "bill":
			maps.bills[legacyID] = newID
		}
	}
	return rows.Err()
}

func saveIDMap(db *sql.DB, entityType, legacyID string, newID int, dryRun bool) error {
	if dryRun {
		return nil
	}
	_, err := db.Exec(
		`INSERT INTO legacy_id_map (entity_type, legacy_id, new_id) VALUES (?, ?, ?)
		 ON DUPLICATE KEY UPDATE new_id = VALUES(new_id)`,
		entityType, legacyID, newID,
	)
	return err
}

type legacyUser struct {
	ID        string
	Email     string
	Password  string
	CreatedAt time.Time
}

func migrateUsers(legacyDB, targetDB *sql.DB, legacyDatabase string, opts MigrateOptions, result *MigrateResult, maps *idMaps) error {
	query := fmt.Sprintf(`
		SELECT id, email, password, createdAt
		FROM %s.user
		ORDER BY createdAt, email`, quoteIdent(legacyDatabase))

	rows, err := legacyDB.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var user legacyUser
		if err := rows.Scan(&user.ID, &user.Email, &user.Password, &user.CreatedAt); err != nil {
			return err
		}

		if existingID, ok := maps.users[user.ID]; ok {
			result.UsersSkipped++
			_ = existingID
			continue
		}

		username := strings.ToLower(strings.TrimSpace(user.Email))
		displayName := displayNameFromEmail(user.Email)

		var existingUserID int
		err := targetDB.QueryRow(`SELECT id FROM users WHERE username = ?`, username).Scan(&existingUserID)
		if err == nil {
			maps.users[user.ID] = existingUserID
			if err := saveIDMap(targetDB, "user", user.ID, existingUserID, opts.DryRun); err != nil {
				return err
			}
			result.UsersSkipped++
			continue
		}
		if err != sql.ErrNoRows {
			return err
		}

		if !strings.HasPrefix(user.Password, "$2") {
			return fmt.Errorf("legacy user %q password is not bcrypt — cannot migrate safely", user.Email)
		}

		if opts.DryRun {
			result.UsersCreated++
			maps.users[user.ID] = result.UsersCreated
			continue
		}

		res, err := targetDB.Exec(
			`INSERT INTO users (username, password, display_name, created_at) VALUES (?, ?, ?, ?)`,
			username, user.Password, nullString(displayName), user.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert user %q: %w", username, err)
		}
		newID64, _ := res.LastInsertId()
		newID := int(newID64)
		maps.users[user.ID] = newID
		if err := saveIDMap(targetDB, "user", user.ID, newID, false); err != nil {
			return err
		}
		result.UsersCreated++
	}
	return rows.Err()
}

func migrateWorkspaces(legacyDB, targetDB *sql.DB, legacyDatabase string, opts MigrateOptions, result *MigrateResult, maps *idMaps) error {
	query := fmt.Sprintf(`
		SELECT id, email
		FROM %s.user
		ORDER BY createdAt, email`, quoteIdent(legacyDatabase))

	rows, err := legacyDB.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var legacyID, email string
		if err := rows.Scan(&legacyID, &email); err != nil {
			return err
		}

		userID, ok := maps.users[legacyID]
		if !ok || userID <= 0 {
			if opts.DryRun && ok && userID == -1 {
				userID = 0
			} else {
				continue
			}
		}

		if workspaceID, ok := maps.workspaces[legacyID]; ok && workspaceID > 0 {
			continue
		}

		if !opts.DryRun && userID > 0 {
			var existingWorkspaceID int
			err := targetDB.QueryRow(
				`SELECT w.id FROM workspaces w
				 INNER JOIN workspace_members wm ON wm.workspace_id = w.id
				 WHERE wm.user_id = ? AND wm.role = 'owner'
				 ORDER BY w.id LIMIT 1`, userID,
			).Scan(&existingWorkspaceID)
			if err == nil {
				maps.workspaces[legacyID] = existingWorkspaceID
				if err := saveIDMap(targetDB, "workspace", legacyID, existingWorkspaceID, false); err != nil {
					return err
				}
				continue
			}
			if err != sql.ErrNoRows {
				return err
			}
		}

		username := strings.ToLower(strings.TrimSpace(email))
		workspaceName := workspaceNameFromEmail(email)
		slugBase := slugify(workspaceName)

		if opts.DryRun {
			result.WorkspacesCreated++
			maps.workspaces[legacyID] = result.WorkspacesCreated
			continue
		}

		slug := slugBase
		var workspaceID int
		var insertErr error
		for i := 1; i < 100; i++ {
			res, err := targetDB.Exec(
				`INSERT INTO workspaces (name, slug, created_by, focus_areas) VALUES (?, ?, ?, ?)`,
				workspaceName, slug, userID, `["planning","finances"]`,
			)
			if err == nil {
				newID64, _ := res.LastInsertId()
				workspaceID = int(newID64)
				insertErr = nil
				break
			}
			insertErr = err
			slug = fmt.Sprintf("%s-%d", slugBase, i+1)
		}
		if insertErr != nil {
			return fmt.Errorf("create workspace for %q: %w", username, insertErr)
		}

		if _, err := targetDB.Exec(
			`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?, ?, 'owner')`,
			workspaceID, userID,
		); err != nil {
			return fmt.Errorf("workspace member for %q: %w", username, err)
		}

		maps.workspaces[legacyID] = workspaceID
		if err := saveIDMap(targetDB, "workspace", legacyID, workspaceID, false); err != nil {
			return err
		}
		result.WorkspacesCreated++
	}
	return rows.Err()
}

type legacyBill struct {
	ID             string
	Category       sql.NullString
	Name           string
	Amount         float64
	InitialDueDate int64
	LatestDueDate  int64
	IsPaidOff      bool
	Recurrence     string
	CreatedAt      time.Time
	UserID         sql.NullString
}

func migrateBills(legacyDB, targetDB *sql.DB, legacyDatabase string, opts MigrateOptions, result *MigrateResult, maps *idMaps) error {
	query := fmt.Sprintf(`
		SELECT id, category, name, amount, initialDueDate, latestDueDate, isPaidOff, recurrence, createdAt, userId
		FROM %s.bill
		WHERE deletedAt IS NULL
		ORDER BY createdAt, name`, quoteIdent(legacyDatabase))

	rows, err := legacyDB.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var bill legacyBill
		if err := rows.Scan(
			&bill.ID, &bill.Category, &bill.Name, &bill.Amount,
			&bill.InitialDueDate, &bill.LatestDueDate, &bill.IsPaidOff, &bill.Recurrence, &bill.CreatedAt, &bill.UserID,
		); err != nil {
			return err
		}

		recurrenceRule := recurrence.NormalizeRule(bill.Recurrence)
		dueDate, err := billAnchorDate(bill)
		if err != nil {
			return fmt.Errorf("bill %q due date: %w", bill.Name, err)
		}
		category := billCategory(bill)

		if existingID, ok := maps.bills[bill.ID]; ok && existingID > 0 {
			if opts.DryRun {
				result.BillsRepaired++
				continue
			}
			if err := updateMigratedBill(targetDB, existingID, bill, recurrenceRule, dueDate, category); err != nil {
				return err
			}
			result.BillsRepaired++
			continue
		}

		userLegacyID := bill.UserID.String
		if !bill.UserID.Valid || userLegacyID == "" {
			result.BillsSkipped++
			continue
		}

		userID, ok := maps.users[userLegacyID]
		workspaceID, wOk := maps.workspaces[userLegacyID]
		if !ok || !wOk || userID == 0 || workspaceID == 0 {
			if opts.DryRun && userID == -1 {
				userID = 0
				workspaceID = 0
			} else {
				result.BillsSkipped++
				continue
			}
		}

		if opts.DryRun {
			result.BillsCreated++
			maps.bills[bill.ID] = result.BillsCreated
			continue
		}

		var recurrenceValue any
		if recurrenceRule == "" {
			recurrenceValue = nil
		} else {
			recurrenceValue = recurrenceRule
		}

		res, err := targetDB.Exec(`
			INSERT INTO bills
				(workspace_id, title, amount, due_date, paid, paid_off, recurrence, category, created_by, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			workspaceID, bill.Name, bill.Amount, dueDate, false, bill.IsPaidOff,
			recurrenceValue, category, userID, bill.CreatedAt,
		)
		if err != nil {
			return fmt.Errorf("insert bill %q: %w", bill.Name, err)
		}
		newID64, _ := res.LastInsertId()
		newID := int(newID64)
		maps.bills[bill.ID] = newID
		if err := saveIDMap(targetDB, "bill", bill.ID, newID, false); err != nil {
			return err
		}
		result.BillsCreated++
	}
	return rows.Err()
}

func billAnchorDate(bill legacyBill) (string, error) {
	if bill.InitialDueDate > 0 {
		return epochMillisToDate(bill.InitialDueDate)
	}
	return epochMillisToDate(bill.LatestDueDate)
}

func billCategory(bill legacyBill) string {
	if bill.Category.Valid && strings.TrimSpace(bill.Category.String) != "" {
		return strings.TrimSpace(bill.Category.String)
	}
	return "general"
}

func updateMigratedBill(
	targetDB *sql.DB,
	billID int,
	bill legacyBill,
	recurrenceRule string,
	dueDate string,
	category string,
) error {
	var recurrenceValue any
	if recurrenceRule == "" {
		recurrenceValue = nil
	} else {
		recurrenceValue = recurrenceRule
	}

	_, err := targetDB.Exec(`
		UPDATE bills
		SET title = ?, amount = ?, due_date = ?, paid = ?, paid_off = ?, recurrence = ?, category = ?
		WHERE id = ?`,
		bill.Name, bill.Amount, dueDate, false, bill.IsPaidOff, recurrenceValue, category, billID,
	)
	if err != nil {
		return fmt.Errorf("repair bill %q: %w", bill.Name, err)
	}
	return nil
}

type legacyPayment struct {
	IsSkip   sql.NullBool
	Amount   float64
	DueDate  sql.NullInt64
	DatePaid int64
	Reference sql.NullString
	Memo     sql.NullString
	BillID   sql.NullString
	BillAmount float64
}

func migratePayments(legacyDB, targetDB *sql.DB, legacyDatabase string, opts MigrateOptions, result *MigrateResult, maps *idMaps) error {
	query := fmt.Sprintf(`
		SELECT p.isSkip, p.amount, p.dueDate, p.datePaid, p.reference, p.memo, p.billId, b.amount
		FROM %s.payment p
		INNER JOIN %s.bill b ON b.id = p.billId
		WHERE p.deletedAt IS NULL AND b.deletedAt IS NULL
		ORDER BY p.dueDate, p.datePaid`, quoteIdent(legacyDatabase), quoteIdent(legacyDatabase))

	rows, err := legacyDB.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var payment legacyPayment
		if err := rows.Scan(
			&payment.IsSkip, &payment.Amount, &payment.DueDate, &payment.DatePaid,
			&payment.Reference, &payment.Memo, &payment.BillID, &payment.BillAmount,
		); err != nil {
			return err
		}

		if !payment.BillID.Valid {
			result.PaymentsSkipped++
			continue
		}

		billID, ok := maps.bills[payment.BillID.String]
		if !ok || billID <= 0 {
			result.PaymentsSkipped++
			continue
		}

		occurrenceMS := payment.DatePaid
		if payment.DueDate.Valid && payment.DueDate.Int64 > 0 {
			occurrenceMS = payment.DueDate.Int64
		}
		occurrenceDate, err := epochMillisToDate(occurrenceMS)
		if err != nil {
			result.PaymentsSkipped++
			continue
		}

		skipped := payment.IsSkip.Valid && payment.IsSkip.Bool
		paid := !skipped && payment.DatePaid > 0

		var paidAt any
		if paid {
			date, err := epochMillisToDate(payment.DatePaid)
			if err != nil {
				result.PaymentsSkipped++
				continue
			}
			paidAt = date
		}

		var amountOverride any
		if payment.Amount != payment.BillAmount {
			amountOverride = payment.Amount
		}

		notes := paymentNotes(payment.Reference, payment.Memo)

		var workspaceID int
		if opts.DryRun {
			workspaceID = 1
		} else {
			var err error
			workspaceID, err = workspaceIDForBill(targetDB, billID)
			if err != nil {
				return err
			}
			if workspaceID == 0 {
				result.PaymentsSkipped++
				continue
			}
		}

		if opts.DryRun {
			result.PaymentsCreated++
			continue
		}

		_, err = targetDB.Exec(`
			INSERT INTO recurrence_occurrence_states
				(workspace_id, entity_type, series_id, occurrence_at, paid, paid_at, amount_override, payment_notes, skipped)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON DUPLICATE KEY UPDATE
				paid = VALUES(paid),
				paid_at = VALUES(paid_at),
				amount_override = VALUES(amount_override),
				payment_notes = VALUES(payment_notes),
				skipped = VALUES(skipped)`,
			workspaceID, recurrence.EntityBill, billID, occurrenceDate, paid, paidAt,
			amountOverride, nullString(notes), skipped,
		)
		if err != nil {
			return fmt.Errorf("insert payment state for bill %d @ %s: %w", billID, occurrenceDate, err)
		}
		result.PaymentsCreated++
	}
	return rows.Err()
}

func migratePreferences(legacyDB, targetDB *sql.DB, legacyDatabase string, opts MigrateOptions, result *MigrateResult, maps *idMaps) error {
	query := fmt.Sprintf(`
		SELECT side, primaryColor, secondaryColor, darkMode, userId
		FROM %s.preferences`, quoteIdent(legacyDatabase))

	rows, err := legacyDB.Query(query)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var side string
		var primaryColor, secondaryColor sql.NullString
		var darkMode bool
		var userLegacyID sql.NullString
		if err := rows.Scan(&side, &primaryColor, &secondaryColor, &darkMode, &userLegacyID); err != nil {
			return err
		}
		if !userLegacyID.Valid {
			continue
		}

		userID, ok := maps.users[userLegacyID.String]
		if !ok || userID <= 0 {
			continue
		}

		settings := map[string]any{
			"layoutSide": side,
			"darkMode":   darkMode,
		}
		if primaryColor.Valid {
			settings["primaryColor"] = primaryColor.String
		}
		if secondaryColor.Valid {
			settings["secondaryColor"] = secondaryColor.String
		}

		settingsJSON, err := json.Marshal(settings)
		if err != nil {
			return err
		}

		if opts.DryRun {
			result.PreferencesPatched++
			continue
		}

		_, err = targetDB.Exec(`UPDATE users SET settings = ? WHERE id = ?`, string(settingsJSON), userID)
		if err != nil {
			return fmt.Errorf("patch settings for user %d: %w", userID, err)
		}
		result.PreferencesPatched++
	}
	return rows.Err()
}

func workspaceIDForBill(db *sql.DB, billID int) (int, error) {
	var workspaceID int
	err := db.QueryRow(`SELECT workspace_id FROM bills WHERE id = ?`, billID).Scan(&workspaceID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return workspaceID, err
}

func paymentNotes(reference, memo sql.NullString) string {
	parts := []string{}
	if reference.Valid && strings.TrimSpace(reference.String) != "" {
		parts = append(parts, strings.TrimSpace(reference.String))
	}
	if memo.Valid && strings.TrimSpace(memo.String) != "" {
		parts = append(parts, strings.TrimSpace(memo.String))
	}
	return strings.Join(parts, " — ")
}

func epochMillisToDate(ms int64) (string, error) {
	if ms <= 0 {
		return "", fmt.Errorf("invalid epoch ms %d", ms)
	}
	t := time.UnixMilli(ms).UTC()
	return t.Format("2006-01-02"), nil
}

func displayNameFromEmail(email string) string {
	local := strings.TrimSpace(email)
	if at := strings.Index(local, "@"); at > 0 {
		local = local[:at]
	}
	local = strings.ReplaceAll(local, ".", " ")
	local = strings.ReplaceAll(local, "_", " ")
	return strings.TrimSpace(local)
}

func workspaceNameFromEmail(email string) string {
	name := displayNameFromEmail(email)
	if name == "" {
		return "Home"
	}
	return name + "'s Home"
}

var slugRegexp = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	slug := strings.ToLower(strings.TrimSpace(name))
	slug = slugRegexp.ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return "workspace"
	}
	return slug
}

func quoteIdent(name string) string {
	return "`" + strings.ReplaceAll(name, "`", "``") + "`"
}

func nullString(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func isMissingTable(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "doesn't exist") || strings.Contains(msg, "does not exist")
}
