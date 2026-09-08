package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"path/filepath"

	"fullstack-app/config"
	"fullstack-app/database/legacy"

	_ "github.com/go-sql-driver/mysql"
	"database/sql"
)

type analyzeOutput struct {
	LegacySchema *legacy.DatabaseSchema  `json:"legacy_schema"`
	Strategy     *legacy.MigrationStrategy `json:"strategy"`
}

func main() {
	outDir := flag.String("out", "tmp", "directory for report files (relative to backend/)")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	legacyDB, err := openDatabase(cfg.LegacyDSN())
	if err != nil {
		log.Fatalf("legacy database (%s): %v", cfg.LegacyDBName, err)
	}
	defer legacyDB.Close()

	log.Printf("Connected to legacy database %q on %s:%s", cfg.LegacyDBName, cfg.DBHost, cfg.DBPort)

	legacySchema, err := legacy.Introspect(legacyDB, cfg.LegacyDBName)
	if err != nil {
		log.Fatalf("introspect legacy schema: %v", err)
	}

	strategy := legacy.BuildStrategy(legacySchema, cfg.DBName)
	output := analyzeOutput{
		LegacySchema: legacySchema,
		Strategy:     strategy,
	}

	if err := os.MkdirAll(*outDir, 0o755); err != nil {
		log.Fatalf("create output dir: %v", err)
	}

	jsonPath := filepath.Join(*outDir, "legacy-schema-report.json")
	markdownPath := filepath.Join(*outDir, "legacy-migration-strategy.md")

	if err := writeJSON(jsonPath, output); err != nil {
		log.Fatalf("write json report: %v", err)
	}
	if err := os.WriteFile(markdownPath, []byte(legacy.FormatStrategyMarkdown(strategy, legacySchema)), 0o644); err != nil {
		log.Fatalf("write markdown report: %v", err)
	}

	printSummary(legacySchema, strategy)
	fmt.Printf("\nReports written:\n  %s\n  %s\n", jsonPath, markdownPath)
}

func openDatabase(dsn string) (*sql.DB, error) {
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}

func writeJSON(path string, value any) error {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

func printSummary(schema *legacy.DatabaseSchema, strategy *legacy.MigrationStrategy) {
	fmt.Printf("\n=== Legacy DB: %s ===\n", schema.Database)
	fmt.Printf("Tables: %d\n\n", len(schema.Tables))

	for _, table := range schema.Tables {
		fmt.Printf("  %-32s %6d rows  (%d columns)\n", table.Name, table.RowCount, len(table.Columns))
	}

	fmt.Printf("\n=== Migration mappings (%d) ===\n", len(strategy.Mappings))
	for _, mapping := range strategy.Mappings {
		fmt.Printf("  %-24s <- %-24s  [%s", mapping.TargetTable, mapping.SourceTable, mapping.Confidence)
		if mapping.RowCount > 0 {
			fmt.Printf(", %d rows", mapping.RowCount)
		}
		fmt.Println("]")
	}

	if len(strategy.UnmappedLegacy) > 0 {
		fmt.Printf("\nUnmapped legacy tables (%d): %v\n", len(strategy.UnmappedLegacy), strategy.UnmappedLegacy)
	}
	if len(strategy.Warnings) > 0 {
		fmt.Println("\nWarnings:")
		for _, warning := range strategy.Warnings {
			fmt.Printf("  - %s\n", warning)
		}
	}
}
