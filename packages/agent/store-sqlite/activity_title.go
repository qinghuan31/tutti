package storesqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

func (s *Store) UpdateSessionTitle(
	ctx context.Context,
	workspaceID string,
	agentSessionID string,
	title string,
) (Session, bool, error) {
	if s == nil || s.db == nil {
		return Session{}, false, errors.New("workspace database is not initialized")
	}
	workspaceID = strings.TrimSpace(workspaceID)
	agentSessionID = strings.TrimSpace(agentSessionID)
	title = strings.TrimSpace(title)
	if workspaceID == "" || agentSessionID == "" || title == "" {
		return Session{}, false, nil
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
		return Session{}, false, fmt.Errorf("update workspace agent session title: %w", err)
	}
	updated, err := rowsWereAffected(result, "update workspace agent session title")
	if err != nil {
		return Session{}, false, err
	}
	if !updated {
		return Session{}, false, nil
	}
	session, ok, err := s.GetSession(ctx, workspaceID, agentSessionID)
	if err != nil {
		return Session{}, false, err
	}
	return session, ok, nil
}

func getAgentSessionTx(
	ctx context.Context,
	tx *sql.Tx,
	workspaceID string,
	agentSessionID string,
) (Session, bool, error) {
	row := tx.QueryRowContext(ctx, `
SELECT workspace_id, agent_session_id, origin, agent_target_id, provider, provider_session_id, model,
       settings_json, runtime_context_json, cwd,
       title, status, current_phase, last_error, message_version, last_event_at_unix_ms,
       started_at_unix_ms, ended_at_unix_ms, pinned_at_unix_ms,
       created_at_unix_ms, updated_at_unix_ms
FROM workspace_agent_sessions
WHERE workspace_id = ? AND agent_session_id = ? AND deleted_at_unix_ms = 0
`, workspaceID, agentSessionID)
	session, err := scanAgentSession(row)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return Session{}, false, nil
		}
		return Session{}, false, fmt.Errorf("get workspace agent session after update: %w", err)
	}
	return session, true, nil
}
