package agentstatus

import (
	"os"
	"path/filepath"
	"testing"
)

func TestParseCursorAuthMarkerNeverTreatsConfigAsCredential(t *testing.T) {
	path := filepath.Join(t.TempDir(), "cli-config.json")
	if err := os.WriteFile(path, []byte(`{"permissions":{"allow":["Read(**/*.md)"]}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	auth, ok := parseCursorAuthMarkerFile(path)
	if !ok || auth.Status != AuthRequired {
		t.Fatalf("parseCursorAuthMarkerFile() = (%#v, %v), want auth required", auth, ok)
	}

	if err := os.WriteFile(path, []byte(`not-json`), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, ok := parseCursorAuthMarkerFile(path); ok {
		t.Fatal("malformed Cursor config must not be accepted as an auth marker")
	}
}

func TestParseOpenCodeAuthMarkerValidatesCredentialRecords(t *testing.T) {
	path := filepath.Join(t.TempDir(), "auth.json")
	for _, test := range []struct {
		name    string
		content string
		status  AuthStatus
		ok      bool
	}{
		{name: "api", content: `{"anthropic":{"type":"api","key":"sk-test"}}`, status: AuthAuthenticated, ok: true},
		{name: "oauth", content: `{"openai":{"type":"oauth","access":"access-token","refresh":"refresh-token","expires":9999999999}}`, status: AuthAuthenticated, ok: true},
		{name: "blank api key", content: `{"anthropic":{"type":"api","key":""}}`, status: AuthRequired, ok: true},
		{name: "empty object", content: `{}`, status: AuthRequired, ok: true},
		{name: "malformed", content: `   `, ok: false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := os.WriteFile(path, []byte(test.content), 0o600); err != nil {
				t.Fatal(err)
			}
			auth, ok := parseOpenCodeAuthMarkerFile(path)
			if ok != test.ok {
				t.Fatalf("ok = %v, want %v", ok, test.ok)
			}
			if ok && auth.Status != test.status {
				t.Fatalf("status = %q, want %q", auth.Status, test.status)
			}
		})
	}
}
