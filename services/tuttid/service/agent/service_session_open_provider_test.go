package agent

import "testing"

func TestServiceSessionPreservesOpenProviderSettings(t *testing.T) {
	t.Parallel()

	session := serviceSession(ProviderRuntimeSession{
		ID:            "session-1",
		AgentTargetID: "extension:external-agent",
		Provider:      "acp:external-agent",
		Settings: &ComposerSettings{
			Model:            " external-model ",
			PermissionModeID: " external-permission ",
			PlanMode:         true,
			ReasoningEffort:  " external-reasoning ",
			Speed:            " external-speed ",
		},
	}, true)

	if session.Settings == nil {
		t.Fatal("open provider settings = nil, want established session settings")
	}
	if session.Settings.Model != "external-model" {
		t.Fatalf("open provider model = %q, want external-model", session.Settings.Model)
	}
	if session.Settings.PermissionModeID != "external-permission" {
		t.Fatalf("open provider permission mode = %q, want external-permission", session.Settings.PermissionModeID)
	}
	if !session.Settings.PlanMode {
		t.Fatal("open provider plan mode = false, want preserved")
	}
	if session.Settings.ReasoningEffort != "external-reasoning" {
		t.Fatalf("open provider reasoning effort = %q, want external-reasoning", session.Settings.ReasoningEffort)
	}
	if session.Settings.Speed != "external-speed" {
		t.Fatalf("open provider speed = %q, want external-speed", session.Settings.Speed)
	}
}

func TestServiceSessionStillClampsUnknownProviderSettings(t *testing.T) {
	t.Parallel()

	session := serviceSession(ProviderRuntimeSession{
		ID:       "session-1",
		Provider: "not a provider id",
		Settings: &ComposerSettings{Model: "stale-model", PlanMode: true},
	}, true)

	if session.Settings != nil {
		t.Fatalf("invalid provider settings = %#v, want nil", session.Settings)
	}
}
