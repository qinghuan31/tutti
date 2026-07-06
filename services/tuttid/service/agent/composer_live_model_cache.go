package agent

import (
	"strings"
	"sync"
	"time"

	"github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
)

const defaultLiveModelCacheTTL = 10 * time.Minute

type composerLiveModelCache struct {
	mu      sync.Mutex
	entries map[string]composerLiveModelCacheEntry
}

type composerLiveModelCacheEntry struct {
	cachedAt time.Time
	options  []ComposerConfigOptionValue
}

func newComposerLiveModelCache() *composerLiveModelCache {
	return &composerLiveModelCache{
		entries: make(map[string]composerLiveModelCacheEntry),
	}
}

func (c *composerLiveModelCache) get(key string, now time.Time, ttl time.Duration) ([]ComposerConfigOptionValue, bool) {
	if c == nil || ttl <= 0 {
		return nil, false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	entry, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	if now.Sub(entry.cachedAt) > ttl {
		delete(c.entries, key)
		return nil, false
	}
	return cloneComposerConfigOptionValues(entry.options), true
}

func (c *composerLiveModelCache) set(key string, now time.Time, options []ComposerConfigOptionValue) {
	if c == nil {
		return
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = composerLiveModelCacheEntry{
		cachedAt: now,
		options:  cloneComposerConfigOptionValues(options),
	}
}

func (c *composerLiveModelCache) invalidateProvider(provider string) int {
	if c == nil {
		return 0
	}
	prefix := "live-model:" + agentprovider.Normalize(provider) + ":"
	c.mu.Lock()
	defer c.mu.Unlock()
	deleted := 0
	for key := range c.entries {
		if strings.HasPrefix(key, prefix) {
			delete(c.entries, key)
			deleted++
		}
	}
	return deleted
}

// InvalidateLiveComposerModels drops the discovered model lists (and the
// once-per-key discovery attempt markers) for the given provider so composer
// options can re-discover models after the provider's auth or config files
// changed on disk.
func (s *Service) InvalidateLiveComposerModels(provider string) {
	if s == nil {
		return
	}
	normalized := agentprovider.Normalize(provider)
	if normalized == "" {
		return
	}
	nowUnixMS := time.Now().UnixMilli()
	deletedCacheEntries := s.liveComposerModelCache().invalidateProvider(normalized)
	prefix := "live-model:" + normalized + ":"
	s.liveModelDiscoveryMu.Lock()
	defer s.liveModelDiscoveryMu.Unlock()
	if s.liveModelInvalidatedAtUnixMS == nil {
		s.liveModelInvalidatedAtUnixMS = make(map[string]int64)
	}
	s.liveModelInvalidatedAtUnixMS[normalized] = nowUnixMS
	deletedAttemptMarkers := 0
	for key := range s.liveModelDiscoveryAttempted {
		if strings.HasPrefix(key, prefix) {
			delete(s.liveModelDiscoveryAttempted, key)
			deletedAttemptMarkers++
		}
	}
	logClaudeModelCatalogInvalidationDebug("live_composer_models_invalidated", map[string]any{
		"provider":              normalized,
		"deletedCacheEntries":   deletedCacheEntries,
		"deletedAttemptMarkers": deletedAttemptMarkers,
		"occurredAtUnixMs":      nowUnixMS,
	})
}

func (s *Service) liveModelCacheTTL() time.Duration {
	if s.LiveModelCacheTTL != 0 {
		return s.LiveModelCacheTTL
	}
	return defaultLiveModelCacheTTL
}

func (s *Service) liveComposerModelCache() *composerLiveModelCache {
	if s.liveModelCache == nil {
		s.liveModelCache = newComposerLiveModelCache()
	}
	return s.liveModelCache
}

func (s *Service) getLiveComposerModelOptions(provider, workspaceID, cwd string, now time.Time) ([]ComposerConfigOptionValue, bool) {
	key := composerLiveModelCacheKey(provider, workspaceID, cwd)
	return s.liveComposerModelCache().get(key, now, s.liveModelCacheTTL())
}

func (s *Service) setLiveComposerModelOptions(provider, workspaceID, cwd string, now time.Time, options []ComposerConfigOptionValue) {
	if len(options) == 0 {
		return
	}
	key := composerLiveModelCacheKey(provider, workspaceID, cwd)
	s.liveComposerModelCache().set(key, now, options)
}

func composerLiveModelCacheKey(provider, workspaceID, cwd string) string {
	return "live-model:" +
		agentprovider.Normalize(provider) + ":" +
		strings.TrimSpace(workspaceID) + ":" +
		strings.TrimSpace(cwd)
}

func cloneComposerConfigOptionValues(options []ComposerConfigOptionValue) []ComposerConfigOptionValue {
	if len(options) == 0 {
		return nil
	}
	return append([]ComposerConfigOptionValue(nil), options...)
}
