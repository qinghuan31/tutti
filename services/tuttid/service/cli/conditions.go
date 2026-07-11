package cli

func WithCapabilityConditions(command Command, conditions CapabilityConditions) Command {
	command.Capability.Conditions = conditions
	if NormalizeCapabilityVisibility(command.Capability.Visibility) == CapabilityVisibilityIntegration {
		command.Capability.Conditions.IntegrationVisibility = []string{"include-integration"}
	}
	return command
}
