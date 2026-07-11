package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"

	agentactivitybiz "github.com/tutti-os/tutti/services/tuttid/biz/agentactivity"
	agentproviderbiz "github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
)

func (s *Service) importExternalSession(ctx context.Context, workspaceID string, session externalImportedSession) (int, bool, error) {
	agentSessionID := externalImportedSessionID(session.Provider, session.ProviderSessionID)
	existingTurnIDs, sessionExists, err := s.existingExternalImportMessageTurnIDs(ctx, workspaceID, agentSessionID)
	if err != nil {
		return 0, false, err
	}
	updates := make([]agentactivitybiz.MessageUpdate, 0, len(session.Messages))
	for i, message := range session.Messages {
		messageID := externalImportedMessageIDForMessage(session.Provider, session.ProviderSessionID, message, i)
		turnID := externalImportedTurnIDForMessage(session.Provider, session.ProviderSessionID, message, messageID)
		if existingTurnID, ok := existingTurnIDs[messageID]; ok && existingTurnID == turnID {
			continue
		}
		updates = append(updates, agentactivitybiz.MessageUpdate{
			MessageID:             messageID,
			TurnID:                turnID,
			AllowTurnReassignment: true,
			Role:                  message.Role,
			Kind:                  message.Kind,
			Status:                message.Status,
			Payload:               externalImportedMessagePayload(message),
			OccurredAtUnixMS:      message.OccurredAtUnixMS,
			StartedAtUnixMS:       message.StartedAtUnixMS,
			CompletedAtUnixMS:     message.CompletedAtUnixMS,
		})
	}
	if _, err := s.ExternalImportStore.ReportSessionState(ctx, agentactivitybiz.SessionStateReport{
		WorkspaceID:       workspaceID,
		AgentSessionID:    agentSessionID,
		Origin:            WorkspaceAgentSessionOriginImported,
		AgentTargetID:     externalImportAgentTargetID(session.Provider),
		Provider:          session.Provider,
		ProviderSessionID: session.ProviderSessionID,
		Model:             session.Model,
		Settings:          externalImportedSessionSettings(session),
		RuntimeContext: map[string]any{
			"visible":                 true,
			"imported":                true,
			"externalImportNoProject": session.NoProject,
			"externalSourcePath":      session.SourcePath,
		},
		Cwd:              session.Cwd,
		Title:            session.Title,
		Status:           "completed",
		CurrentPhase:     "completed",
		OccurredAtUnixMS: session.UpdatedAtUnixMS,
		StartedAtUnixMS:  session.StartedAtUnixMS,
		EndedAtUnixMS:    session.UpdatedAtUnixMS,
	}); err != nil {
		return 0, false, err
	}
	if len(updates) == 0 && sessionExists {
		return 0, false, nil
	}
	importedMessages := 0
	for start := 0; start < len(updates); start += 200 {
		end := start + 200
		if end > len(updates) {
			end = len(updates)
		}
		report, err := s.ExternalImportStore.ReportSessionMessages(ctx, agentactivitybiz.SessionMessageReport{
			WorkspaceID:    workspaceID,
			AgentSessionID: agentSessionID,
			Origin:         WorkspaceAgentSessionOriginImported,
			Provider:       session.Provider,
			Messages:       updates[start:end],
		})
		if err != nil {
			return importedMessages, true, err
		}
		importedMessages += report.AcceptedCount
	}
	return importedMessages, true, nil
}

func (s *Service) existingExternalImportMessageTurnIDs(ctx context.Context, workspaceID string, agentSessionID string) (map[string]string, bool, error) {
	turnIDs := map[string]string{}
	if s == nil || s.ExternalImportStore == nil {
		return turnIDs, false, nil
	}
	if _, ok, err := s.ExternalImportStore.GetSession(ctx, workspaceID, agentSessionID); err != nil || !ok {
		return turnIDs, ok, err
	}
	var after uint64
	for {
		page, ok, err := s.ExternalImportStore.ListSessionMessages(ctx, agentactivitybiz.ListSessionMessagesInput{
			WorkspaceID:    workspaceID,
			AgentSessionID: agentSessionID,
			AfterVersion:   after,
			Limit:          1000,
			Order:          agentactivitybiz.MessageOrderAsc,
		})
		if err != nil || !ok {
			return turnIDs, true, err
		}
		if len(page.Messages) == 0 {
			return turnIDs, true, nil
		}
		for _, message := range page.Messages {
			turnIDs[strings.TrimSpace(message.MessageID)] = strings.TrimSpace(message.TurnID)
			if message.Version > after {
				after = message.Version
			}
		}
		if !page.HasMore {
			return turnIDs, true, nil
		}
	}
}

func externalImportedSessionID(provider string, providerSessionID string) string {
	return "imported-" + agentproviderbiz.Normalize(provider) + "-" + externalStableHash(providerSessionID)[:24]
}

func externalImportedMessageID(provider string, providerSessionID string, rawID string, index int) string {
	return "imported-" + externalStableHash(provider + "\x00" + providerSessionID + "\x00" + rawID + "\x00" + strconv.Itoa(index))[:32]
}

func externalImportedMessageIDForMessage(provider string, providerSessionID string, message externalImportedMessage, index int) string {
	if seed := strings.TrimSpace(message.MessageIDSeed); seed != "" {
		return "imported-" + externalStableHash(provider + "\x00" + providerSessionID + "\x00" + seed)[:32]
	}
	return externalImportedMessageID(provider, providerSessionID, message.RawID, index)
}

func externalImportedTurnIDForMessage(provider string, providerSessionID string, message externalImportedMessage, messageID string) string {
	turnSeed := strings.TrimSpace(message.TurnID)
	if turnSeed == "" {
		turnSeed = messageID
	}
	return "imported-turn-" + externalStableHash(provider + "\x00" + providerSessionID + "\x00" + turnSeed)[:24]
}

func externalImportedMessagePayload(message externalImportedMessage) map[string]any {
	payload := clonePayload(message.Payload)
	if payload == nil {
		payload = map[string]any{}
	}
	if strings.TrimSpace(message.Kind) == "text" {
		payload["text"] = message.Text
	}
	return payload
}

func externalStableHash(input string) string {
	sum := sha256.Sum256([]byte(input))
	return hex.EncodeToString(sum[:])
}
