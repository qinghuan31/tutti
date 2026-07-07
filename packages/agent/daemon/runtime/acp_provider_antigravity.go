package agentruntime

// Antigravity's ACP provider config. Antigravity speaks ACP via the agy-acp
// bridge binary, which drives the `agy` CLI underneath.
//
// agy-acp ships with a built-in auto-download for `agy` that 404s in this
// environment, and it does not search PATH for an already-installed `agy`.
// The only way to make it use the installed binary is the $AGY_BIN
// environment variable, so the command resolver below always resolves both
// binaries and injects AGY_BIN into the spawned process env (mirroring the
// cursorACPCommandResolver pattern, but adding the env injection cursor
// doesn't need).
//
// Permissions are exposed by agy-acp via ACP configOptions
// (session/set_config_option), not session/set_mode, so permissionModeID
// stays a no-op returning "" (same precedent as openclaw).

import (
	"context"

	"github.com/tutti-os/tutti/packages/agent/daemon/runtimecmd"
)

// antigravityAgyBinaryNames is what the resolver looks up to point $AGY_BIN at
// the real agy CLI. agy-acp's own agy auto-download 404s, so AGY_BIN is
// mandatory, not an optimization.
var antigravityAgyBinaryNames = []string{"agy"}
var antigravityAgyAcpBinaryNames = []string{"agy-acp"}

// antigravityACPCommandResolver resolves the agy-acp adapter binary and injects
// AGY_BIN=<resolved agy path> so agy-acp spawns the installed agy instead of
// trying (and failing) to auto-download it. runtimecmd.Resolver augments PATH
// with the managed/known install dirs, handling the macOS GUI-PATH problem.
func antigravityACPCommandResolver(context.Context, string) (ProviderCommand, error) {
	resolver := runtimecmd.Resolver{}
	acpPath := resolver.ResolveBinary(antigravityAgyAcpBinaryNames, nil)
	command := []string{"agy-acp"}
	if acpPath != "" {
		command = []string{acpPath}
	}
	var env []string
	if agyPath := resolver.ResolveBinary(antigravityAgyBinaryNames, nil); agyPath != "" {
		env = append(env, "AGY_BIN="+agyPath)
	}
	return ProviderCommand{Command: command, Env: env}, nil
}

func NewAntigravityAdapter(transport ProcessTransport) *standardACPAdapter {
	return NewAntigravityAdapterWithHostMetadata(transport, LegacyHostMetadata())
}

func NewAntigravityAdapterWithHostMetadata(transport ProcessTransport, host HostMetadata) *standardACPAdapter {
	return &standardACPAdapter{
		config: standardACPConfig{
			provider:            ProviderAntigravity,
			adapterName:         "antigravity-acp",
			command:             []string{"agy-acp"},
			defaultTitle:        "Antigravity CLI",
			defaultTitleAliases: []string{"Antigravity", ProviderAntigravity, "agy"},
			authRequiredMessage: "Antigravity requires an authenticated agy CLI; run `agy` and sign in on the runtime host before starting Agent GUI",
			// agy-acp exposes modes via ACP configOptions (session/set_config_option),
			// NOT session/set_mode. So never send set_mode (openclaw precedent);
			// mapping tutti modes onto the `mode` config option is a future upgrade.
			permissionModeID: func(string) string {
				return ""
			},
			initializeParams: func() map[string]any { return defaultACPInitializeParams(host) },
			env:              func(session Session) []string { return standardACPEnv(session, host) },
			commandResolver:  antigravityACPCommandResolver,
		},
		transport: transport,
		host:      host,
		sessions:  make(map[string]*standardACPSession),
	}
}
