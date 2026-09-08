package legacy

import (
	"database/sql"
	"fmt"
	"strings"
)

type Column struct {
	Name       string `json:"name"`
	DataType   string `json:"data_type"`
	ColumnType string `json:"column_type"`
	Nullable   bool   `json:"nullable"`
	Key        string `json:"key"`
	Default    string `json:"default,omitempty"`
	Extra      string `json:"extra,omitempty"`
}

type ForeignKey struct {
	Column           string `json:"column"`
	ReferencedTable  string `json:"referenced_table"`
	ReferencedColumn string `json:"referenced_column"`
}

type Table struct {
	Name        string       `json:"name"`
	RowCount    int64        `json:"row_count"`
	Columns     []Column     `json:"columns"`
	ForeignKeys []ForeignKey `json:"foreign_keys"`
}

type DatabaseSchema struct {
	Database string  `json:"database"`
	Tables   []Table `json:"tables"`
}

func Introspect(db *sql.DB, database string) (*DatabaseSchema, error) {
	tables, err := listTables(db, database)
	if err != nil {
		return nil, err
	}

	schema := &DatabaseSchema{Database: database}
	for _, tableName := range tables {
		columns, err := listColumns(db, database, tableName)
		if err != nil {
			return nil, fmt.Errorf("columns for %s: %w", tableName, err)
		}
		foreignKeys, err := listForeignKeys(db, database, tableName)
		if err != nil {
			return nil, fmt.Errorf("foreign keys for %s: %w", tableName, err)
		}
		rowCount, err := countRows(db, tableName)
		if err != nil {
			return nil, fmt.Errorf("row count for %s: %w", tableName, err)
		}

		schema.Tables = append(schema.Tables, Table{
			Name:        tableName,
			RowCount:    rowCount,
			Columns:     columns,
			ForeignKeys: foreignKeys,
		})
	}

	return schema, nil
}

func listTables(db *sql.DB, database string) ([]string, error) {
	rows, err := db.Query(`
		SELECT TABLE_NAME
		FROM INFORMATION_SCHEMA.TABLES
		WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
		ORDER BY TABLE_NAME`, database)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		tables = append(tables, name)
	}
	return tables, rows.Err()
}

func listColumns(db *sql.DB, database, table string) ([]Column, error) {
	rows, err := db.Query(`
		SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COALESCE(COLUMN_DEFAULT, ''), EXTRA
		FROM INFORMATION_SCHEMA.COLUMNS
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
		ORDER BY ORDINAL_POSITION`, database, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var columns []Column
	for rows.Next() {
		var col Column
		var nullable string
		if err := rows.Scan(&col.Name, &col.DataType, &col.ColumnType, &nullable, &col.Key, &col.Default, &col.Extra); err != nil {
			return nil, err
		}
		col.Nullable = strings.EqualFold(nullable, "YES")
		columns = append(columns, col)
	}
	return columns, rows.Err()
}

func listForeignKeys(db *sql.DB, database, table string) ([]ForeignKey, error) {
	rows, err := db.Query(`
		SELECT COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
		FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
		WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
		ORDER BY COLUMN_NAME`, database, table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []ForeignKey
	for rows.Next() {
		var fk ForeignKey
		if err := rows.Scan(&fk.Column, &fk.ReferencedTable, &fk.ReferencedColumn); err != nil {
			return nil, err
		}
		keys = append(keys, fk)
	}
	return keys, rows.Err()
}

func countRows(db *sql.DB, table string) (int64, error) {
	var count int64
	err := db.QueryRow(fmt.Sprintf("SELECT COUNT(*) FROM `%s`", table)).Scan(&count)
	return count, err
}

func ColumnNames(table Table) []string {
	names := make([]string, len(table.Columns))
	for i, col := range table.Columns {
		names[i] = col.Name
	}
	return names
}

func HasColumn(table Table, name string) bool {
	lower := strings.ToLower(name)
	for _, col := range table.Columns {
		if strings.ToLower(col.Name) == lower {
			return true
		}
	}
	return false
}

func FindColumn(table Table, candidates ...string) string {
	for _, candidate := range candidates {
		lower := strings.ToLower(candidate)
		for _, col := range table.Columns {
			if strings.ToLower(col.Name) == lower {
				return col.Name
			}
		}
	}
	return ""
}
