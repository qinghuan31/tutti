package agentruntime

import "testing"

func TestACPUsageValueAcceptsCostSnapshotWindowSize(t *testing.T) {
	t.Parallel()

	usage, ok := acpUsageValue(map[string]any{
		"sessionUpdate": "usage_update",
		"used":          int64(39165),
		"size":          int64(1_000_000),
		"cost": map[string]any{
			"amount":   0.1956105,
			"currency": "USD",
		},
	})
	if !ok {
		t.Fatal("acpUsageValue() ok=false, want cost snapshot with used tokens")
	}
	if !usage.contextKnown || usage.contextUsedTokens != 39165 {
		t.Fatalf("usage = %#v, want used=39165 with contextKnown", usage)
	}
	if usage.contextWindowTokens != 1_000_000 {
		t.Fatalf("contextWindowTokens = %d, want 1000000 from provider payload", usage.contextWindowTokens)
	}
}

func TestMergeACPUsageStateKeepsWindowOnUsedOnlyUpdate(t *testing.T) {
	t.Parallel()

	merged := mergeACPUsageState(
		acpUsageState{
			contextKnown:        true,
			contextUsedTokens:   38674,
			contextWindowTokens: 200_000,
		},
		acpUsageState{
			contextKnown:      true,
			contextUsedTokens: 39165,
		},
	)
	if merged.contextUsedTokens != 39165 || merged.contextWindowTokens != 200_000 {
		t.Fatalf("merged = %#v, want used=39165 total=200000", merged)
	}
}
