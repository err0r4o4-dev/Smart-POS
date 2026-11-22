package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/identity"
)

func run(ctx context.Context, args []string, lookup func(string) string, output io.Writer) error {
	flags := flag.NewFlagSet("platform-admin", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var input identity.PlatformAdminRequest
	var apply bool
	flags.StringVar(&input.OperationID, "operation-id", "", "unique operation UUID; reuse unchanged after an uncertain outcome")
	flags.StringVar(&input.UserID, "user-id", "", "explicit verified user UUID")
	flags.StringVar(&input.Action, "action", "", "grant or revoke")
	flags.StringVar(&input.Operator, "operator", "", "human operator label; not proof of identity")
	flags.StringVar(&input.Reason, "reason", "", "reason without secrets or unnecessary personal data")
	flags.BoolVar(&apply, "apply", false, "perform the authorized database operation")
	if flags.Parse(args) != nil || flags.NArg() != 0 {
		return errors.New("invalid platform authority arguments")
	}
	input.Action = strings.ToUpper(input.Action)
	if input.Validate() != nil {
		return errors.New("invalid platform authority arguments")
	}
	if !apply {
		_, err := fmt.Fprintln(output, "Arguments valid; no database connection or change. --apply requires explicit operational authorization.")
		return err
	}
	dsn := lookup("PLATFORM_ADMIN_DATABASE_URL")
	if strings.TrimSpace(dsn) == "" {
		return errors.New("PLATFORM_ADMIN_DATABASE_URL is required")
	}
	config, err := pgx.ParseConfig(dsn)
	if err != nil {
		return errors.New("PLATFORM_ADMIN_DATABASE_URL is invalid")
	}
	config.ConnectTimeout = 3 * time.Second
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	connection, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		return errors.New("platform authority database unavailable")
	}
	defer connection.Close(ctx)
	result, err := identity.ProvisionPlatformAdmin(ctx, connection, input)
	if errors.Is(err, identity.ErrPlatformAdminDenied) {
		return errors.New("platform authority denied: check schema, operator privileges and target eligibility")
	}
	if errors.Is(err, identity.ErrPlatformAdminConflict) {
		return errors.New("operation ID already records different arguments")
	}
	if err != nil {
		return errors.New("platform authority outcome unavailable; inspect audit or retry the same operation ID with unchanged arguments")
	}
	_, err = fmt.Fprintf(output, "operation=%s active=%t changed=%t replayed=%t\n", input.OperationID, result.Active, result.Changed, result.Replayed)
	if err != nil {
		return errors.New("platform authority committed but output unavailable; retry the same operation ID with unchanged arguments")
	}
	return nil
}

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	err := run(ctx, os.Args[1:], os.Getenv, os.Stdout)
	cancel()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
