package agent

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
	tuttitypes "github.com/tutti-os/tutti/services/tuttid/types"
)

const accountLiveModelCacheScope = "account"

type composerLiveModelScope struct {
	provider      string
	workspaceID   string
	cwd           string
	agentTargetID string
	authScope     string
}

func newComposerLiveModelScope(provider, workspaceID, cwd, agentTargetID string) composerLiveModelScope {
	return composerLiveModelScope{
		provider:      agentprovider.NormalizeOpen(provider),
		workspaceID:   strings.TrimSpace(workspaceID),
		cwd:           strings.TrimSpace(cwd),
		agentTargetID: strings.TrimSpace(agentTargetID),
		authScope:     liveModelAuthScope(provider),
	}
}

func (s composerLiveModelScope) key() string {
	workspaceScope := s.workspaceID
	if liveModelCatalogUsesAccountScope(s.provider) {
		workspaceScope = accountLiveModelCacheScope
	}
	targetScope := s.agentTargetID
	if targetScope == "" {
		targetScope = "default"
	}
	key := "live-model:" + s.provider + ":" + workspaceScope + ":" +
		liveModelCacheCwdScope(s.provider, s.cwd) + ":target=" + targetScope
	if s.authScope != "" {
		key += ":auth=" + s.authScope
	}
	return key
}

func liveModelCacheCwdScope(provider string, cwd string) string {
	if liveModelCatalogUsesAccountScope(provider) {
		return accountLiveModelCacheScope
	}
	return strings.TrimSpace(cwd)
}

func liveModelCatalogUsesAccountScope(provider string) bool {
	return composerProfileFor(provider).LiveModelAccountScoped
}

func (s *Service) resolveLiveModelDiscoveryCwd(
	ctx context.Context,
	provider string,
	requestedCwd string,
) (string, error) {
	if !liveModelCatalogUsesAccountScope(provider) {
		resolvedCwd := strings.TrimSpace(requestedCwd)
		if resolvedCwd == "" {
			return "", nil
		}
		return s.resolveCwd(ctx, &resolvedCwd)
	}

	stateDir := filepath.Clean(strings.TrimSpace(tuttitypes.DefaultStateDir()))
	if stateDir == "." || stateDir == string(filepath.Separator) {
		return "", errors.New("agent discovery state directory is not configured")
	}
	discoveryCwd := filepath.Join(stateDir, "agent", "discovery", agentprovider.NormalizeOpen(provider))
	if err := os.MkdirAll(discoveryCwd, 0o700); err != nil {
		return "", fmt.Errorf("create live-model discovery directory: %w", err)
	}
	return discoveryCwd, nil
}

func resolveAgentExtensionComposerDiscoveryCwd(provider string) (string, error) {
	stateDir := filepath.Clean(strings.TrimSpace(tuttitypes.DefaultStateDir()))
	if stateDir == "." || stateDir == string(filepath.Separator) {
		return "", errors.New("agent discovery state directory is not configured")
	}
	provider = agentprovider.NormalizeOpen(provider)
	if provider == "" {
		return "", errors.New("agent extension provider is invalid")
	}
	discoveryCwd := filepath.Join(stateDir, "agent", "discovery", strings.ReplaceAll(provider, ":", "-"))
	if err := os.MkdirAll(discoveryCwd, 0o700); err != nil {
		return "", fmt.Errorf("create agent extension composer discovery directory: %w", err)
	}
	return discoveryCwd, nil
}
