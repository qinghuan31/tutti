package workspace

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	agentactivitybiz "github.com/tutti-os/tutti/services/tuttid/biz/agentactivity"
)

func (s *SQLiteStore) UpdateSessionTitle(
	ctx context.Context,
	workspaceID string,
	agentSessionID string,
	title string,
) (agentactivitybiz.Session, bool, error) {
	if s == nil || s.db == nil {
		return agentactivitybiz.Session{}, false, errors.New("workspace database is not initialized")
	}
	workspaceID = strings.TrimSpace(workspaceID)
	agentSessionID = strings.TrimSpace(agentSessionID)
	title = strings.TrimSpace(title)
	if workspaceID == "" || agentSessionID == "" || title == "" {
		return agentactivitybiz.Session{}, false, nil
	}

	now := unixMs(time.Now().UTC())
	result, err := s.db.ExecContext(ctx, `
UPDATE workspace_agent_sessions
SET title = ?,
    title_source = 'user',
    updated_at_unix_ms = ?
WHERE workspace_id = ? AND agent_session_id = ? AND deleted_at_unix_ms = 0
`, title, now, workspaceID, agentSessionID)
	if err != nil {
		return agentactivitybiz.Session{}, false, fmt.Errorf("update workspace agent session title: %w", err)
	}
	updated, err := rowsWereAffected(result, "update workspace agent session title")
	if err != nil {
		return agentactivitybiz.Session{}, false, err
	}
	if !updated {
		return agentactivitybiz.Session{}, false, nil
	}
	session, ok, err := s.GetSession(ctx, workspaceID, agentSessionID)
	if err != nil {
		return agentactivitybiz.Session{}, false, err
	}
	return session, ok, nil
}
