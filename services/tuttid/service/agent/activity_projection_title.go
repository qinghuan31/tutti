package agent

import (
	"context"
	"strings"
)

func (p *ActivityProjection) UpdateSessionTitle(ctx context.Context, workspaceID string, agentSessionID string, title string) (PersistedSession, bool, error) {
	if p == nil || p.repo == nil {
		return PersistedSession{}, false, nil
	}
	workspaceID = strings.TrimSpace(workspaceID)
	agentSessionID = strings.TrimSpace(agentSessionID)
	title = strings.TrimSpace(title)
	session, ok, err := p.repo.UpdateSessionTitle(ctx, workspaceID, agentSessionID, title)
	if err != nil {
		return PersistedSession{}, false, err
	}
	if !ok {
		return PersistedSession{}, false, nil
	}
	persisted := persistedSessionFromActivity(session)
	p.publishActivityUpdated(ctx, workspaceID, agentSessionID, "session_update", activitySessionUpdateEventPayload(workspaceID, agentSessionID, persisted.UpdatedAtUnixMS, persisted.AgentTargetID))
	return persisted, true, nil
}
