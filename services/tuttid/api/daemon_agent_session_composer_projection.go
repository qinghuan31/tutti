package api

import (
	"context"
	"strings"

	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
	agentproviderbiz "github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
)

func (api DaemonAPI) composerDefaultsForProvider(ctx context.Context, provider string) agentservice.ComposerSettings {
	if api.PreferencesService == nil {
		return agentservice.ComposerSettings{}
	}
	preferences, err := api.PreferencesService.Get(ctx)
	if err != nil {
		return agentservice.ComposerSettings{}
	}
	defaults := preferences.AgentComposerDefaultsByProvider[agentproviderbiz.Normalize(provider)]
	return agentservice.ComposerSettings{
		Model:            defaults.Model,
		PermissionModeID: defaults.PermissionModeID,
		ReasoningEffort:  defaults.ReasoningEffort,
	}
}

func (api DaemonAPI) composerDefaultLocale(ctx context.Context) string {
	if api.PreferencesService == nil {
		return ""
	}
	preferences, err := api.PreferencesService.Get(ctx)
	if err != nil {
		return ""
	}
	return preferences.Locale
}

func mergeComposerSettings(base agentservice.ComposerSettings, override agentservice.ComposerSettings) agentservice.ComposerSettings {
	if strings.TrimSpace(override.Model) != "" {
		base.Model = override.Model
	}
	if strings.TrimSpace(override.PermissionModeID) != "" {
		base.PermissionModeID = override.PermissionModeID
	}
	if override.PlanMode {
		base.PlanMode = override.PlanMode
	}
	if strings.TrimSpace(override.ReasoningEffort) != "" {
		base.ReasoningEffort = override.ReasoningEffort
	}
	if strings.TrimSpace(override.Speed) != "" {
		base.Speed = override.Speed
	}
	return base
}

func composerSettingsPatchFromGenerated(settings tuttigenerated.AgentSessionComposerSettings) agentservice.ComposerSettingsPatch {
	return agentservice.ComposerSettingsPatch{
		Model:            settings.Model,
		PermissionModeID: settings.PermissionModeId,
		PlanMode:         settings.PlanMode,
		BrowserUse:       settings.BrowserUse,
		ReasoningEffort:  settings.ReasoningEffort,
		Speed:            settings.Speed,
	}
}

func generatedAgentProviderComposerOptions(options agentservice.ComposerOptions) tuttigenerated.AgentProviderComposerOptionsResponse {
	effectiveSettings := generatedAgentSessionComposerSettings(options.EffectiveSettings)
	return tuttigenerated.AgentProviderComposerOptionsResponse{
		CapabilityCatalog: generatedAgentProviderCapabilityOptions(options.CapabilityCatalog),
		EffectiveSettings: effectiveSettings,
		ModelConfig:       generatedComposerConfigOption(options.ModelConfig),
		PermissionConfig:  generatedPermissionConfig(options.PermissionConfig),
		Provider:          tuttigenerated.WorkspaceAgentProvider(options.Provider),
		ReasoningConfig:   generatedComposerConfigOption(options.ReasoningConfig),
		SpeedConfig:       generatedComposerConfigOptionPointer(options.SpeedConfig),
		RuntimeContext:    options.RuntimeContext,
		Skills:            generatedAgentProviderSkillOptions(options.Skills),
	}
}

func generatedAgentSessionComposerSettings(settings agentservice.ComposerSettings) tuttigenerated.AgentSessionComposerSettings {
	result := tuttigenerated.AgentSessionComposerSettings{
		Model:            optionalStringPointer(strings.TrimSpace(settings.Model)),
		PermissionModeId: optionalStringPointer(strings.TrimSpace(settings.PermissionModeID)),
		PlanMode:         boolPointer(settings.PlanMode),
		ReasoningEffort:  optionalStringPointer(strings.TrimSpace(settings.ReasoningEffort)),
		Speed:            optionalStringPointer(strings.TrimSpace(settings.Speed)),
	}
	if settings.BrowserUse != nil {
		result.BrowserUse = settings.BrowserUse
	}
	return result
}

func generatedPermissionConfig(config agentservice.PermissionConfig) tuttigenerated.PermissionConfig {
	result := tuttigenerated.PermissionConfig{
		Configurable: config.Configurable,
		Modes:        make([]tuttigenerated.PermissionModeOption, 0, len(config.Modes)),
	}
	if strings.TrimSpace(config.DefaultValue) != "" {
		result.DefaultValue = optionalStringPointer(config.DefaultValue)
	}
	for _, mode := range config.Modes {
		option := tuttigenerated.PermissionModeOption{
			Id:       strings.TrimSpace(mode.ID),
			Label:    strings.TrimSpace(mode.Label),
			Semantic: tuttigenerated.PermissionModeSemantic(mode.Semantic),
		}
		if strings.TrimSpace(mode.Description) != "" {
			option.Description = optionalStringPointer(mode.Description)
		}
		if option.Id != "" && option.Label != "" {
			result.Modes = append(result.Modes, option)
		}
	}
	return result
}
