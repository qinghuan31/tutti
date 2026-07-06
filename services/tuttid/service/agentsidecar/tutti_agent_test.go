package agentsidecar

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"
)

func TestIssueTuttiAgentLLMTokenUsesLegacyDefaultAppID(t *testing.T) {
	legacyAccountAppID := "nex" + "top"
	var requestedAppID string
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != tuttiAgentLLMTokenIssueRoute {
			t.Fatalf("path = %q, want %q", r.URL.Path, tuttiAgentLLMTokenIssueRoute)
		}
		var payload struct {
			RequestedAppID string   `json:"requested_app_id"`
			Scopes         []string `json:"scopes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		requestedAppID = payload.RequestedAppID
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"accessToken":"lat_test","accessTokenExpiresAt":"1780000000","refreshToken":"lrt_test","refreshTokenExpiresAt":"1790000000","tokenType":"Bearer","appId":"` + legacyAccountAppID + `","scopes":["llm:models","llm:chat"]}}`))
	}))
	defer account.Close()

	t.Setenv("TUTTI_ACCOUNT_BASE_URL", account.URL)
	t.Setenv("TUTTI_AGENT_LLM_APP_ID", "")

	bundle, err := issueTuttiAgentLLMToken(t.Context(), "session_id=test")
	if err != nil {
		t.Fatalf("issueTuttiAgentLLMToken() error = %v", err)
	}
	if requestedAppID != legacyAccountAppID {
		t.Fatalf("requested_app_id = %q, want legacy account app id", requestedAppID)
	}
	if bundle.AppID != legacyAccountAppID {
		t.Fatalf("bundle AppID = %q, want legacy account app id", bundle.AppID)
	}
}

func TestIssueTuttiAgentLLMTokenAppIDEnvOverride(t *testing.T) {
	var requestedAppID string
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var payload struct {
			RequestedAppID string `json:"requested_app_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		requestedAppID = payload.RequestedAppID
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0,"data":{"accessToken":"lat_test","accessTokenExpiresAt":"1780000000","refreshToken":"lrt_test","refreshTokenExpiresAt":"1790000000","tokenType":"Bearer","appId":"custom-app","scopes":["llm:models"]}}`))
	}))
	defer account.Close()

	t.Setenv("TUTTI_ACCOUNT_BASE_URL", account.URL)
	t.Setenv("TUTTI_AGENT_LLM_APP_ID", "custom-app")

	if _, err := issueTuttiAgentLLMToken(t.Context(), "session_id=test"); err != nil {
		t.Fatalf("issueTuttiAgentLLMToken() error = %v", err)
	}
	if requestedAppID != "custom-app" {
		t.Fatalf("requested_app_id = %q, want custom-app", requestedAppID)
	}
}

func TestLogoutTuttiAgentUserAuthRemovesAuthAndRevokesToken(t *testing.T) {
	revokeBody := make(chan map[string]string, 1)
	account := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/llm-token/revoke" {
			http.NotFound(w, r)
			return
		}
		var payload map[string]string
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Fatalf("decode revoke body: %v", err)
		}
		revokeBody <- payload
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"code":0}`))
	}))
	defer account.Close()

	home := t.TempDir()
	authDir := filepath.Join(home, ".tutti-agent")
	authPath := filepath.Join(authDir, "auth.json")
	if err := os.MkdirAll(authDir, 0o700); err != nil {
		t.Fatal(err)
	}
	authJSON := `{"tutti_llm":{"account_base_url":` + strconv.Quote(account.URL) + `,"access_token":"lat_test","refresh_token":"lrt_test"}}`
	if err := os.WriteFile(authPath, []byte(authJSON), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	if err := logoutTuttiAgentUserAuth(t.Context()); err != nil {
		t.Fatalf("logoutTuttiAgentUserAuth() error = %v", err)
	}
	if _, err := os.Stat(authPath); !os.IsNotExist(err) {
		t.Fatalf("auth json stat error = %v, want not exist", err)
	}
	select {
	case body := <-revokeBody:
		if body["refresh_token"] != "lrt_test" {
			t.Fatalf("refresh_token = %q, want lrt_test", body["refresh_token"])
		}
		if body["reason"] != "logout" {
			t.Fatalf("reason = %q, want logout", body["reason"])
		}
	case <-time.After(time.Second):
		t.Fatal("revoke request was not sent")
	}
}
