package main

import (
	"context"

	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
	agentextensionservice "github.com/tutti-os/tutti/services/tuttid/service/agentextension"
)

type agentExtensionComposerProfileResolver struct {
	manager *agentextensionservice.Manager
}

func (r agentExtensionComposerProfileResolver) ResolveExtensionComposerProfile(
	_ context.Context,
	installationID string,
) (agentservice.ExtensionComposerProfile, error) {
	profile, err := r.manager.LoadComposerProfile(installationID)
	if err != nil || profile.Skills == nil {
		return agentservice.ExtensionComposerProfile{}, err
	}
	roots := make([]agentservice.ExtensionComposerSkillRoot, 0, len(profile.Skills.Roots))
	for _, root := range profile.Skills.Roots {
		roots = append(roots, agentservice.ExtensionComposerSkillRoot{
			Scope: root.Scope,
			Path:  root.Path,
		})
	}
	return agentservice.ExtensionComposerProfile{
		Skills: &agentservice.ExtensionComposerSkillProfile{
			Invocation:    profile.Skills.Invocation,
			TriggerPrefix: profile.Skills.TriggerPrefix,
			Roots:         roots,
		},
	}, nil
}
