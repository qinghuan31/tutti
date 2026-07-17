package types

import "sort"

// AppCapabilityManagedModelCLI is available only when the built-in Tutti CLI
// can serve all managed-model grant commands through the local daemon.
const AppCapabilityManagedModelCLI = "managed-model-cli-v1"

// ResolveAppCapabilities returns the static capabilities of this Tutti build.
// They are host-owned build contracts, never supplied by a workspace app.
func ResolveAppCapabilities() []string {
	capabilities := []string{AppCapabilityManagedModelCLI}
	sort.Strings(capabilities)
	return capabilities
}
