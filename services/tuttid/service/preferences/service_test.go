package preferences

import (
	"context"
	"errors"
	"testing"

	preferencesbiz "github.com/tutti-os/tutti/services/tuttid/biz/preferences"
)

type preferencesStoreStub struct {
	getResult preferencesbiz.DesktopPreferences
	putInput  preferencesbiz.DesktopPreferences
}

type preferencesPublisherStub struct {
	published []preferencesbiz.DesktopPreferences
	err       error
}

func (s preferencesStoreStub) GetDesktopPreferences(context.Context) (preferencesbiz.DesktopPreferences, error) {
	return s.getResult, nil
}

func (s *preferencesStoreStub) PutDesktopPreferences(_ context.Context, preferences preferencesbiz.DesktopPreferences) (preferencesbiz.DesktopPreferences, error) {
	s.putInput = preferences
	return preferences, nil
}

func (s *preferencesPublisherStub) PublishDesktopPreferencesUpdated(_ context.Context, preferences preferencesbiz.DesktopPreferences) error {
	s.published = append(s.published, preferences)
	return s.err
}

func TestServiceGetReturnsStoredDesktopPreferences(t *testing.T) {
	t.Parallel()

	service := Service{
		Store: &preferencesStoreStub{
			getResult: preferencesbiz.DesktopPreferences{
				DefaultAgentProvider: "claude-code",

				BrowserUseConnectionMode: "autoConnect",
				DockIconStyle:            "default",
				DockPlacement:            "left",
				Initialized:              true,
				Locale:                   "zh-CN",
				MinimizeAnimation:        "scale",
				SleepPreventionMode:      "whileAgentRunning",
				ThemeSource:              "dark",
				UpdateChannel:            "rc",
				UpdatePolicy:             "auto",
			},
		},
	}

	preferences, err := service.Get(context.Background())
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if !preferences.Initialized {
		t.Fatal("Get() initialized = false, want true")
	}
	if preferences.DockPlacement != "left" {
		t.Fatalf("Get() dockPlacement = %q, want left", preferences.DockPlacement)
	}
	if preferences.Locale != "zh-CN" {
		t.Fatalf("Get() locale = %q, want zh-CN", preferences.Locale)
	}
	if preferences.DefaultAgentProvider != "claude-code" {
		t.Fatalf("Get() defaultAgentProvider = %q, want claude-code", preferences.DefaultAgentProvider)
	}
	if preferences.ThemeSource != "dark" {
		t.Fatalf("Get() themeSource = %q, want dark", preferences.ThemeSource)
	}
	if preferences.SleepPreventionMode != "whileAgentRunning" {
		t.Fatalf("Get() sleepPreventionMode = %q, want whileAgentRunning", preferences.SleepPreventionMode)
	}
	if preferences.BrowserUseConnectionMode != "autoConnect" {
		t.Fatalf("Get() browserUseConnectionMode = %q, want autoConnect", preferences.BrowserUseConnectionMode)
	}
	if preferences.UpdateChannel != "rc" {
		t.Fatalf("Get() updateChannel = %q, want rc", preferences.UpdateChannel)
	}
	if preferences.UpdatePolicy != "auto" {
		t.Fatalf("Get() updatePolicy = %q, want auto", preferences.UpdatePolicy)
	}
}

func TestServicePutTrimsDesktopPreferences(t *testing.T) {
	t.Parallel()

	store := &preferencesStoreStub{}
	publisher := &preferencesPublisherStub{}
	service := Service{
		Store:     store,
		Publisher: publisher,
	}

	preferences, err := service.Put(context.Background(), PutInput{
		AgentComposerDefaultsByProvider: map[string]preferencesbiz.AgentComposerDefaults{
			" claude ": {
				Model:            " claude-3-5 ",
				PermissionModeID: " full-access ",
				ReasoningEffort:  " high ",
			},
			"codex": {},
		},
		AgentGUIConversationRailCollapsedByProvider: map[string]bool{
			" codex ": true,
			"claude":  false,
			"unknown": true,
		},
		DefaultAgentProvider: " claude ",

		BrowserUseConnectionMode: " autoConnect ",
		DockIconStyle:            "default",
		DockPlacement:            " left ",
		FileDefaultOpenersByExtension: map[string]string{
			".HTML":   " fileViewer ",
			"bad/ext": "defaultBrowser",
			"pdf":     "defaultBrowser",
			"txt":     "unknown",
			"_tmp":    "system",
		},
		Locale:              " zh-CN ",
		MinimizeAnimation:   "scale",
		SleepPreventionMode: "whileAgentRunning",
		ThemeSource:         " dark ",
		UpdateChannel:       " rc ",
		UpdatePolicy:        " auto ",
	})
	if err != nil {
		t.Fatalf("Put() error = %v", err)
	}
	if !preferences.Initialized {
		t.Fatal("Put() initialized = false, want true")
	}
	if store.putInput.DockPlacement != "left" {
		t.Fatalf("stored dockPlacement = %q, want left", store.putInput.DockPlacement)
	}
	if store.putInput.Locale != "zh-CN" {
		t.Fatalf("stored locale = %q, want zh-CN", store.putInput.Locale)
	}
	if store.putInput.DefaultAgentProvider != "claude-code" {
		t.Fatalf("stored defaultAgentProvider = %q, want claude-code", store.putInput.DefaultAgentProvider)
	}
	if store.putInput.ThemeSource != "dark" {
		t.Fatalf("stored themeSource = %q, want dark", store.putInput.ThemeSource)
	}
	if store.putInput.SleepPreventionMode != "whileAgentRunning" {
		t.Fatalf("stored sleepPreventionMode = %q, want whileAgentRunning", store.putInput.SleepPreventionMode)
	}
	if store.putInput.BrowserUseConnectionMode != "autoConnect" {
		t.Fatalf("stored browserUseConnectionMode = %q, want autoConnect", store.putInput.BrowserUseConnectionMode)
	}
	if store.putInput.UpdateChannel != "rc" {
		t.Fatalf("stored updateChannel = %q, want rc", store.putInput.UpdateChannel)
	}
	if store.putInput.UpdatePolicy != "auto" {
		t.Fatalf("stored updatePolicy = %q, want auto", store.putInput.UpdatePolicy)
	}
	if store.putInput.FileDefaultOpenersByExtension["html"] != "fileViewer" ||
		store.putInput.FileDefaultOpenersByExtension["pdf"] != "defaultBrowser" ||
		len(store.putInput.FileDefaultOpenersByExtension) != 2 {
		t.Fatalf("stored file openers = %#v, want normalized html/pdf", store.putInput.FileDefaultOpenersByExtension)
	}
	claudeDefaults := store.putInput.AgentComposerDefaultsByProvider["claude-code"]
	if claudeDefaults.Model != "claude-3-5" ||
		claudeDefaults.PermissionModeID != "full-access" ||
		claudeDefaults.ReasoningEffort != "high" {
		t.Fatalf("stored claude defaults = %#v, want trimmed values", claudeDefaults)
	}
	if _, ok := store.putInput.AgentComposerDefaultsByProvider["codex"]; ok {
		t.Fatal("stored codex empty defaults, want omitted")
	}
	if !store.putInput.AgentGUIConversationRailCollapsedByProvider["codex"] {
		t.Fatal("stored codex rail collapsed = false, want true")
	}
	if collapsed, ok := store.putInput.AgentGUIConversationRailCollapsedByProvider["claude-code"]; !ok || collapsed {
		t.Fatalf("stored claude rail collapsed = %v/%v, want present false", collapsed, ok)
	}
	if _, ok := store.putInput.AgentGUIConversationRailCollapsedByProvider["unknown"]; ok {
		t.Fatal("stored unknown rail collapsed provider")
	}
	if len(publisher.published) != 1 {
		t.Fatalf("published len = %d, want 1", len(publisher.published))
	}
	if publisher.published[0].DockPlacement != "left" ||
		publisher.published[0].Locale != "zh-CN" ||
		publisher.published[0].DefaultAgentProvider != "claude-code" ||
		publisher.published[0].ThemeSource != "dark" ||
		publisher.published[0].SleepPreventionMode != "whileAgentRunning" ||
		publisher.published[0].BrowserUseConnectionMode != "autoConnect" ||
		publisher.published[0].UpdateChannel != "rc" ||
		publisher.published[0].UpdatePolicy != "auto" {
		t.Fatalf("published preferences = %#v, want left/zh-CN/dark/prevent-sleep/autoConnect/rc/auto", publisher.published[0])
	}
}

func TestServicePutReturnsStoredPreferencesWhenPublishFails(t *testing.T) {
	t.Parallel()

	store := &preferencesStoreStub{}
	publisher := &preferencesPublisherStub{err: errors.New("publish failed")}
	service := Service{
		Store:     store,
		Publisher: publisher,
	}

	preferences, err := service.Put(context.Background(), PutInput{
		DockPlacement:        "left",
		DefaultAgentProvider: "codex",

		DockIconStyle:       "default",
		Locale:              "zh-CN",
		MinimizeAnimation:   "scale",
		SleepPreventionMode: "whileAgentRunning",
		ThemeSource:         "dark",
		UpdateChannel:       "stable",
		UpdatePolicy:        "prompt",
	})
	if err != nil {
		t.Fatalf("Put() error = %v, want nil", err)
	}
	if !preferences.Initialized {
		t.Fatal("Put() initialized = false, want true")
	}
	if store.putInput.DockPlacement != "left" ||
		store.putInput.Locale != "zh-CN" ||
		store.putInput.DefaultAgentProvider != "codex" ||
		store.putInput.ThemeSource != "dark" ||
		store.putInput.SleepPreventionMode != "whileAgentRunning" ||
		store.putInput.UpdateChannel != "stable" ||
		store.putInput.UpdatePolicy != "prompt" {
		t.Fatalf("stored preferences = %#v, want left/zh-CN/dark/prevent-sleep/stable/prompt", store.putInput)
	}
	if len(publisher.published) != 1 {
		t.Fatalf("published len = %d, want 1", len(publisher.published))
	}
}
