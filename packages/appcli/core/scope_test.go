package core

import "testing"

func TestScopeSetConflictKeepsDeterministicWinner(t *testing.T) {
	scopeSet := NewScopeSet(ScopeSetOptions{})
	scopeSet.Upsert(RegisteredApp{
		AppID: "z-app",
		Scope: "automation",
		Commands: []Command{{
			Capability: Capability{ID: "app.z-app.automation.run"},
		}},
	})
	scopeSet.Upsert(RegisteredApp{
		AppID: "a-app",
		Scope: "automation",
		Commands: []Command{{
			Capability: Capability{ID: "app.a-app.automation.run"},
		}},
	})

	capabilities := scopeSet.Capabilities()
	if len(capabilities) != 1 || capabilities[0].ID != "app.a-app.automation.run" {
		t.Fatalf("capabilities = %#v", capabilities)
	}
	if state := scopeSet.State("z-app"); state.Status != StatusWarning || len(state.Issues) != 1 {
		t.Fatalf("loser state = %#v", state)
	}
}

func TestScopeSetReservedScopeWarningsDoNotExposeCommands(t *testing.T) {
	scopeSet := NewScopeSet(ScopeSetOptions{ReservedScopes: map[string]struct{}{"agent": {}}})
	state := scopeSet.Upsert(RegisteredApp{
		AppID: "agent-app",
		Scope: "agent",
		Commands: []Command{{
			Capability: Capability{ID: "app.agent-app.agent.run"},
		}},
	})

	if state.Status != StatusWarning || state.Active {
		t.Fatalf("state = %#v", state)
	}
	if capabilities := scopeSet.Capabilities(); len(capabilities) != 0 {
		t.Fatalf("capabilities = %#v", capabilities)
	}
}
