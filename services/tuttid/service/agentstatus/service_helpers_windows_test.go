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

func TestResolveProviderRuntimeFindsWindowsNPMGlobalPrefixPackage(t *testing.T) {
	home := t.TempDir()
	globalPrefix := filepath.Join(home, ".local")
	if err := os.MkdirAll(globalPrefix, 0o755); err != nil {
		t.Fatalf("mkdir npm global prefix: %v", err)
	}
	shimPath := filepath.Join(globalPrefix, "tutti-agent.cmd")
	if err := os.WriteFile(shimPath, []byte("@echo off\r\n"), 0o644); err != nil {
		t.Fatalf("write tutti-agent shim: %v", err)
	}

	specs, err := DefaultRegistry().Select([]string{"tutti-agent"})
	if err != nil || len(specs) != 1 {
		t.Fatalf("select tutti-agent spec: len=%d err=%v", len(specs), err)
	}
	requiredVersion := specs[0].AdapterPackage.Version
	packageDir := filepath.Join(globalPrefix, "node_modules", "@tutti-os", "tutti-agent")
	if err := os.MkdirAll(packageDir, 0o755); err != nil {
		t.Fatalf("mkdir tutti-agent package: %v", err)
	}
	manifest := `{"name":"@tutti-os/tutti-agent","version":"` + requiredVersion + `"}`
	if err := os.WriteFile(filepath.Join(packageDir, "package.json"), []byte(manifest), 0o644); err != nil {
		t.Fatalf("write tutti-agent package manifest: %v", err)
	}

	service := Service{
		Environ: func() []string {
			return []string{
				"APPDATA=" + t.TempDir(),
				"LOCALAPPDATA=" + t.TempDir(),
				"PATH=C:\\Windows\\System32",
			}
		},
		HomeDir: func() (string, error) {
			return home, nil
		},
		LookPath: func(string) (string, error) {
			return "", os.ErrNotExist
		},
	}

	resolved := service.resolveProviderRuntime(context.Background(), specs[0])
	if resolved.CLIPath != shimPath {
		t.Fatalf("CLIPath = %q, want %q", resolved.CLIPath, shimPath)
	}
	if resolved.AdapterPath != shimPath {
		t.Fatalf("AdapterPath = %q, want %q", resolved.AdapterPath, shimPath)
	}
	if resolved.AdapterVersion != requiredVersion {
		t.Fatalf("AdapterVersion = %q, want %q", resolved.AdapterVersion, requiredVersion)
	}
}
