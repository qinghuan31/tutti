package agentruntime

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestNewAntigravityAdapterConfig(t *testing.T) {
	adapter := NewAntigravityAdapter(nil)
	if adapter.config.provider != ProviderAntigravity {
		t.Fatalf("provider = %q, want %q", adapter.config.provider, ProviderAntigravity)
	}
	if adapter.config.adapterName != "antigravity-acp" {
		t.Fatalf("adapterName = %q, want antigravity-acp", adapter.config.adapterName)
	}
	if mode := adapter.config.permissionModeID("anything"); mode != "" {
		t.Fatalf("permissionModeID = %q, want empty (no set_mode)", mode)
	}
	if adapter.config.beforeNewSession != nil {
		t.Fatal("antigravity must not set beforeNewSession")
	}
	if adapter.config.commandResolver == nil {
		t.Fatal("antigravity must set a commandResolver to inject AGY_BIN")
	}
}

// The resolver must point the agy-acp command at a resolved binary AND inject
// AGY_BIN pointing at the resolved agy binary, so agy-acp never hits its
// broken built-in agy auto-download.
func TestAntigravityCommandResolverInjectsAgyBin(t *testing.T) {
	dir := t.TempDir()
	// fake agy + agy-acp binaries on PATH
	for _, name := range []string{"agy", "agy-acp"} {
		p := filepath.Join(dir, name)
		if err := os.WriteFile(p, []byte("#!/bin/sh\n"), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	t.Setenv("PATH", dir+string(os.PathListSeparator)+os.Getenv("PATH"))

	cmd, err := antigravityACPCommandResolver(context.Background(), ProviderAntigravity)
	if err != nil {
		t.Fatal(err)
	}
	if len(cmd.Command) == 0 || filepath.Base(cmd.Command[0]) != "agy-acp" {
		t.Fatalf("Command = %v, want it to start with resolved agy-acp", cmd.Command)
	}
	var agyBin string
	for _, kv := range cmd.Env {
		if strings.HasPrefix(kv, "AGY_BIN=") {
			agyBin = strings.TrimPrefix(kv, "AGY_BIN=")
		}
	}
	if filepath.Base(agyBin) != "agy" {
		t.Fatalf("AGY_BIN not injected with resolved agy path; Env = %v", cmd.Env)
	}
}

func TestAntigravityPermissionModeSwitches(t *testing.T) {
	if got := defaultPermissionModeIDForProvider(ProviderAntigravity); got != "" {
		t.Fatalf("default permission mode = %q, want empty", got)
	}
	for _, mode := range []string{"", "yolo", "auto", "full-access", "default"} {
		if permissionModeIDAllowedForProvider(ProviderAntigravity, mode) {
			t.Fatalf("mode %q must not be allowed for antigravity", mode)
		}
	}
}
