package database

import (
	"database/sql"
	"fmt"
)

func SeedChat(db *sql.DB) error {
	var workspaceID int
	err := db.QueryRow("SELECT id FROM workspaces WHERE slug = ?", seedWorkspaceSlug).Scan(&workspaceID)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Errorf("load demo workspace for chat seed: %w", err)
	}

	var demoID, partnerID int
	if err := db.QueryRow("SELECT id FROM users WHERE username = ?", seedDemoUsername).Scan(&demoID); err != nil {
		return fmt.Errorf("load demo user for chat seed: %w", err)
	}
	if err := db.QueryRow("SELECT id FROM users WHERE username = ?", seedPartnerUsername).Scan(&partnerID); err != nil {
		return fmt.Errorf("load partner user for chat seed: %w", err)
	}

	var messageCount int
	if err := db.QueryRow(`
		SELECT COUNT(*)
		FROM chat_messages m
		INNER JOIN chat_conversations c ON c.id = m.conversation_id
		WHERE c.workspace_id = ?`, workspaceID,
	).Scan(&messageCount); err != nil {
		return fmt.Errorf("count chat messages: %w", err)
	}
	if messageCount > 0 {
		return nil
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if err := seedWorkspaceChat(tx, workspaceID, demoID, partnerID); err != nil {
		return err
	}

	return tx.Commit()
}

func seedWorkspaceChat(tx *sql.Tx, workspaceID, demoID, partnerID int) error {
	groupID, err := ensureGroupConversation(tx, workspaceID, demoID, partnerID)
	if err != nil {
		return err
	}

	groupMessages := []struct {
		senderID int
		content  string
	}{
		{demoID, "Welcome to the Demo Family workspace chat.\n\nUse **markdown** for lists, links, and emphasis."},
		{partnerID, "Thanks! I'll post bill reminders here too.\n\n- groceries\n- utilities"},
		{demoID, "Perfect. Grocery run is planned for Saturday."},
	}
	for _, message := range groupMessages {
		if err := insertChatMessage(tx, groupID, message.senderID, message.content); err != nil {
			return err
		}
	}

	directID, err := ensureDirectConversation(tx, workspaceID, demoID, partnerID)
	if err != nil {
		return err
	}
	if err := insertChatMessage(tx, directID, partnerID, "Can you pick up milk on your way home?"); err != nil {
		return err
	}
	if err := insertChatMessage(tx, directID, demoID, "Sure, adding it to today's list."); err != nil {
		return err
	}

	selfID, err := ensureSelfConversation(tx, workspaceID, demoID)
	if err != nil {
		return err
	}
	if err := insertChatMessage(tx, selfID, demoID, "Remember to renew car registration this month."); err != nil {
		return err
	}

	return nil
}

func ensureGroupConversation(tx *sql.Tx, workspaceID int, memberIDs ...int) (int, error) {
	var conversationID int
	err := tx.QueryRow(
		`SELECT id FROM chat_conversations WHERE workspace_id = ? AND kind = 'group' LIMIT 1`,
		workspaceID,
	).Scan(&conversationID)
	if err == sql.ErrNoRows {
		result, insertErr := tx.Exec(
			`INSERT INTO chat_conversations (workspace_id, kind) VALUES (?, 'group')`,
			workspaceID,
		)
		if insertErr != nil {
			return 0, insertErr
		}
		id64, _ := result.LastInsertId()
		conversationID = int(id64)
	} else if err != nil {
		return 0, err
	}

	for _, memberID := range memberIDs {
		if _, err := tx.Exec(
			`INSERT IGNORE INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)`,
			conversationID, memberID,
		); err != nil {
			return 0, err
		}
	}
	return conversationID, nil
}

func ensureDirectConversation(tx *sql.Tx, workspaceID, userA, userB int) (int, error) {
	var conversationID int
	err := tx.QueryRow(`
		SELECT c.id
		FROM chat_conversations c
		INNER JOIN chat_conversation_members m1 ON m1.conversation_id = c.id AND m1.user_id = ?
		INNER JOIN chat_conversation_members m2 ON m2.conversation_id = c.id AND m2.user_id = ?
		WHERE c.workspace_id = ? AND c.kind = 'direct'
		LIMIT 1`, userA, userB, workspaceID,
	).Scan(&conversationID)
	if err == sql.ErrNoRows {
		result, insertErr := tx.Exec(
			`INSERT INTO chat_conversations (workspace_id, kind) VALUES (?, 'direct')`,
			workspaceID,
		)
		if insertErr != nil {
			return 0, insertErr
		}
		id64, _ := result.LastInsertId()
		conversationID = int(id64)
		for _, memberID := range []int{userA, userB} {
			if _, err := tx.Exec(
				`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)`,
				conversationID, memberID,
			); err != nil {
				return 0, err
			}
		}
		return conversationID, nil
	}
	return conversationID, err
}

func ensureSelfConversation(tx *sql.Tx, workspaceID, userID int) (int, error) {
	var conversationID int
	err := tx.QueryRow(`
		SELECT c.id
		FROM chat_conversations c
		INNER JOIN chat_conversation_members cm ON cm.conversation_id = c.id
		WHERE c.workspace_id = ? AND c.kind = 'direct'
		GROUP BY c.id
		HAVING COUNT(DISTINCT cm.user_id) = 1
			AND SUM(CASE WHEN cm.user_id = ? THEN 1 ELSE 0 END) = 1
		LIMIT 1`, workspaceID, userID,
	).Scan(&conversationID)
	if err == sql.ErrNoRows {
		result, insertErr := tx.Exec(
			`INSERT INTO chat_conversations (workspace_id, kind) VALUES (?, 'direct')`,
			workspaceID,
		)
		if insertErr != nil {
			return 0, insertErr
		}
		id64, _ := result.LastInsertId()
		conversationID = int(id64)
		if _, err := tx.Exec(
			`INSERT INTO chat_conversation_members (conversation_id, user_id) VALUES (?, ?)`,
			conversationID, userID,
		); err != nil {
			return 0, err
		}
		return conversationID, nil
	}
	return conversationID, err
}

func insertChatMessage(tx *sql.Tx, conversationID, senderID int, content string) error {
	_, err := tx.Exec(
		`INSERT INTO chat_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)`,
		conversationID, senderID, content,
	)
	return err
}
