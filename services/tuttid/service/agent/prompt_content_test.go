package agent

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestPromptAttachmentStoreRejectsDotPathSegments(t *testing.T) {
	store := PromptAttachmentStore{RootDir: t.TempDir()}
	for _, input := range []struct {
		name           string
		workspaceID    string
		agentSessionID string
		attachmentID   string
	}{
		{name: "session dotdot", workspaceID: "workspace-1", agentSessionID: "..", attachmentID: "attachment-1"},
		{name: "attachment dot", workspaceID: "workspace-1", agentSessionID: "session-1", attachmentID: "."},
	} {
		t.Run(input.name, func(t *testing.T) {
			_, err := store.attachmentPath(input.workspaceID, input.agentSessionID, input.attachmentID, "image/png")
			if !errors.Is(err, ErrInvalidArgument) {
				t.Fatalf("attachmentPath error = %v, want ErrInvalidArgument", err)
			}
		})
	}
}

func TestPromptAttachmentStoreUsesSessionScopedPath(t *testing.T) {
	root := t.TempDir()
	store := PromptAttachmentStore{RootDir: root}

	path, err := store.attachmentPath("workspace-1", "session-1", "attachment-1", "image/png")
	if err != nil {
		t.Fatalf("attachmentPath() error = %v", err)
	}

	want := filepath.Join(root, "agent", "attachments", "session-1", "attachment-1.png")
	if path != want {
		t.Fatalf("attachmentPath() = %q, want %q", path, want)
	}
	if strings.Contains(path, "workspace-1") {
		t.Fatalf("attachment path leaks workspace id: %q", path)
	}
}
