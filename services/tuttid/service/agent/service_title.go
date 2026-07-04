package agent

import (
	"context"
	"strings"
	"unicode/utf8"
)

const maxSessionTitleLength = 120

func (s *Service) UpdateTitle(ctx context.Context, workspaceID string, agentSessionID string, title string) (Session, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	agentSessionID = strings.TrimSpace(agentSessionID)
	title = strings.TrimSpace(title)
	if workspaceID == "" || agentSessionID == "" || title == "" || utf8.RuneCountInString(title) > maxSessionTitleLength {
		return Session{}, ErrInvalidArgument
	}
	updater, ok := s.SessionReader.(SessionTitleUpdater)
	if !ok {
		return Session{}, ErrSessionNotFound
	}
	persisted, updated, err := updater.UpdateSessionTitle(ctx, workspaceID, agentSessionID, title)
	if err != nil {
		return Session{}, err
	}
	if !updated {
		return Session{}, ErrSessionNotFound
	}
	if runtime, ok := s.controller().Session(workspaceID, agentSessionID); ok {
		service := serviceSession(
			runtime,
			s.controller().CanResume(runtimeResumeInputFromRuntimeSession(runtime)),
		)
		merged := mergePersistedSessionState(service, persisted)
		if title := strings.TrimSpace(persisted.Title); title != "" {
			merged.Title = &title
		}
		return merged, nil
	}
	return sessionFromPersisted(
		persisted,
		persistedSessionCanResume(s.controller(), persisted),
	), nil
}
