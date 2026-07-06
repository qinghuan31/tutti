package agentruntime

// Gemini CLI's ACP provider config (`gemini --acp`).

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"strings"
)

func NewGeminiAdapter(transport ProcessTransport) *standardACPAdapter {
	return NewGeminiAdapterWithHostMetadata(transport, LegacyHostMetadata())
}

func NewGeminiAdapterWithHostMetadata(transport ProcessTransport, host HostMetadata) *standardACPAdapter {
	return &standardACPAdapter{
		config: standardACPConfig{
			provider:            ProviderGemini,
			adapterName:         "gemini-acp",
			command:             []string{"gemini", "--acp"},
			defaultTitle:        "Gemini CLI",
			authRequiredMessage: "Gemini ACP requires authentication in the runtime VM; ensure Gemini host credentials are synced before starting Agent GUI",
			permissionModeID: func(string) string {
				return "yolo"
			},
			initializeParams: func() map[string]any { return defaultACPInitializeParams(host) },
			env:              func(session Session) []string { return standardACPEnv(session, host) },
			beforeNewSession: geminiACPBeforeNewSession,
		},
		transport: transport,
		host:      host,
		sessions:  make(map[string]*standardACPSession),
	}
}

const (
	geminiAuthMethodOAuthPersonal = "oauth-personal"
	geminiAuthMethodAPIKey        = "gemini-api-key"
)

func geminiACPBeforeNewSession(
	ctx context.Context,
	client *acpClient,
	_ Session,
	initializeResult json.RawMessage,
) error {
	methodID := selectGeminiACPAuthMethod(initializeResult)
	if methodID == "" {
		return errors.New("gemini ACP initialize did not advertise an authentication method")
	}
	slog.Info("agent session gemini ACP authenticate starting",
		"event", "agent_session.gemini.acp.authenticate.start",
		"method_id", methodID,
	)
	_, err := client.CallWithTimeout(ctx, acpStartCallTimeout, acpMethodAuthenticate, map[string]any{
		"methodId": methodID,
	}, nil)
	if err != nil {
		slog.Warn("agent session gemini ACP authenticate failed",
			"event", "agent_session.gemini.acp.authenticate.failed",
			"method_id", methodID,
			"error", err.Error(),
		)
		return err
	}
	slog.Info("agent session gemini ACP authenticate succeeded",
		"event", "agent_session.gemini.acp.authenticate.succeeded",
		"method_id", methodID,
	)
	return nil
}

func selectGeminiACPAuthMethod(initializeResult json.RawMessage) string {
	var result struct {
		AuthMethods []struct {
			ID string `json:"id"`
		} `json:"authMethods"`
	}
	if err := json.Unmarshal(initializeResult, &result); err != nil || len(result.AuthMethods) == 0 {
		return geminiAuthMethodOAuthPersonal
	}
	ids := make([]string, 0, len(result.AuthMethods))
	for _, method := range result.AuthMethods {
		id := strings.TrimSpace(method.ID)
		if id != "" {
			ids = append(ids, id)
		}
	}
	if len(ids) == 0 {
		return geminiAuthMethodOAuthPersonal
	}
	for _, preferred := range []string{geminiAuthMethodAPIKey, geminiAuthMethodOAuthPersonal} {
		for _, id := range ids {
			if id == preferred {
				return id
			}
		}
	}
	return ids[0]
}
