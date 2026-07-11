package main

import (
	"bytes"
	"encoding/json"
	"testing"

	cliruntime "github.com/tutti-os/tutti/packages/cli/runtime"
)

func TestGenerateCanonicalSupersetIsDeterministic(t *testing.T) {
	first, err := generate()
	if err != nil {
		t.Fatal(err)
	}
	second, err := generate()
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first, second) {
		t.Fatal("canonical manifest generation is not deterministic")
	}
	var manifest cliruntime.CanonicalManifest
	if err := json.Unmarshal(first, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Commands) != canonicalCommandCount {
		t.Fatalf("command count = %d, want %d", len(manifest.Commands), canonicalCommandCount)
	}
	for _, command := range manifest.Commands {
		if command.Capability.Visibility == nil {
			t.Fatalf("command %q has no visibility", command.Capability.ID)
		}
		switch *command.Capability.Visibility {
		case "public", "integration":
		default:
			t.Fatalf("command %q visibility = %q", command.Capability.ID, *command.Capability.Visibility)
		}
		switch command.Capability.Source.Kind {
		case "builtin", "app":
		default:
			t.Fatalf("command %q source kind = %q", command.Capability.ID, command.Capability.Source.Kind)
		}
		if command.Capability.Output.DefaultMode == "" {
			t.Fatalf("command %q has empty default output mode", command.Capability.ID)
		}
	}
}
