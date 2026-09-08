package legacy

import (
	"fmt"
	"sort"
	"strings"
)

type ColumnMapping struct {
	Source string `json:"source,omitempty"`
	Target string `json:"target"`
	Note   string `json:"note,omitempty"`
}

type TableMapping struct {
	SourceTable   string          `json:"source_table,omitempty"`
	TargetTable   string          `json:"target_table"`
	Confidence    string          `json:"confidence"`
	RowCount      int64           `json:"row_count,omitempty"`
	ColumnMap     []ColumnMapping `json:"column_map"`
	TransformNotes []string       `json:"transform_notes,omitempty"`
	BlockedReason string          `json:"blocked_reason,omitempty"`
}

type MigrationStrategy struct {
	LegacyDatabase  string         `json:"legacy_database"`
	TargetDatabase  string         `json:"target_database"`
	LegacyTables    []string       `json:"legacy_tables"`
	TargetTables    []string       `json:"target_tables"`
	Mappings        []TableMapping `json:"mappings"`
	UnmappedLegacy  []string       `json:"unmapped_legacy_tables"`
	UnmappedTarget  []string       `json:"unmapped_target_tables"`
	Phases          []string       `json:"recommended_phases"`
	Warnings        []string       `json:"warnings"`
}

var legacyTableAliases = map[string]string{
	"user":              "users",
	"users":             "users",
	"account":           "users",
	"accounts":          "users",
	"bill":              "bills",
	"bills":             "bills",
	"recurring_bills":   "bills",
	"recurring_bill":    "bills",
	"expense":           "expenses",
	"expenses":          "expenses",
	"income":            "income_entries",
	"incomes":           "income_entries",
	"income_entry":      "income_entries",
	"income_entries":    "income_entries",
	"paycheck":          "income_entries",
	"paychecks":         "income_entries",
	"event":             "events",
	"events":            "events",
	"calendar_events":   "events",
	"calendar_event":    "events",
	"appointment":       "events",
	"appointments":      "events",
	"todo":              "todos",
	"todos":             "todos",
	"task":              "todos",
	"tasks":             "todos",
	"todo_item":         "todos",
	"todo_items":        "todos",
	"checklist_item":    "todos",
	"checklist_items":   "todos",
	"todo_list":         "todo_lists",
	"todo_lists":        "todo_lists",
	"list":              "todo_lists",
	"lists":             "todo_lists",
	"checklist":         "todo_lists",
	"checklists":        "todo_lists",
	"note":              "notes",
	"notes":             "notes",
	"journal":           "notes",
	"journal_entries":   "notes",
	"workspace":         "workspaces",
	"workspaces":        "workspaces",
	"recurrence_exception":          "recurrence_exceptions",
	"recurrence_exceptions":         "recurrence_exceptions",
	"recurrence_occurrence_state":   "recurrence_occurrence_states",
	"recurrence_occurrence_states":  "recurrence_occurrence_states",
	"payment":                       "recurrence_occurrence_states",
	"payments":                      "recurrence_occurrence_states",
	"chat_conversation":             "chat_conversations",
	"chat_conversations":            "chat_conversations",
	"chat_message":                  "chat_messages",
	"chat_messages":                 "chat_messages",
	"message":                       "chat_messages",
	"messages":                      "chat_messages",
}

func BuildStrategy(legacy *DatabaseSchema, targetDatabase string) *MigrationStrategy {
	strategy := &MigrationStrategy{
		LegacyDatabase: legacy.Database,
		TargetDatabase: targetDatabase,
		TargetTables:   TargetTableNames(),
		Phases: []string{
			"Phase 1 — Users & workspaces: migrate users, create one workspace per legacy household/user, seed workspace_members.",
			"Phase 2 — Core finance: income_entries, bills, expenses (map recurrence + paid/skipped occurrence states).",
			"Phase 3 — Planning: events, todo_lists, todos, notes (daily lists keyed by list_date).",
			"Phase 4 — Recurrence metadata: recurrence_exceptions and recurrence_occurrence_states.",
			"Phase 5 — Optional: chat tables if present in legacy data.",
		},
	}

	mappedLegacy := map[string]bool{}
	mappedTarget := map[string]bool{}

	for _, table := range legacy.Tables {
		strategy.LegacyTables = append(strategy.LegacyTables, table.Name)
		target := resolveTargetTable(table.Name)
		if target == "" {
			continue
		}

		mapping := buildTableMapping(table, target)
		strategy.Mappings = append(strategy.Mappings, mapping)
		mappedLegacy[table.Name] = true
		mappedTarget[target] = true
	}

	sort.Strings(strategy.LegacyTables)
	sort.Slice(strategy.Mappings, func(i, j int) bool {
		return strategy.Mappings[i].TargetTable < strategy.Mappings[j].TargetTable
	})

	for _, table := range legacy.Tables {
		if !mappedLegacy[table.Name] {
			strategy.UnmappedLegacy = append(strategy.UnmappedLegacy, table.Name)
		}
	}
	sort.Strings(strategy.UnmappedLegacy)

	for _, target := range TargetTableNames() {
		if !mappedTarget[target] && target != "workspace_members" {
			strategy.UnmappedTarget = append(strategy.UnmappedTarget, target)
		}
	}
	sort.Strings(strategy.UnmappedTarget)

	applyBillDashboardEnhancements(legacy, strategy)
	strategy.Warnings = buildWarnings(legacy, strategy)
	return strategy
}

func resolveTargetTable(sourceName string) string {
	key := strings.ToLower(strings.TrimSpace(sourceName))
	if target, ok := legacyTableAliases[key]; ok {
		return target
	}
	if _, ok := TargetSchema[key]; ok {
		return key
	}
	return ""
}

func buildTableMapping(source Table, target string) TableMapping {
	targetCols := TargetSchema[target]
	sourceCols := ColumnNames(source)

	mapping := TableMapping{
		SourceTable: source.Name,
		TargetTable: target,
		RowCount:    source.RowCount,
		Confidence:  scoreConfidence(source.Name, target, sourceCols, targetCols),
	}

	for _, targetCol := range targetCols {
		cm := ColumnMapping{Target: targetCol}
		switch targetCol {
		case "workspace_id":
			cm.Note = "Inject during migration — legacy app may be single-tenant without workspaces"
		case "created_by":
			cm.Source = pickSourceColumn(source, "created_by", "user_id", "owner_id", "author_id")
			if cm.Source == "" {
				cm.Note = "Default to migrated workspace owner user id"
			}
		case "list_id":
			cm.Source = pickSourceColumn(source, "list_id", "todo_list_id", "checklist_id")
			if cm.Source == "" && target == "todos" {
				cm.Note = "Resolve via todo_lists migration (daily list per due_date or legacy list fk)"
			}
		case "kind":
			cm.Note = "Set explicitly: todo_lists.kind = 'daily'|'general'; chat_conversations.kind = 'group'|'direct'"
		case "role":
			cm.Note = "Default workspace_members.role = 'owner' for legacy primary user, 'member' otherwise"
		case "slug":
			cm.Note = "Generate from workspace name (slugify + dedupe)"
		case "focus_areas":
			cm.Note = "Default JSON [\"planning\",\"finances\"] when absent"
		case "entity_type":
			cm.Note = "Use recurrence.EntityBill | EntityIncome | EntityEvent constants"
		case "rrule", "recurrence":
			cm.Source = pickSourceColumn(source, "rrule", "recurrence", "recurrence_rule", "repeat_rule")
			cm.Note = "Normalize via recurrence.NormalizeRule(); empty/null => one-off row"
		default:
			candidates := append([]string{targetCol}, aliasCandidates(targetCol)...)
			cm.Source = pickSourceColumn(source, candidates...)
		}
		if cm.Source == "" && cm.Note == "" {
			cm.Note = "No direct legacy column — may need default/null"
		}
		mapping.ColumnMap = append(mapping.ColumnMap, cm)
	}

	mapping.TransformNotes = buildTransformNotes(source, target)
	return mapping
}

func aliasCandidates(targetCol string) []string {
	switch targetCol {
	case "title":
		return []string{"title", "name", "label", "description"}
	case "amount":
		return []string{"amount", "value", "total", "cost"}
	case "due_date":
		return []string{"due_date", "duedate", "latestduedate", "initialduedate", "date", "bill_date", "scheduled_date"}
	case "entry_date":
		return []string{"entry_date", "date", "income_date", "received_date"}
	case "expense_date":
		return []string{"expense_date", "date", "spent_date", "transaction_date"}
	case "paid":
		return []string{"paid", "is_paid", "paid_flag", "ispaidoff"}
	case "paid_at":
		return []string{"paid_at", "paid_date", "payment_date", "datepaid"}
	case "skipped":
		return []string{"skipped", "is_skipped", "skip", "isskip"}
	case "payment_notes":
		return []string{"payment_notes", "pay_note", "payment_note", "notes"}
	case "category":
		return []string{"category", "type", "group"}
	case "notes", "content":
		return []string{"notes", "content", "body", "text", "markdown"}
	case "completed":
		return []string{"completed", "is_complete", "done", "checked"}
	case "position":
		return []string{"position", "sort_order", "order_index", "idx"}
	case "start_at":
		return []string{"start_at", "starts_at", "start_time", "start_date"}
	case "end_at":
		return []string{"end_at", "ends_at", "end_time", "end_date"}
	case "all_day":
		return []string{"all_day", "is_all_day", "allday"}
	case "color":
		return []string{"color", "colour", "hex_color"}
	case "username":
		return []string{"username", "email", "login", "user_name"}
	case "password":
		return []string{"password", "password_hash", "hashed_password"}
	case "display_name":
		return []string{"display_name", "full_name", "name"}
	case "created_at":
		return []string{"created_at", "createdat"}
	case "updated_at":
		return []string{"updated_at", "updatedat"}
	case "created_by":
		return []string{"created_by", "userid", "user_id", "owner_id", "author_id"}
	case "series_id":
		return []string{"series_id", "billid", "bill_id"}
	case "list_date":
		return []string{"list_date", "date", "day", "list_day"}
	case "occurrence_at":
		return []string{"occurrence_at", "occurrence_date", "due_date", "date"}
	case "action":
		return []string{"action", "exception_action"}
	case "override_json":
		return []string{"override_json", "override", "payload_json"}
	case "amount_override":
		return []string{"amount_override", "override_amount"}
	case "conversation_id":
		return []string{"conversation_id", "chat_id", "thread_id"}
	case "sender_id":
		return []string{"sender_id", "user_id", "author_id"}
	default:
		return []string{targetCol}
	}
}

func pickSourceColumn(source Table, candidates ...string) string {
	for _, candidate := range candidates {
		if col := FindColumn(source, candidate); col != "" {
			return col
		}
	}
	return ""
}

func scoreConfidence(sourceName, target string, sourceCols, targetCols []string) string {
	if strings.EqualFold(sourceName, target) {
		return "high"
	}
	if resolveTargetTable(sourceName) != "" {
		overlap := columnOverlap(sourceCols, targetCols)
		if overlap >= 0.45 {
			return "high"
		}
		if overlap >= 0.25 {
			return "medium"
		}
		return "low"
	}
	return "low"
}

func columnOverlap(sourceCols, targetCols []string) float64 {
	if len(targetCols) == 0 {
		return 0
	}
	sourceSet := map[string]struct{}{}
	for _, col := range sourceCols {
		sourceSet[strings.ToLower(col)] = struct{}{}
	}
	matches := 0
	for _, targetCol := range targetCols {
		for _, candidate := range aliasCandidates(targetCol) {
			if _, ok := sourceSet[strings.ToLower(candidate)]; ok {
				matches++
				break
			}
			if _, ok := sourceSet[strings.ToLower(targetCol)]; ok {
				matches++
				break
			}
		}
	}
	return float64(matches) / float64(len(targetCols))
}

func buildTransformNotes(source Table, target string) []string {
	var notes []string

	switch target {
	case "users":
		if !HasColumn(source, "password") && HasColumn(source, "password_hash") {
			notes = append(notes, "Verify password hash algorithm matches bcrypt used by tracking app auth")
		}
	case "workspaces":
		notes = append(notes, "If legacy DB has no workspace table, synthesize one workspace per user or per legacy account group")
	case "workspace_members":
		notes = append(notes, "Not expected in legacy DB — create rows after users + workspaces migrate")
	case "bills", "expenses":
		if HasColumn(source, "recurrence") || HasColumn(source, "rrule") {
			notes = append(notes, "Recurring rows stay in bills/expenses; per-occurrence paid/skipped state goes to recurrence_occurrence_states")
		}
	case "income_entries":
		notes = append(notes, "Map legacy income/paycheck rows; recurrence stored in income_entries.recurrence TEXT")
	case "events":
		if HasColumn(source, "all_day") || HasColumn(source, "is_all_day") {
			notes = append(notes, "Preserve all_day; map rrule for recurring events")
		}
	case "todo_lists":
		notes = append(notes, "Create daily lists (kind=daily, list_date=YYYY-MM-DD) for planner/checklist views")
	case "todos":
		notes = append(notes, "Attach each todo to workspace + list_id; preserve position ordering")
	case "notes":
		if HasColumn(source, "list_id") || HasColumn(source, "todo_list_id") {
			notes = append(notes, "Optional list_id links note to a daily checklist")
		}
	case "recurrence_occurrence_states":
		notes = append(notes, "Legacy bill payment history often lives here — entity_type='bill', series_id=bills.id")
	}

	if source.RowCount == 0 {
		notes = append(notes, "Source table is empty — migration can skip or still create schema mapping for future imports")
	}

	return notes
}

func buildWarnings(legacy *DatabaseSchema, strategy *MigrationStrategy) []string {
	var warnings []string

	hasUsers := false
	hasWorkspaces := false
	for _, m := range strategy.Mappings {
		if m.TargetTable == "users" {
			hasUsers = true
		}
		if m.TargetTable == "workspaces" {
			hasWorkspaces = true
		}
	}
	if !hasUsers {
		warnings = append(warnings, "No legacy users table detected — migration must create a service user or import users manually before finance/planner data")
	}
	if !hasWorkspaces {
		wwarnings := "Legacy DB appears single-tenant — plan to create workspaces + workspace_members during import"
		warnings = append(warnings, wwarnings)
	}

	if len(strategy.UnmappedLegacy) > 0 {
		warnings = append(warnings, fmt.Sprintf("%d legacy table(s) have no mapping — review for join/lookup data: %s",
			len(strategy.UnmappedLegacy), strings.Join(strategy.UnmappedLegacy, ", ")))
	}

	for _, table := range legacy.Tables {
		if table.RowCount > 0 && resolveTargetTable(table.Name) == "" {
			if table.Name == "preferences" && looksLikeBillDashboard(legacy) {
				continue
			}
			warnings = append(warnings, fmt.Sprintf("Legacy table %q has %d rows but no target mapping", table.Name, table.RowCount))
		}
	}

	return warnings
}

func FormatStrategyMarkdown(strategy *MigrationStrategy, legacy *DatabaseSchema) string {
	var b strings.Builder

	b.WriteString("# Legacy database migration strategy\n\n")
	b.WriteString(fmt.Sprintf("- **Legacy database:** `%s`\n", strategy.LegacyDatabase))
	b.WriteString(fmt.Sprintf("- **Target database:** `%s`\n", strategy.TargetDatabase))
	b.WriteString(fmt.Sprintf("- **Legacy tables:** %d\n", len(strategy.LegacyTables)))
	b.WriteString(fmt.Sprintf("- **Mapped tables:** %d\n\n", len(strategy.Mappings)))

	b.WriteString("## Recommended phases\n\n")
	for i, phase := range strategy.Phases {
		b.WriteString(fmt.Sprintf("%d. %s\n", i+1, phase))
	}
	b.WriteString("\n")

	if len(strategy.Warnings) > 0 {
		b.WriteString("## Warnings\n\n")
		for _, warning := range strategy.Warnings {
			b.WriteString(fmt.Sprintf("- %s\n", warning))
		}
		b.WriteString("\n")
	}

	b.WriteString("## Legacy schema summary\n\n")
	b.WriteString("| Table | Rows | Columns |\n")
	b.WriteString("| --- | ---: | --- |\n")
	for _, table := range legacy.Tables {
		b.WriteString(fmt.Sprintf("| `%s` | %d | %s |\n", table.Name, table.RowCount, strings.Join(ColumnNames(table), ", ")))
	}
	b.WriteString("\n")

	b.WriteString("## Table mappings\n\n")
	for _, mapping := range strategy.Mappings {
		b.WriteString(fmt.Sprintf("### `%s` → `%s` (%s confidence", mapping.SourceTable, mapping.TargetTable, mapping.Confidence))
		if mapping.RowCount > 0 {
			b.WriteString(fmt.Sprintf(", %d rows", mapping.RowCount))
		}
		b.WriteString(")\n\n")

		if len(mapping.TransformNotes) > 0 {
			for _, note := range mapping.TransformNotes {
				b.WriteString(fmt.Sprintf("- %s\n", note))
			}
			b.WriteString("\n")
		}

		b.WriteString("| Target column | Legacy column | Notes |\n")
		b.WriteString("| --- | --- | --- |\n")
		for _, col := range mapping.ColumnMap {
			source := col.Source
			if source == "" {
				source = "—"
			}
			note := col.Note
			if note == "" {
				note = "—"
			}
			b.WriteString(fmt.Sprintf("| `%s` | `%s` | %s |\n", col.Target, source, note))
		}
		b.WriteString("\n")
	}

	if len(strategy.UnmappedLegacy) > 0 {
		b.WriteString("## Unmapped legacy tables\n\n")
		for _, name := range strategy.UnmappedLegacy {
			b.WriteString(fmt.Sprintf("- `%s`\n", name))
		}
		b.WriteString("\n")
	}

	if len(strategy.UnmappedTarget) > 0 {
		b.WriteString("## Target tables with no legacy source\n\n")
		for _, name := range strategy.UnmappedTarget {
			b.WriteString(fmt.Sprintf("- `%s`\n", name))
		}
		b.WriteString("\n")
	}

	if looksLikeBillDashboard(legacy) {
		b.WriteString("## Bill Dashboard import order\n\n")
		for i, step := range BillDashboardImportOrder() {
			b.WriteString(fmt.Sprintf("%d. %s\n", i+1, step))
		}
		b.WriteString("\n")
		b.WriteString("## Tables to skip\n\n")
		for _, name := range BillDashboardSkipTables() {
			b.WriteString(fmt.Sprintf("- `%s`\n", name))
		}
		b.WriteString("\n")
		b.WriteString("## Example SQL\n\n")
		b.WriteString("```sql\n")
		b.WriteString(FormatBillDashboardSQLPreview())
		b.WriteString("\n```\n\n")
	}

	b.WriteString("## Next steps\n\n")
	b.WriteString("1. Review unmapped legacy tables — they may be auth/session/config tables safe to ignore.\n")
	b.WriteString("2. Confirm password hash compatibility for migrated users.\n")
	b.WriteString("3. Decide workspace strategy (one workspace per user vs shared household).\n")
	b.WriteString("4. Implement `cmd/migrate-legacy` import using the column maps above.\n")
	b.WriteString("5. Run import against a copy of `tracking_app`, validate in UI, then cut over.\n")

	return b.String()
}
