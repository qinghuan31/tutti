package agentextension

import (
	"context"
	"errors"
	"fmt"
	"strings"

	agentruntime "github.com/tutti-os/tutti/packages/agent/daemon/runtime"
)

type RuntimeResolver struct {
	Manager   *Manager
	Transport agentruntime.ProcessTransport
	Host      agentruntime.HostMetadata
}

func (r RuntimeResolver) ResolveAdapter(ctx context.Context, input agentruntime.AdapterResolveInput) (agentruntime.Adapter, error) {
	if r.Manager == nil || r.Transport == nil {
		return nil, errors.New("agent extension runtime resolver is not configured")
	}
	if kind, _ := input.ProviderTargetRef["kind"].(string); kind != "agent_extension" {
		return nil, fmt.Errorf("dynamic provider %q requires an agent_extension target", input.Provider)
	}
	installationID, _ := input.ProviderTargetRef["extensionInstallationId"].(string)
	installationID = strings.TrimSpace(installationID)
	if installationID == "" {
		return nil, errors.New("agent extension installation id is required")
	}
	binding, err := r.Manager.ResolveRuntime(ctx, installationID)
	if err != nil {
		return nil, err
	}
	if binding.Installation.Provider != strings.TrimSpace(input.Provider) {
		return nil, errors.New("agent extension provider does not match installation")
	}
	return agentruntime.NewStandardACPAdapter(agentruntime.StandardACPAdapterConfig{
		Provider:          binding.Installation.Provider,
		Name:              binding.Installation.AgentKey + "-acp",
		DisplayName:       binding.Installation.DisplayName,
		Command:           binding.Command,
		AuthMessage:       binding.Installation.AuthMessage,
		ToolAliases:       binding.ToolAliases,
		PermissionModes:   binding.PermissionModes,
		PlanModeRuntimeID: binding.PlanModeRuntimeID,
	}, r.Transport, r.Host)
}
