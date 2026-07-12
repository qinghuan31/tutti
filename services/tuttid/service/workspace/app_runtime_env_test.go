package workspace

import (
	"path/filepath"
	"runtime"
	"testing"

	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
)

func TestAppRuntimeProfileForManifestUsesEmbeddedNodeForWindowsShellBootstrap(t *testing.T) {
	manifest := workspacebiz.AppManifest{
		Runtime: workspacebiz.AppManifestRuntime{Bootstrap: "bootstrap.sh"},
	}

	profile := appRuntimeProfileForManifest(manifest)
	if runtime.GOOS == "windows" && profile != workspaceAppNodeRuntimePreloadProfile {
		t.Fatalf("profile = %q, want %q", profile, workspaceAppNodeRuntimePreloadProfile)
	}
	if runtime.GOOS != "windows" && profile != "" {
		t.Fatalf("profile = %q, want empty", profile)
	}

	manifest.Runtime.Bootstrap = filepath.Join("server", "start.exe")
	if profile := appRuntimeProfileForManifest(manifest); profile != "" {
		t.Fatalf("profile = %q, want empty for non-shell bootstrap", profile)
	}
}
