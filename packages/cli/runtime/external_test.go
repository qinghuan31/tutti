package runtime_test

import (
	"testing"

	cliruntime "github.com/tutti-os/tutti/packages/cli/runtime"
)

func TestPublishedSurfaceLoadsEmbeddedContractAndVectors(t *testing.T) {
	manifest, err := cliruntime.LoadCanonicalManifest()
	if err != nil {
		t.Fatal(err)
	}
	if len(manifest.Commands) != 55 {
		t.Fatalf("manifest command count = %d, want 55", len(manifest.Commands))
	}
	if _, err := cliruntime.LoadArgvVectors(); err != nil {
		t.Fatal(err)
	}
	if _, err := cliruntime.LoadRenderVectors(); err != nil {
		t.Fatal(err)
	}
	if _, err := cliruntime.LoadGateVectors(); err != nil {
		t.Fatal(err)
	}
	if _, err := cliruntime.LoadManifestVectors(); err != nil {
		t.Fatal(err)
	}
	if _, err := cliruntime.LoadDomainScenarios(); err != nil {
		t.Fatal(err)
	}
}
