package agenttarget

import (
	"testing"

	agentproviderbiz "github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
)

func TestAntigravityDefaultSystemTarget(t *testing.T) {
	targets := DefaultSystemTargets(1)
	var found *Target
	for i := range targets {
		if targets[i].ID == IDLocalAntigravity {
			found = &targets[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("DefaultSystemTargets did not include %q", IDLocalAntigravity)
	}
	if found.Provider != agentproviderbiz.Antigravity {
		t.Fatalf("Provider = %q, want %q", found.Provider, agentproviderbiz.Antigravity)
	}
	if !found.Enabled {
		t.Fatalf("Enabled = false, want true")
	}
}

func TestAntigravityNormalizeFirstIterationProvider(t *testing.T) {
	for _, in := range []string{"antigravity", "agy"} {
		if got := normalizeFirstIterationProvider(in); got != agentproviderbiz.Antigravity {
			t.Fatalf("normalizeFirstIterationProvider(%q) = %q, want %q", in, got, agentproviderbiz.Antigravity)
		}
	}
}

func TestAntigravityNormalizeTargetRoundTrip(t *testing.T) {
	target := Target{
		ID:              IDLocalAntigravity,
		Provider:        agentproviderbiz.Antigravity,
		LaunchRefJSON:   MustLocalCLILaunchRefJSON(agentproviderbiz.Antigravity),
		Name:            "Antigravity",
		IconKey:         "antigravity",
		Enabled:         true,
		Source:          SourceSystem,
		SortOrder:       40,
		CreatedAtUnixMS: 1,
		UpdatedAtUnixMS: 1,
	}
	normalized, err := NormalizeTarget(target)
	if err != nil {
		t.Fatalf("NormalizeTarget returned error: %v", err)
	}
	if normalized.Provider != agentproviderbiz.Antigravity {
		t.Fatalf("normalized.Provider = %q, want %q", normalized.Provider, agentproviderbiz.Antigravity)
	}
}
