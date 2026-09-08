package legacy

import (
	"fmt"
	"strings"
)

// applyBillDashboardEnhancements adds domain-specific guidance when the legacy
// schema matches the bill_dashboard app (TypeORM-style camelCase tables).
func applyBillDashboardEnhancements(legacy *DatabaseSchema, strategy *MigrationStrategy) {
	if !looksLikeBillDashboard(legacy) {
		return
	}

	strategy.Phases = []string{
		"Phase 1 — Users: import user → users (email → username). Verify bcrypt password hashes.",
		"Phase 2 — Workspaces: create one workspace per legacy user (name from email local-part), workspace_members as owner.",
		"Phase 3 — Bills: import bill → bills (skip rows where deletedAt IS NOT NULL). Map UUID ids to new INT ids via id_map table.",
		"Phase 4 — Payment history: import payment → recurrence_occurrence_states (entity_type='bill', series_id=new bill id).",
		"Phase 5 — Preferences: merge preferences → users.settings JSON (theme colors, darkMode, layout side).",
		"Phase 6 — Cleanup: ignore migrations + reset_password_token tables.",
	}

	notes := []string{
		"Legacy ids are UUID strings — build id_map(legacy_table, legacy_id, new_id) during import.",
		"bill.initialDueDate / bill.latestDueDate / payment.dueDate / payment.datePaid are epoch milliseconds (BIGINT) — convert to DATE/DATETIME.",
		"bill.isPaidOff marks the whole series paid off; per-occurrence paid/skipped state lives in payment rows.",
		"payment.isSkip=1 → recurrence_occurrence_states.skipped; payment.datePaid → paid_at when not skipped.",
		"payment.amount may differ from bill.amount — store as amount_override on occurrence state.",
		"Combine payment.reference + payment.memo into payment_notes when present.",
		"Filter soft-deleted rows: bill.deletedAt and payment.deletedAt must be NULL.",
	}

	for i := range strategy.Mappings {
		switch strategy.Mappings[i].SourceTable {
		case "bill":
			strategy.Mappings[i].TransformNotes = append(strategy.Mappings[i].TransformNotes, notes...)
			strategy.Mappings[i].TransformNotes = append(strategy.Mappings[i].TransformNotes,
				"Use latestDueDate (epoch ms) as bills.due_date for the series anchor",
				"Set bills.paid from isPaidOff; occurrence-level history comes from payment table",
			)
		case "payment":
			strategy.Mappings[i].TransformNotes = append(strategy.Mappings[i].TransformNotes,
				"entity_type must be 'bill' for all payment rows",
				"occurrence_at = DATE(FROM_UNIXTIME(dueDate/1000)) when dueDate set, else derive from datePaid",
				"paid = (isSkip=0 AND datePaid > 0); paid_at from datePaid epoch ms",
			)
		case "user":
			strategy.Mappings[i].TransformNotes = append(strategy.Mappings[i].TransformNotes,
				"username = lower(email); display_name optional from email local-part",
			)
		}
	}

	// Document preferences as a manual transform even though it has no 1:1 target table.
	if table := findTable(legacy, "preferences"); table != nil {
		strategy.Mappings = append(strategy.Mappings, TableMapping{
			SourceTable: "preferences",
			TargetTable: "users.settings",
			Confidence:  "high",
			RowCount:    table.RowCount,
			ColumnMap: []ColumnMapping{
				{Target: "settings", Source: "side,primaryColor,secondaryColor,darkMode", Note: "Merge into users.settings JSON keyed by userId"},
			},
			TransformNotes: []string{
				"Update users.settings for matching userId after user import",
				"Example: {\"layoutSide\": side, \"primaryColor\": ..., \"darkMode\": ...}",
			},
		})
		removeFromSlice(&strategy.UnmappedLegacy, "preferences")
	}

	strategy.Warnings = append(strategy.Warnings,
		"Bill dashboard detected: confirm legacy password field uses bcrypt ($2a/$2b prefix)",
		"1561 payment rows must migrate to recurrence_occurrence_states or paid bill history will be lost",
	)
}

func looksLikeBillDashboard(schema *DatabaseSchema) bool {
	names := map[string]struct{}{}
	for _, table := range schema.Tables {
		names[strings.ToLower(table.Name)] = struct{}{}
	}
	_, hasBill := names["bill"]
	_, hasPayment := names["payment"]
	_, hasUser := names["user"]
	return hasBill && hasPayment && hasUser
}

func findTable(schema *DatabaseSchema, name string) *Table {
	lower := strings.ToLower(name)
	for i := range schema.Tables {
		if strings.ToLower(schema.Tables[i].Name) == lower {
			return &schema.Tables[i]
		}
	}
	return nil
}

func removeFromSlice(items *[]string, value string) {
	filtered := (*items)[:0]
	for _, item := range *items {
		if item != value {
			filtered = append(filtered, item)
		}
	}
	*items = filtered
}

func BillDashboardImportOrder() []string {
	return []string{
		"users (from user)",
		"workspaces + workspace_members (synthesized)",
		"bills (from bill, excluding soft-deleted)",
		"recurrence_occurrence_states (from payment, excluding soft-deleted)",
		"users.settings patch (from preferences)",
	}
}

func BillDashboardSkipTables() []string {
	return []string{"migrations", "reset_password_token"}
}

func FormatBillDashboardSQLPreview() string {
	return fmt.Sprintf(`-- Example import queries (run after id_map tables are populated)

-- 1) Users
INSERT INTO users (username, password, created_at)
SELECT LOWER(email), password, createdAt FROM bill_dashboard_dev.user;

-- 2) Bills (epoch ms → date)
INSERT INTO bills (workspace_id, title, amount, due_date, paid, recurrence, category, created_by, created_at)
SELECT
  :workspace_id,
  b.name,
  b.amount,
  DATE(FROM_UNIXTIME(b.latestDueDate / 1000)),
  b.isPaidOff,
  NULLIF(TRIM(b.recurrence), ''),
  COALESCE(b.category, 'general'),
  :user_id,
  b.createdAt
FROM bill_dashboard_dev.bill b
WHERE b.deletedAt IS NULL;

-- 3) Occurrence states from payments
INSERT INTO recurrence_occurrence_states
  (workspace_id, entity_type, series_id, occurrence_at, paid, paid_at, amount_override, payment_notes, skipped)
SELECT
  :workspace_id,
  'bill',
  map.new_id,
  DATE(FROM_UNIXTIME(COALESCE(p.dueDate, p.datePaid) / 1000)),
  CASE WHEN COALESCE(p.isSkip, 0) = 0 AND p.datePaid > 0 THEN 1 ELSE 0 END,
  CASE WHEN COALESCE(p.isSkip, 0) = 0 AND p.datePaid > 0 THEN DATE(FROM_UNIXTIME(p.datePaid / 1000)) END,
  CASE WHEN p.amount <> b.amount THEN p.amount END,
  NULLIF(TRIM(CONCAT_WS(' ', p.reference, p.memo)), ''),
  COALESCE(p.isSkip, 0)
FROM bill_dashboard_dev.payment p
JOIN bill_dashboard_dev.bill b ON b.id = p.billId
JOIN id_map map ON map.legacy_table = 'bill' AND map.legacy_id = b.id
WHERE p.deletedAt IS NULL AND b.deletedAt IS NULL;`)
}
