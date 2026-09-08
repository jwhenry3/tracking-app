package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"

	"fullstack-app/config"
	"fullstack-app/database"
	"fullstack-app/database/legacy"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	dryRun := flag.Bool("dry-run", false, "log migration steps without writing to the target database")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	targetDB, err := openDatabase(cfg.DSN())
	if err != nil {
		log.Fatalf("target database (%s): %v", cfg.DBName, err)
	}
	defer targetDB.Close()

	legacyDB, err := openDatabase(cfg.LegacyDSN())
	if err != nil {
		log.Fatalf("legacy database (%s): %v", cfg.LegacyDBName, err)
	}
	defer legacyDB.Close()

	if !*dryRun {
		if err := database.Migrate(targetDB); err != nil {
			log.Fatalf("target migration failed: %v", err)
		}
	}

	log.Printf("Migrating %q → %q", cfg.LegacyDBName, cfg.DBName)
	if *dryRun {
		log.Println("Dry run — no writes will be performed")
	}

	result, err := legacy.MigrateBillDashboard(legacyDB, targetDB, cfg.LegacyDBName, legacy.MigrateOptions{
		DryRun: *dryRun,
	})
	if err != nil {
		log.Fatalf("migration failed: %v", err)
	}

	fmt.Println()
	fmt.Println("Migration complete")
	fmt.Printf("  Users created:       %d (skipped %d)\n", result.UsersCreated, result.UsersSkipped)
	fmt.Printf("  Workspaces created:  %d\n", result.WorkspacesCreated)
	fmt.Printf("  Bills created:       %d (repaired %d, skipped %d)\n", result.BillsCreated, result.BillsRepaired, result.BillsSkipped)
	fmt.Printf("  Payment states:      %d (skipped %d)\n", result.PaymentsCreated, result.PaymentsSkipped)
	fmt.Printf("  Preferences patched: %d\n", result.PreferencesPatched)
	if *dryRun {
		fmt.Println("\nRe-run without --dry-run to apply changes.")
	}
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
