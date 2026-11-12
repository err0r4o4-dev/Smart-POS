package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://smartpos-dev:S%40pos%4026@127.0.0.1:5432/dev-postgres.smartpos?sslmode=disable"
	}

	ctx := context.Background()
	conn, err := pgx.Connect(ctx, dbURL)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Unable to connect: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close(ctx)

	sqlBytes, err := os.ReadFile("../../database/seed-sample-sales.sql")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to read seed-sample-sales.sql: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Read %d bytes from seed-sample-sales.sql (UTF-8)\n", len(sqlBytes))

	_, err = conn.Exec(ctx, string(sqlBytes))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to execute seed-sample-sales.sql: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("seed-sample-sales.sql executed successfully!")

	// Verify sales
	rows, err := conn.Query(ctx, "SELECT sale_number, branch_name, terminal_name, cashier_name FROM sales LIMIT 5")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Query failed: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	fmt.Println("--- Sample Sales Verification ---")
	for rows.Next() {
		var sNum, bName, tName, cName string
		rows.Scan(&sNum, &bName, &tName, &cName)
		fmt.Printf("sale_number=%s, branch=%s, terminal=%s, cashier=%s\n", sNum, bName, tName, cName)
	}
}
