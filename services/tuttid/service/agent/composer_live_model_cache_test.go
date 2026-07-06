package agent

import (
	"testing"
	"time"

	"github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
)

func TestInvalidateLiveComposerModelsDropsCacheAndAttemptMarkers(t *testing.T) {
	service := &Service{}
	now := time.UnixMilli(1000)
	options := []ComposerConfigOptionValue{{ID: "opus", Label: "Opus", Value: "opus"}}
	service.setLiveComposerModelOptions(agentprovider.ClaudeCode, "ws-1", "/repo", now, options)
	cacheKey := composerLiveModelCacheKey(agentprovider.ClaudeCode, "ws-1", "/repo")
	if !service.markLiveModelDiscoveryAttempted(cacheKey) {
		t.Fatal("first markLiveModelDiscoveryAttempted must succeed")
	}

	service.InvalidateLiveComposerModels(agentprovider.ClaudeCode)

	if _, ok := service.getLiveComposerModelOptions(agentprovider.ClaudeCode, "ws-1", "/repo", now); ok {
		t.Fatal("cached live models must be dropped after invalidation")
	}
	if !service.markLiveModelDiscoveryAttempted(cacheKey) {
		t.Fatal("discovery attempt marker must be cleared after invalidation")
	}
}

func TestInvalidateLiveComposerModelsKeepsOtherProviders(t *testing.T) {
	service := &Service{}
	now := time.UnixMilli(1000)
	options := []ComposerConfigOptionValue{{ID: "opus", Label: "Opus", Value: "opus"}}
	service.setLiveComposerModelOptions(agentprovider.ClaudeCode, "ws-1", "/repo", now, options)

	service.InvalidateLiveComposerModels(agentprovider.Codex)

	if _, ok := service.getLiveComposerModelOptions(agentprovider.ClaudeCode, "ws-1", "/repo", now); !ok {
		t.Fatal("claude cache must survive a codex-only invalidation")
	}
}
