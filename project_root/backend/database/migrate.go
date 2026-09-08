package database

import (
	"database/sql"
	"strings"
)

var migrationStatements = []string{
	`CREATE TABLE IF NOT EXISTS users (
		id INT AUTO_INCREMENT PRIMARY KEY,
		username VARCHAR(255) NOT NULL UNIQUE,
		password VARCHAR(255) NOT NULL,
		email VARCHAR(255) NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uniq_users_email (email)
	)`,
	`CREATE TABLE IF NOT EXISTS workspaces (
		id INT AUTO_INCREMENT PRIMARY KEY,
		name VARCHAR(255) NOT NULL,
		slug VARCHAR(255) NOT NULL UNIQUE,
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS workspace_members (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		user_id INT NOT NULL,
		role VARCHAR(50) NOT NULL DEFAULT 'member',
		manage_areas JSON NULL,
		joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uniq_workspace_user (workspace_id, user_id),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS events (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		title VARCHAR(255) NOT NULL,
		description TEXT,
		start_at DATETIME NOT NULL,
		end_at DATETIME NOT NULL,
		all_day BOOLEAN NOT NULL DEFAULT FALSE,
		color VARCHAR(20) DEFAULT '#3b82f6',
		rrule TEXT NULL,
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS income_entries (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		title VARCHAR(255) NOT NULL,
		amount DECIMAL(12,2) NOT NULL,
		entry_date DATE NOT NULL,
		recurrence TEXT NULL,
		notes TEXT,
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS bills (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		title VARCHAR(255) NOT NULL,
		amount DECIMAL(12,2) NOT NULL,
		due_date DATE NOT NULL,
		paid BOOLEAN NOT NULL DEFAULT FALSE,
		paid_at DATE NULL,
		recurrence TEXT NULL,
		category VARCHAR(100) DEFAULT 'general',
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS expenses (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		title VARCHAR(255) NOT NULL,
		amount DECIMAL(12,2) NOT NULL,
		expense_date DATE NOT NULL,
		category VARCHAR(100) DEFAULT 'general',
		notes TEXT,
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS todo_lists (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		name VARCHAR(255) NOT NULL,
		kind VARCHAR(50) NOT NULL DEFAULT 'general',
		list_date DATE NULL,
		recurrence TEXT NULL,
		series_id INT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		CONSTRAINT fk_todo_lists_series FOREIGN KEY (series_id) REFERENCES todo_lists(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS todos (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		list_id INT NOT NULL,
		title VARCHAR(255) NOT NULL,
		completed BOOLEAN NOT NULL DEFAULT FALSE,
		due_date DATE NULL,
		position INT NOT NULL DEFAULT 0,
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE CASCADE,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS notes (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		list_id INT NULL,
		title VARCHAR(255) NOT NULL,
		content TEXT NOT NULL,
		created_by INT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (list_id) REFERENCES todo_lists(id) ON DELETE SET NULL,
		FOREIGN KEY (created_by) REFERENCES users(id)
	)`,
	`CREATE TABLE IF NOT EXISTS recurrence_exceptions (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		entity_type VARCHAR(20) NOT NULL,
		series_id INT NOT NULL,
		occurrence_at DATETIME NOT NULL,
		action VARCHAR(20) NOT NULL,
		override_json TEXT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uniq_recurrence_exception (entity_type, series_id, occurrence_at),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS recurrence_occurrence_states (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		entity_type VARCHAR(20) NOT NULL,
		series_id INT NOT NULL,
		occurrence_at DATE NOT NULL,
		paid BOOLEAN NOT NULL DEFAULT FALSE,
		paid_at DATE NULL,
		amount_override DECIMAL(12,2) NULL,
		UNIQUE KEY uniq_recurrence_occurrence (entity_type, series_id, occurrence_at),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS todo_occurrence_completions (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		series_id INT NOT NULL,
		occurrence_at DATE NOT NULL,
		todo_id INT NOT NULL,
		completed BOOLEAN NOT NULL DEFAULT FALSE,
		UNIQUE KEY uniq_todo_occurrence (series_id, occurrence_at, todo_id),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (series_id) REFERENCES todo_lists(id) ON DELETE CASCADE,
		FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS workspace_access_requests (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		user_id INT NOT NULL,
		message TEXT,
		status VARCHAR(20) NOT NULL DEFAULT 'pending',
		reviewed_by INT NULL,
		reviewed_at TIMESTAMP NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uniq_workspace_access_request (workspace_id, user_id),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL
	)`,
	`CREATE TABLE IF NOT EXISTS workspace_invites (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		invitee_user_id INT NOT NULL,
		invited_by INT NOT NULL,
		status VARCHAR(20) NOT NULL DEFAULT 'pending',
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		UNIQUE KEY uniq_workspace_invite (workspace_id, invitee_user_id),
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
		FOREIGN KEY (invitee_user_id) REFERENCES users(id) ON DELETE CASCADE,
		FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS chat_conversations (
		id INT AUTO_INCREMENT PRIMARY KEY,
		workspace_id INT NOT NULL,
		kind VARCHAR(20) NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS chat_conversation_members (
		conversation_id INT NOT NULL,
		user_id INT NOT NULL,
		joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (conversation_id, user_id),
		FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS chat_messages (
		id INT AUTO_INCREMENT PRIMARY KEY,
		conversation_id INT NOT NULL,
		sender_id INT NOT NULL,
		content TEXT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (conversation_id) REFERENCES chat_conversations(id) ON DELETE CASCADE,
		FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
	)`,
	`CREATE TABLE IF NOT EXISTS chat_attachments (
		id INT AUTO_INCREMENT PRIMARY KEY,
		message_id INT NOT NULL,
		original_name VARCHAR(255) NOT NULL,
		stored_name VARCHAR(512) NOT NULL,
		mime_type VARCHAR(127) NOT NULL,
		size_bytes BIGINT NOT NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
	)`,
}

var alterStatements = []string{
	`ALTER TABLE events ADD COLUMN rrule TEXT NULL`,
	`ALTER TABLE income_entries MODIFY recurrence TEXT NULL`,
	`ALTER TABLE bills MODIFY recurrence TEXT NULL`,
	`ALTER TABLE recurrence_occurrence_states ADD COLUMN payment_notes TEXT NULL`,
	`ALTER TABLE recurrence_occurrence_states ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE bills ADD COLUMN payment_notes TEXT NULL`,
	`ALTER TABLE bills ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE bills ADD COLUMN paid_off BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE expenses ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE expenses ADD COLUMN paid_at DATE NULL`,
	`ALTER TABLE expenses ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE expenses ADD COLUMN payment_notes TEXT NULL`,
	`CREATE INDEX idx_chat_messages_conversation_created ON chat_messages (conversation_id, created_at, id)`,
	`CREATE INDEX idx_chat_attachments_message ON chat_attachments (message_id)`,
	`ALTER TABLE workspaces ADD COLUMN focus_areas JSON NULL`,
	`ALTER TABLE workspaces ADD COLUMN archived_at TIMESTAMP NULL`,
	`UPDATE workspaces SET focus_areas = '["planning","finances"]' WHERE focus_areas IS NULL`,
	`ALTER TABLE users ADD COLUMN display_name VARCHAR(255) NULL`,
	`ALTER TABLE users ADD COLUMN avatar_path VARCHAR(512) NULL`,
	`ALTER TABLE users ADD COLUMN settings JSON NULL`,
	`ALTER TABLE workspace_members ADD COLUMN manage_areas JSON NULL`,
	`ALTER TABLE users ADD COLUMN email VARCHAR(255) NULL`,
	`ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)`,
	`CREATE TABLE IF NOT EXISTS password_reset_tokens (
		id INT AUTO_INCREMENT PRIMARY KEY,
		user_id INT NOT NULL,
		token_hash CHAR(64) NOT NULL UNIQUE,
		expires_at DATETIME NOT NULL,
		used_at DATETIME NULL,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	)`,
	`CREATE INDEX idx_password_reset_tokens_user ON password_reset_tokens (user_id)`,
	`ALTER TABLE todo_lists ADD COLUMN recurrence TEXT NULL`,
	`ALTER TABLE todo_lists ADD COLUMN series_id INT NULL`,
	`ALTER TABLE todo_lists ADD CONSTRAINT fk_todo_lists_series FOREIGN KEY (series_id) REFERENCES todo_lists(id) ON DELETE CASCADE`,
}

func Migrate(db *sql.DB) error {
	for _, statement := range migrationStatements {
		if _, err := db.Exec(statement); err != nil {
			return err
		}
	}
	for _, statement := range alterStatements {
		if _, err := db.Exec(statement); err != nil {
			if isIgnorableAlterError(err) {
				continue
			}
			return err
		}
	}
	return nil
}

func isIgnorableAlterError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate column") ||
		strings.Contains(message, "check that column/key exists") ||
		strings.Contains(message, "duplicate key name") ||
		strings.Contains(message, "duplicate foreign key constraint name")
}
