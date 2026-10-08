package config

import (
	"errors"
	"net"
	"os"
	"strconv"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Config struct {
	Address     string
	DatabaseURL string
}

func Load() (Config, error) { return Parse(os.Getenv) }

func Parse(getenv func(string) string) (Config, error) {
	address := getenv("API_ADDR")
	if address == "" {
		address = "127.0.0.1:8080"
	}
	_, port, err := net.SplitHostPort(address)
	number, parseErr := strconv.Atoi(port)
	if err != nil || parseErr != nil || number < 1 || number > 65535 {
		return Config{}, errors.New("API_ADDR must contain a valid host and port")
	}
	databaseURL := getenv("DATABASE_URL")
	if databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if _, err := pgxpool.ParseConfig(databaseURL); err != nil {
		return Config{}, errors.New("DATABASE_URL is invalid")
	}
	return Config{Address: address, DatabaseURL: databaseURL}, nil
}
