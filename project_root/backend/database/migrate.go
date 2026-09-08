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
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
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
}

var alterStatements = []string{
	`ALTER TABLE events ADD COLUMN rrule TEXT NULL`,
	`ALTER TABLE income_entries MODIFY recurrence TEXT NULL`,
	`ALTER TABLE bills MODIFY recurrence TEXT NULL`,
	`ALTER TABLE recurrence_occurrence_states ADD COLUMN payment_notes TEXT NULL`,
	`ALTER TABLE recurrence_occurrence_states ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE bills ADD COLUMN payment_notes TEXT NULL`,
	`ALTER TABLE bills ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE expenses ADD COLUMN paid BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE expenses ADD COLUMN paid_at DATE NULL`,
	`ALTER TABLE expenses ADD COLUMN skipped BOOLEAN NOT NULL DEFAULT FALSE`,
	`ALTER TABLE expenses ADD COLUMN payment_notes TEXT NULL`,
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
		strings.Contains(message, "check that column/key exists")
}
