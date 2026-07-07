package events

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

var expectedWrappedAnalyticsEvents = []string{
	"agent.node_result",
}

func TestWrappedAnalyticsEventsHaveServerReporterPackage(t *testing.T) {
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime caller unavailable")
	}
	eventsDir := filepath.Dir(filename)
	var missing []string
	for _, eventName := range expectedWrappedAnalyticsEvents {
		if !hasEventPackageFile(filepath.Join(eventsDir, eventPackagePath(eventName))) {
			missing = append(missing, eventName)
		}
	}
	if len(missing) > 0 {
		t.Fatalf("missing wrapped server analytics event packages: %v", missing)
	}

	actual := actualAnalyticsEvents(t, eventsDir)
	expected := make(map[string]bool, len(expectedWrappedAnalyticsEvents))
	for _, eventName := range expectedWrappedAnalyticsEvents {
		expected[eventName] = true
	}
	var unexpected []string
	for _, eventName := range actual {
		if !expected[eventName] {
			unexpected = append(unexpected, eventName)
		}
	}
	if len(unexpected) > 0 {
		t.Fatalf("unexpected wrapped server analytics event packages: %v", unexpected)
	}
}

func actualAnalyticsEvents(t *testing.T, eventsDir string) []string {
	t.Helper()
	var eventNames []string
	err := filepath.WalkDir(eventsDir, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".go" || strings.HasSuffix(entry.Name(), "_test.go") {
			return nil
		}
		eventDir := filepath.Dir(path)
		if eventDir == eventsDir {
			return nil
		}
		relative, err := filepath.Rel(eventsDir, eventDir)
		if err != nil {
			return err
		}
		eventNames = append(eventNames, strings.ReplaceAll(filepath.ToSlash(relative), "/", "."))
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	return eventNames
}

func hasEventPackageFile(eventDir string) bool {
	entries, err := os.ReadDir(eventDir)
	if err != nil {
		return false
	}
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		if filepath.Ext(name) == ".go" && !strings.HasSuffix(name, "_test.go") {
			return true
		}
	}
	return false
}

func eventPackagePath(eventName string) string {
	parts := []rune(eventName)
	for i, part := range parts {
		if part == '.' {
			parts[i] = filepath.Separator
		}
	}
	return string(parts)
}
