//go:build windows

package agentstatus

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunDefaultInstallCommandRunsBatchProgramFromSpacedPath(t *testing.T) {
	programDir := filepath.Join(t.TempDir(), "npm runtime")
	if err := os.MkdirAll(programDir, 0o755); err != nil {
		t.Fatalf("mkdir program directory: %v", err)
	}
	program := filepath.Join(programDir, "npm.cmd")
	if err := os.WriteFile(program, []byte("@echo off\r\necho %1\r\n"), 0o600); err != nil {
		t.Fatalf("write batch program: %v", err)
	}

	result, err := runDefaultInstallCommand(context.Background(), InstallCommandInput{
		Command: `"` + program + `" --version`,
		Program: program,
		Args:    []string{"--version"},
	})
	if err != nil {
		t.Fatalf("run default install command: %v", err)
	}
	if result.ExitCode != 0 {
		t.Fatalf("exit code = %d, stderr = %q", result.ExitCode, result.Stderr)
	}
	if !strings.Contains(result.Stdout, "--version") {
		t.Fatalf("stdout = %q, want command argument", result.Stdout)
	}
}
