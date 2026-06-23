package agentstatus

import (
	"context"
	"os"
	"strings"
)

const (
	// claudeACPExternalRegistryID is the ACP external agent registry id for the
	// Claude Code bridge (see DefaultRegistry()).
	claudeACPExternalRegistryID = "claude-acp"

	// claudeACPPackageName and claudeACPPinnedVersion identify the
	// @agentclientprotocol/claude-agent-acp bridge that the desktop app vendors
	// and ships with the package. Keep these in sync with CLAUDE_ACP_VERSION in
	// apps/desktop/scripts/vendor-claude-acp.mjs.
	claudeACPPackageName   = "@agentclientprotocol/claude-agent-acp"
	claudeACPPinnedVersion = "0.46.0"

	// claudeACPEntryPathEnv is set by the packaged desktop app to the vendored,
	// pre-patched bridge run entry (the package's `claude-agent-acp` bin, i.e.
	// dist/index.js) so the daemon can run Claude Code offline without a runtime
	// npm install. Mirrors TUTTI_BROWSER_MCP_ENTRY_PATH.
	claudeACPEntryPathEnv = "TUTTI_CLAUDE_ACP_ENTRY_PATH"
)

// bundledClaudeACPEntryPath returns the vendored claude-agent-acp run entry when
// the packaged desktop app has staged it and the file exists. An empty string
// means "not bundled" and callers fall back to the external registry / npm
// install path.
func (s Service) bundledClaudeACPEntryPath() string {
	entry := strings.TrimSpace(s.getenv(claudeACPEntryPathEnv))
	if entry == "" {
		return ""
	}
	if !s.fileExists(entry) {
		return ""
	}
	return entry
}

// resolveBundledClaudeACPSpec wires the provider spec to run the vendored,
// pre-patched bridge directly with the managed Node runtime. It deliberately
// leaves AdapterInstall empty: the bridge is already on disk, so
// nextMissingInstaller treats the adapter as present and never triggers an
// install. Returns ok=false when the managed Node runtime is unavailable, so the
// caller falls back to the external registry path.
func (s Service) resolveBundledClaudeACPSpec(
	ctx context.Context,
	spec ProviderSpec,
	entry string,
	requireManagedRuntime bool,
) (ProviderSpec, bool) {
	appRuntime, ok := s.resolveManagedRuntimeForProvider(ctx, requireManagedRuntime)
	if !ok {
		return spec, false
	}
	spec.AdapterCommand = []string{appRuntime.Node, entry}
	spec.AdapterEnv = cloneStrings(appRuntime.EnvOverrides)
	spec.AdapterPackage = AdapterPackageRequirement{
		Name:    claudeACPPackageName,
		Version: claudeACPPinnedVersion,
	}
	spec.AdapterInstall = InstallerSpec{}
	spec.AdapterUnavailableReasonCode = ""
	return spec, true
}

// getenv reads a single environment variable, honoring an injected Environ for
// testability and falling back to the process environment otherwise.
func (s Service) getenv(key string) string {
	if s.Environ == nil {
		return os.Getenv(key)
	}
	prefix := key + "="
	for _, kv := range s.Environ() {
		if strings.HasPrefix(kv, prefix) {
			return kv[len(prefix):]
		}
	}
	return ""
}
