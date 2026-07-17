//go:build windows

package agentruntime

import (
	"os"
	"path/filepath"
	"testing"
)

func TestIsExecutableFileAcceptsWindowsExecutableWithoutUnixModeBits(t *testing.T) {
	path := filepath.Join(t.TempDir(), "node.exe")
	if err := os.WriteFile(path, []byte("test"), 0o600); err != nil {
		t.Fatalf("write executable fixture: %v", err)
	}
	if !isExecutableFile(path) {
		t.Fatalf("isExecutableFile(%q) = false, want true on Windows", path)
	}
}
