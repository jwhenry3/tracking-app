package legacy

// TargetSchema describes the tables the tracking app expects after database.Migrate().
var TargetSchema = map[string][]string{
	"users": {
		"id", "username", "password", "display_name", "avatar_path", "settings", "created_at",
	},
	"workspaces": {
		"id", "name", "slug", "created_by", "focus_areas", "created_at",
	},
	"workspace_members": {
		"id", "workspace_id", "user_id", "role", "joined_at",
	},
	"events": {
		"id", "workspace_id", "title", "description", "start_at", "end_at", "all_day", "color", "rrule", "created_by", "created_at",
	},
	"income_entries": {
		"id", "workspace_id", "title", "amount", "entry_date", "recurrence", "notes", "created_by", "created_at",
	},
	"bills": {
		"id", "workspace_id", "title", "amount", "due_date", "paid", "paid_at", "recurrence", "category", "payment_notes", "skipped", "created_by", "created_at",
	},
	"expenses": {
		"id", "workspace_id", "title", "amount", "expense_date", "category", "notes", "paid", "paid_at", "skipped", "payment_notes", "created_by", "created_at",
	},
	"todo_lists": {
		"id", "workspace_id", "name", "kind", "list_date", "created_at",
	},
	"todos": {
		"id", "workspace_id", "list_id", "title", "completed", "due_date", "position", "created_by", "created_at",
	},
	"notes": {
		"id", "workspace_id", "list_id", "title", "content", "created_by", "created_at", "updated_at",
	},
	"recurrence_exceptions": {
		"id", "workspace_id", "entity_type", "series_id", "occurrence_at", "action", "override_json", "created_at",
	},
	"recurrence_occurrence_states": {
		"id", "workspace_id", "entity_type", "series_id", "occurrence_at", "paid", "paid_at", "amount_override", "payment_notes", "skipped",
	},
	"chat_conversations": {
		"id", "workspace_id", "kind", "created_at",
	},
	"chat_messages": {
		"id", "conversation_id", "sender_id", "content", "created_at",
	},
}

func TargetTableNames() []string {
	names := make([]string, 0, len(TargetSchema))
	for name := range TargetSchema {
		names = append(names, name)
	}
	return names
}
