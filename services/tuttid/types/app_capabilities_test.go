package types

import "testing"

func TestResolveAppCapabilitiesIncludesManagedModelCLI(t *testing.T) {
	capabilities := ResolveAppCapabilities()
	if len(capabilities) != 1 || capabilities[0] != AppCapabilityManagedModelCLI {
		t.Fatalf("capabilities = %#v, want %q", capabilities, AppCapabilityManagedModelCLI)
	}
}
