package agent

import (
	"context"
	"sort"
	"strings"

	agentactivitybiz "github.com/tutti-os/tutti/services/tuttid/biz/agentactivity"
)

type runtimeControlRoute struct {
	RootAgentSessionID string
	TargetSession      agentactivitybiz.Session
}

func (s *Service) cancelTargetsForTurn(
	ctx context.Context,
	workspaceID string,
	route runtimeControlRoute,
	turnID string,
) ([]RuntimeCancelTarget, error) {
	targetSessionID := strings.TrimSpace(route.TargetSession.ID)
	targets := []RuntimeCancelTarget{{AgentSessionID: targetSessionID, TurnID: strings.TrimSpace(turnID)}}
	if strings.TrimSpace(route.TargetSession.Kind) == agentactivitybiz.SessionKindChild {
		return targets, nil
	}
	reader, ok := s.SessionReader.(ChildSessionReader)
	if !ok {
		return targets, nil
	}
	children, err := reader.ListChildSessions(ctx, workspaceID, targetSessionID)
	if err != nil {
		return nil, err
	}
	childTargets := make([]RuntimeCancelTarget, 0, len(children))
	for _, child := range children {
		if strings.TrimSpace(child.RootTurnID) != strings.TrimSpace(turnID) {
			continue
		}
		activeTurnID := strings.TrimSpace(child.ActiveTurnID)
		if activeTurnID == "" {
			continue
		}
		childTargets = append(childTargets, RuntimeCancelTarget{
			AgentSessionID: strings.TrimSpace(child.ID),
			TurnID:         activeTurnID,
		})
	}
	sort.Slice(childTargets, func(left, right int) bool {
		if childTargets[left].AgentSessionID == childTargets[right].AgentSessionID {
			return childTargets[left].TurnID < childTargets[right].TurnID
		}
		return childTargets[left].AgentSessionID < childTargets[right].AgentSessionID
	})
	return append(childTargets, targets...), nil
}

// resolveRuntimeControlRoute uses the durable relation as the authority for
// routing a canonical root or child session to its root live provider runtime.
// It does not resume a child as an independent provider session.
func (s *Service) resolveRuntimeControlRoute(
	ctx context.Context,
	workspaceID string,
	agentSessionID string,
) (runtimeControlRoute, error) {
	if s == nil || s.TurnStore == nil {
		return runtimeControlRoute{}, ErrSessionNotFound
	}
	target, found, err := s.TurnStore.GetSession(ctx, workspaceID, agentSessionID)
	if err != nil {
		return runtimeControlRoute{}, err
	}
	if !found {
		return runtimeControlRoute{}, ErrSessionNotFound
	}
	rootAgentSessionID := strings.TrimSpace(target.RootAgentSessionID)
	if strings.TrimSpace(target.Kind) != agentactivitybiz.SessionKindChild {
		rootAgentSessionID = strings.TrimSpace(target.ID)
	}
	if rootAgentSessionID == "" {
		return runtimeControlRoute{}, ErrSessionNotFound
	}
	if _, err := s.ensureRuntimeSessionResult(ctx, workspaceID, rootAgentSessionID); err != nil {
		return runtimeControlRoute{}, err
	}
	return runtimeControlRoute{
		RootAgentSessionID: rootAgentSessionID,
		TargetSession:      target,
	}, nil
}
