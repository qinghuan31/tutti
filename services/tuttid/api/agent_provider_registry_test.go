package api

import (
	"encoding/json"
	"testing"

	"github.com/tutti-os/tutti/packages/agent/daemon/providerregistry"
	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
)

func TestGeneratedAPIProviderContractsRemainOpen(t *testing.T) {
	if err := providerregistry.ValidateMigrated(); err != nil {
		t.Fatalf("ValidateMigrated() error = %v", err)
	}
	for _, providerID := range []string{providerregistry.CodexProviderID, "acp:gemini"} {
		workspaceRaw, err := json.Marshal(tuttigenerated.WorkspaceAgentProvider(providerID))
		if err != nil || string(workspaceRaw) != `"`+providerID+`"` {
			t.Errorf("workspace provider %q did not round trip: %s, %v", providerID, workspaceRaw, err)
		}
		targetRaw, err := json.Marshal(tuttigenerated.AgentTargetProvider(providerID))
		if err != nil || string(targetRaw) != `"`+providerID+`"` {
			t.Errorf("target provider %q did not round trip: %s, %v", providerID, targetRaw, err)
		}
	}
}
