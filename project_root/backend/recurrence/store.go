package recurrence

import (
	"database/sql"
	"encoding/json"
	"time"
)

type Store struct {
	DB *sql.DB
}

func (s *Store) LoadExceptions(entityType string, seriesID int) ([]Exception, error) {
	rows, err := s.DB.Query(`
		SELECT occurrence_at, action, override_json
		FROM recurrence_exceptions
		WHERE entity_type = ? AND series_id = ?
		ORDER BY occurrence_at ASC`, entityType, seriesID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := []Exception{}
	for rows.Next() {
		var item Exception
		var override sql.NullString
		if err := rows.Scan(&item.OccurrenceAt, &item.Action, &override); err != nil {
			return nil, err
		}
		if override.Valid {
			item.OverrideJSON = override.String
		}
		items = append(items, item)
	}
	return items, nil
}

func (s *Store) LoadExceptionsForWorkspace(entityType string, workspaceID int) (map[int][]Exception, error) {
	rows, err := s.DB.Query(`
		SELECT series_id, occurrence_at, action, override_json
		FROM recurrence_exceptions
		WHERE entity_type = ? AND workspace_id = ?
		ORDER BY series_id ASC, occurrence_at ASC`, entityType, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int][]Exception{}
	for rows.Next() {
		var seriesID int
		var item Exception
		var override sql.NullString
		if err := rows.Scan(&seriesID, &item.OccurrenceAt, &item.Action, &override); err != nil {
			return nil, err
		}
		if override.Valid {
			item.OverrideJSON = override.String
		}
		out[seriesID] = append(out[seriesID], item)
	}
	return out, nil
}

func (s *Store) UpsertException(workspaceID int, entityType string, seriesID int, occurrenceAt time.Time, action, overrideJSON string) error {
	var override any
	if overrideJSON != "" {
		override = overrideJSON
	}
	_, err := s.DB.Exec(`
		INSERT INTO recurrence_exceptions (workspace_id, entity_type, series_id, occurrence_at, action, override_json)
		VALUES (?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE action = VALUES(action), override_json = VALUES(override_json)`,
		workspaceID, entityType, seriesID, occurrenceAt, action, override,
	)
	return err
}

func (s *Store) DeleteExceptionsFrom(entityType string, seriesID int, from time.Time) error {
	_, err := s.DB.Exec(`
		DELETE FROM recurrence_exceptions
		WHERE entity_type = ? AND series_id = ? AND occurrence_at >= ?`,
		entityType, seriesID, from,
	)
	return err
}

func (s *Store) DeleteAllExceptions(entityType string, seriesID int) error {
	_, err := s.DB.Exec(`
		DELETE FROM recurrence_exceptions WHERE entity_type = ? AND series_id = ?`,
		entityType, seriesID,
	)
	return err
}

func (s *Store) LoadOccurrenceStates(entityType string, workspaceID int) (map[int]map[string]OccurrenceState, error) {
	rows, err := s.DB.Query(`
		SELECT series_id, occurrence_at, paid, paid_at, amount_override, payment_notes, skipped
		FROM recurrence_occurrence_states
		WHERE entity_type = ? AND workspace_id = ?`, entityType, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := map[int]map[string]OccurrenceState{}
	for rows.Next() {
		var seriesID int
		var item OccurrenceState
		var paidAt sql.NullString
		var amountOverride sql.NullFloat64
		var paymentNotes sql.NullString
		if err := rows.Scan(&seriesID, &item.OccurrenceAt, &item.Paid, &paidAt, &amountOverride, &paymentNotes, &item.Skipped); err != nil {
			return nil, err
		}
		if paidAt.Valid {
			item.PaidAt = &paidAt.String
		}
		if amountOverride.Valid {
			value := amountOverride.Float64
			item.AmountOverride = &value
		}
		if paymentNotes.Valid {
			item.PaymentNotes = &paymentNotes.String
		}
		if out[seriesID] == nil {
			out[seriesID] = map[string]OccurrenceState{}
		}
		out[seriesID][item.OccurrenceAt.Format("2006-01-02")] = item
	}
	return out, nil
}

func (s *Store) UpsertOccurrenceState(
	workspaceID int,
	entityType string,
	seriesID int,
	occurrenceAt time.Time,
	paid bool,
	paidAt *string,
	amountOverride *float64,
	paymentNotes *string,
	skipped bool,
) error {
	var paidAtValue any
	if paidAt != nil {
		paidAtValue = *paidAt
	}
	var amountValue any
	if amountOverride != nil {
		amountValue = *amountOverride
	}
	var notesValue any
	if paymentNotes != nil {
		notesValue = *paymentNotes
	}
	_, err := s.DB.Exec(`
		INSERT INTO recurrence_occurrence_states (
			workspace_id, entity_type, series_id, occurrence_at, paid, paid_at, amount_override, payment_notes, skipped
		)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON DUPLICATE KEY UPDATE
			paid = VALUES(paid),
			paid_at = VALUES(paid_at),
			amount_override = VALUES(amount_override),
			payment_notes = VALUES(payment_notes),
			skipped = VALUES(skipped)`,
		workspaceID, entityType, seriesID, occurrenceAt, paid, paidAtValue, amountValue, notesValue, skipped,
	)
	return err
}

func MarshalOverride(payload any) (string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}
