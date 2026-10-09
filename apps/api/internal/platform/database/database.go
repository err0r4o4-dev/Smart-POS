package database

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const RequiredVersion = 5

func Open(ctx context.Context, url string) (*pgxpool.Pool, error) {
	config, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, errors.New("database configuration invalid")
	}
	config.MaxConns = 10
	config.MinConns = 0
	config.MaxConnLifetime = 30 * time.Minute
	config.ConnConfig.ConnectTimeout = 3 * time.Second
	config.AfterConnect = func(ctx context.Context, connection *pgx.Conn) error {
		_, err := connection.Exec(ctx, "SET ROLE smartpos_runtime")
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, errors.New("database pool unavailable")
	}
	return pool, nil
}

type Checker struct{ Pool *pgxpool.Pool }

func (checker Checker) Ready(ctx context.Context) error {
	if err := checker.Pool.Ping(ctx); err != nil {
		return errors.New("database unavailable")
	}
	var version int
	var dirty bool
	if err := checker.Pool.QueryRow(ctx, "SELECT version, dirty FROM schema_migrations").Scan(&version, &dirty); err != nil {
		return errors.New("schema unavailable")
	}
	if version != RequiredVersion || dirty {
		return errors.New("schema not ready")
	}
	return nil
}
