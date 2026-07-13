//go:build windows

package tuttiagent

import (
	"os"
	"path/filepath"
	"testing"
)

func TestResolveTuttiAgentBinaryFindsWindowsNPMGlobalPrefixShim(t *testing.T) {
	home := t.TempDir()
	globalPrefix := filepath.Join(home, ".local")
	if err := os.MkdirAll(globalPrefix, 0o755); err != nil {
		t.Fatalf("mkdir npm global prefix: %v", err)
	}
	shimPath := filepath.Join(globalPrefix, "tutti-agent.cmd")
	if err := os.WriteFile(shimPath, []byte("@echo off\r\n"), 0o644); err != nil {
		t.Fatalf("write tutti-agent shim: %v", err)
	}

	t.Setenv("USERPROFILE", home)
	t.Setenv("APPDATA", t.TempDir())
	t.Setenv("LOCALAPPDATA", t.TempDir())
	t.Setenv("PATH", `C:\Windows\System32`)

	resolved, err := resolveTuttiAgentBinary()
	if err != nil {
		t.Fatalf("resolveTuttiAgentBinary() error = %v", err)
	}
	if resolved != shimPath {
		t.Fatalf("resolveTuttiAgentBinary() = %q, want %q", resolved, shimPath)
	}
}
