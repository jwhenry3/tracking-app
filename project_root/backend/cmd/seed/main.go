package main

import (
	"database/sql"
	"log"

	"fullstack-app/config"
	"fullstack-app/database"

	_ "github.com/go-sql-driver/mysql"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatal(err)
	}

	db, err := sql.Open("mysql", cfg.DSN())
	if err != nil {
		log.Fatal("failed to open database:", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		log.Fatal("database unreachable:", err)
	}

	if err := database.Migrate(db); err != nil {
		log.Fatal("database migration failed:", err)
	}

	if err := database.Seed(db); err != nil {
		log.Fatal("database seed failed:", err)
	}

	log.Println("Database seeded successfully")
	log.Println("Demo account: demo / password123")
	log.Println("Partner account: partner / password123")
	log.Println("Workspace: Demo Family")
}
