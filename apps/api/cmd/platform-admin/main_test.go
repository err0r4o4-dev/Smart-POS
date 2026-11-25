package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
)

func TestCommandRequiresDedicatedConfiguration(t *testing.T) {
	var output bytes.Buffer
	lookups := []string{}
	err := run(context.Background(), append(validArguments(), "--apply"), func(name string) string {
		lookups = append(lookups, name)
		if name == "DATABASE_URL" {
			return "must-never-be-used"
		}
		return ""
	}, &output)
	if err == nil || !strings.Contains(err.Error(), "PLATFORM_ADMIN_DATABASE_URL") || len(lookups) != 1 || lookups[0] != "PLATFORM_ADMIN_DATABASE_URL" || output.Len() != 0 {
		t.Fatal("dedicated configuration must be required without runtime fallback")
	}
}

func TestCommandValidationDoesNotConnectOrReadSecrets(t *testing.T) {
	for _, args := range [][]string{validArguments(), {"--apply"}, append(validArguments(), "--unknown=secret-value")} {
		var output bytes.Buffer
		called := false
		err := run(context.Background(), args, func(string) string { called = true; return "" }, &output)
		if called || strings.Contains(output.String(), "secret-value") || (err != nil && strings.Contains(err.Error(), "secret-value")) {
			t.Fatal("validation touched configuration or disclosed rejected input")
		}
	}
}

func TestCommandRedactsInvalidConnection(t *testing.T) {
	var output bytes.Buffer
	err := run(context.Background(), append(validArguments(), "--apply"), func(string) string { return "invalid-connection-with-synthetic-secret" }, &output)
	if err == nil || strings.Contains(err.Error(), "synthetic-secret") || strings.Contains(output.String(), "synthetic-secret") {
		t.Fatal("invalid connection must fail without credential-bearing errors")
	}
}

func validArguments() []string {
	return []string{"--operation-id=43000000-0000-4000-8000-000000000021", "--user-id=43000000-0000-4000-8000-000000000022", "--action=grant", "--operator=synthetic-operator", "--reason=Verified synthetic identity"}
}
