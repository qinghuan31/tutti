package ingress

import (
	"context"
	"fmt"
	"strings"

	agentsessionstore "github.com/tutti-os/tutti/packages/agent/daemon/activity"
	guestdesktoprelayv1 "github.com/tutti-os/tutti/packages/agent/daemon/internal/guestdesktoprelay/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type Reporter = agentsessionstore.SessionActivityReporter

type Config struct {
	RoomID      string
	WorkspaceID string
	Reporter    Reporter
}

type Service struct {
	guestdesktoprelayv1.UnimplementedAgentActivityIngressServiceServer

	roomID   string
	reporter Reporter
}

func Register(grpcServer *grpc.Server, cfg Config) error {
	service, err := NewService(cfg)
	if err != nil {
		return err
	}
	guestdesktoprelayv1.RegisterAgentActivityIngressServiceServer(grpcServer, service)
	return nil
}

func NewService(cfg Config) (*Service, error) {
	roomID := firstNonEmptyString(cfg.RoomID, cfg.WorkspaceID)
	if roomID == "" {
		return nil, fmt.Errorf("room_id is required")
	}
	if cfg.Reporter == nil {
		return nil, fmt.Errorf("reporter is required")
	}
	return &Service{roomID: roomID, reporter: cfg.Reporter}, nil
}

func (s *Service) ReportActivity(ctx context.Context, req *guestdesktoprelayv1.ReportAgentActivityRequest) (*guestdesktoprelayv1.ReportAgentActivityResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	roomID, err := s.resolveRoomID(req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	source, err := eventSourceFromProto(req.GetSource())
	if err != nil {
		return nil, err
	}
	reply, err := agentsessionstore.ReportActivityAsSessionUpdates(ctx, s.reporter, agentsessionstore.ReportActivityInput{
		WorkspaceID:    roomID,
		Connector:      connectorInfoPointerFromProto(req.GetConnector()),
		Source:         source,
		TimelineItems:  timelineItemsFromProto(req.GetTimelineItems()),
		StatePatches:   statePatchesFromProto(req.GetStatePatches()),
		MessageUpdates: messageUpdatesFromProto(req.GetMessageUpdates()),
	})
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "report agent activity: %v", err)
	}
	return &guestdesktoprelayv1.ReportAgentActivityResponse{
		AcceptedTimelineItemCount:  int32(reply.AcceptedTimelineItemCount),
		AcceptedStatePatchCount:    int32(reply.AcceptedStatePatchCount),
		AcceptedMessageUpdateCount: int32(reply.AcceptedMessageUpdateCount),
	}, nil
}

func (s *Service) ReportSessionState(ctx context.Context, req *guestdesktoprelayv1.ReportAgentSessionStateRequest) (*guestdesktoprelayv1.ReportAgentSessionStateResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	roomID, err := s.resolveRoomID(req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	agentSessionID := strings.TrimSpace(req.GetAgentSessionId())
	if agentSessionID == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_session_id is required")
	}
	sessionOrigin, err := serverSessionOriginFromProto(req.GetSessionOrigin())
	if err != nil {
		return nil, err
	}
	source, err := eventSourceFromProto(req.GetSource())
	if err != nil {
		return nil, err
	}
	reply, err := s.reporter.ReportSessionState(ctx, agentsessionstore.ReportSessionStateInput{
		WorkspaceID:    roomID,
		AgentSessionID: agentSessionID,
		SessionOrigin:  sessionOrigin,
		Connector:      connectorInfoPointerFromProto(req.GetConnector()),
		Source:         source,
		State:          sessionStateUpdateFromProto(req.GetState()),
	})
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "report agent session state: %v", err)
	}
	return &guestdesktoprelayv1.ReportAgentSessionStateResponse{
		Accepted:          reply.Accepted,
		LastEventAtUnixMs: reply.LastEventAtUnixMS,
	}, nil
}

func (s *Service) ReportSessionMessages(ctx context.Context, req *guestdesktoprelayv1.ReportAgentSessionMessagesRequest) (*guestdesktoprelayv1.ReportAgentSessionMessagesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	roomID, err := s.resolveRoomID(req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	agentSessionID := strings.TrimSpace(req.GetAgentSessionId())
	if agentSessionID == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_session_id is required")
	}
	sessionOrigin, err := serverSessionOriginFromProto(req.GetSessionOrigin())
	if err != nil {
		return nil, err
	}
	source, err := eventSourceFromProto(req.GetSource())
	if err != nil {
		return nil, err
	}
	reply, err := s.reporter.ReportSessionMessages(ctx, agentsessionstore.ReportSessionMessagesInput{
		WorkspaceID:    roomID,
		AgentSessionID: agentSessionID,
		SessionOrigin:  sessionOrigin,
		Connector:      connectorInfoPointerFromProto(req.GetConnector()),
		Source:         source,
		Updates:        sessionMessageUpdatesFromProto(req.GetUpdates()),
	})
	if err != nil {
		return nil, status.Errorf(codes.Unavailable, "report agent session messages: %v", err)
	}
	return &guestdesktoprelayv1.ReportAgentSessionMessagesResponse{
		AcceptedCount: int32(reply.AcceptedCount),
		LatestVersion: reply.LatestVersion,
	}, nil
}

func (s *Service) resolveRoomID(workspaceID string) (string, error) {
	roomID := strings.TrimSpace(workspaceID)
	if roomID == "" {
		roomID = strings.TrimSpace(s.roomID)
	}
	if roomID == "" {
		return "", status.Error(codes.InvalidArgument, "workspace_id is required")
	}
	if configuredRoomID := strings.TrimSpace(s.roomID); configuredRoomID != "" && roomID != configuredRoomID {
		return "", status.Error(codes.PermissionDenied, "workspace_id does not match service room")
	}
	return roomID, nil
}

func connectorInfoPointerFromProto(connector *guestdesktoprelayv1.AgentActivityConnector) *agentsessionstore.ConnectorInfo {
	info := connectorInfoFromProto(connector)
	if strings.TrimSpace(info.ID) == "" && strings.TrimSpace(info.Version) == "" {
		return nil
	}
	return &info
}

func connectorInfoFromProto(connector *guestdesktoprelayv1.AgentActivityConnector) agentsessionstore.ConnectorInfo {
	if connector == nil {
		return agentsessionstore.ConnectorInfo{}
	}
	return agentsessionstore.ConnectorInfo{
		ID:      strings.TrimSpace(connector.GetId()),
		Version: strings.TrimSpace(connector.GetVersion()),
	}
}

func eventSourceFromProto(source *guestdesktoprelayv1.AgentActivitySource) (agentsessionstore.EventSource, error) {
	if source == nil {
		return agentsessionstore.EventSource{
			SessionOrigin: agentsessionstore.WorkspaceAgentSessionOriginRuntime,
		}, nil
	}
	sessionOrigin, err := serverSessionOriginFromProto(source.GetSessionOrigin())
	if err != nil {
		return agentsessionstore.EventSource{}, err
	}
	return agentsessionstore.EventSource{
		Provider:          strings.TrimSpace(source.GetProvider()),
		ProviderSessionID: strings.TrimSpace(source.GetProviderSessionId()),
		AgentID:           strings.TrimSpace(source.GetAgentId()),
		CWD:               strings.TrimSpace(source.GetCwd()),
		SessionOrigin:     sessionOrigin,
	}, nil
}

func serverSessionOriginFromProto(origin guestdesktoprelayv1.AgentSessionOrigin) (string, error) {
	switch origin {
	case guestdesktoprelayv1.AgentSessionOrigin_AGENT_SESSION_ORIGIN_UNSPECIFIED:
		return agentsessionstore.WorkspaceAgentSessionOriginRuntime, nil
	case guestdesktoprelayv1.AgentSessionOrigin_AGENT_SESSION_ORIGIN_RUNTIME:
		return agentsessionstore.WorkspaceAgentSessionOriginRuntime, nil
	case guestdesktoprelayv1.AgentSessionOrigin(1):
		return "", status.Error(codes.InvalidArgument, "unsupported session origin 1")
	default:
		return "", status.Errorf(codes.InvalidArgument, "unsupported session origin %d", origin)
	}
}

func timelineItemsFromProto(items []*guestdesktoprelayv1.AgentActivityTimelineItem) []agentsessionstore.WorkspaceAgentTimelineItem {
	if len(items) == 0 {
		return nil
	}
	out := make([]agentsessionstore.WorkspaceAgentTimelineItem, 0, len(items))
	for _, item := range items {
		if item == nil {
			continue
		}
		out = append(out, agentsessionstore.WorkspaceAgentTimelineItem{
			ID:               item.GetId(),
			RoomID:           strings.TrimSpace(item.GetRoomId()),
			AgentSessionID:   strings.TrimSpace(item.GetAgentSessionId()),
			TurnID:           strings.TrimSpace(item.GetTurnId()),
			EventID:          strings.TrimSpace(item.GetEventId()),
			ActorType:        strings.TrimSpace(item.GetActorType()),
			ActorID:          strings.TrimSpace(item.GetActorId()),
			ItemType:         strings.TrimSpace(item.GetItemType()),
			Role:             strings.TrimSpace(item.GetRole()),
			CallType:         strings.TrimSpace(item.GetCallType()),
			CallID:           strings.TrimSpace(item.GetCallId()),
			Name:             strings.TrimSpace(item.GetName()),
			Status:           strings.TrimSpace(item.GetStatus()),
			Payload:          structMap(item.GetPayload()),
			OccurredAtUnixMS: item.GetOccurredAtUnixMs(),
			CreatedAtUnixMS:  item.GetCreatedAtUnixMs(),
			EventSource:      strings.TrimSpace(item.GetEventSource()),
		})
	}
	return out
}

func statePatchesFromProto(patches []*guestdesktoprelayv1.AgentActivityStatePatch) []agentsessionstore.WorkspaceAgentStatePatch {
	if len(patches) == 0 {
		return nil
	}
	out := make([]agentsessionstore.WorkspaceAgentStatePatch, 0, len(patches))
	for _, patch := range patches {
		if patch == nil {
			continue
		}
		out = append(out, statePatchFromProto(patch))
	}
	return out
}

func sessionStateUpdateFromProto(state *guestdesktoprelayv1.AgentSessionStateUpdate) agentsessionstore.WorkspaceAgentSessionStateUpdate {
	if state == nil {
		return agentsessionstore.WorkspaceAgentSessionStateUpdate{}
	}
	out := agentsessionstore.WorkspaceAgentSessionStateUpdate{
		Provider:          strings.TrimSpace(state.GetProvider()),
		ProviderSessionID: strings.TrimSpace(state.GetProviderSessionId()),
		Model:             strings.TrimSpace(state.GetModel()),
		CWD:               strings.TrimSpace(state.GetCwd()),
		Title:             strings.TrimSpace(state.GetTitle()),
		LifecycleStatus:   strings.TrimSpace(state.GetLifecycleStatus()),
		CurrentPhase:      strings.TrimSpace(state.GetCurrentPhase()),
		OccurredAtUnixMS:  state.GetOccurredAtUnixMs(),
		StartedAtUnixMS:   state.GetStartedAtUnixMs(),
		EndedAtUnixMS:     state.GetEndedAtUnixMs(),
	}
	if turn := state.GetTurn(); turn != nil {
		out.Turn = &agentsessionstore.WorkspaceAgentTurnStateUpdate{
			TurnID:            strings.TrimSpace(turn.GetTurnId()),
			Phase:             strings.TrimSpace(turn.GetPhase()),
			Outcome:           strings.TrimSpace(turn.GetOutcome()),
			FileChanges:       structMap(turn.GetFileChanges()),
			StartedAtUnixMS:   turn.GetStartedAtUnixMs(),
			CompletedAtUnixMS: turn.GetCompletedAtUnixMs(),
		}
	}
	return out
}

func sessionMessageUpdatesFromProto(updates []*guestdesktoprelayv1.AgentSessionMessageUpdate) []agentsessionstore.WorkspaceAgentSessionMessageUpdate {
	if len(updates) == 0 {
		return nil
	}
	out := make([]agentsessionstore.WorkspaceAgentSessionMessageUpdate, 0, len(updates))
	for _, update := range updates {
		if update == nil {
			continue
		}
		out = append(out, agentsessionstore.WorkspaceAgentSessionMessageUpdate{
			MessageID:         strings.TrimSpace(update.GetMessageId()),
			TurnID:            strings.TrimSpace(update.GetTurnId()),
			Role:              strings.TrimSpace(update.GetRole()),
			Kind:              strings.TrimSpace(update.GetKind()),
			Status:            strings.TrimSpace(update.GetStatus()),
			Payload:           structMap(update.GetPayload()),
			OccurredAtUnixMS:  update.GetOccurredAtUnixMs(),
			StartedAtUnixMS:   update.GetStartedAtUnixMs(),
			CompletedAtUnixMS: update.GetCompletedAtUnixMs(),
		})
	}
	return out
}

func messageUpdatesFromProto(updates []*guestdesktoprelayv1.AgentActivityMessageUpdate) []agentsessionstore.WorkspaceAgentMessageUpdate {
	if len(updates) == 0 {
		return nil
	}
	out := make([]agentsessionstore.WorkspaceAgentMessageUpdate, 0, len(updates))
	for _, update := range updates {
		if update == nil {
			continue
		}
		out = append(out, agentsessionstore.WorkspaceAgentMessageUpdate{
			AgentSessionID:    strings.TrimSpace(update.GetAgentSessionId()),
			MessageID:         strings.TrimSpace(update.GetMessageId()),
			Seq:               update.GetSeq(),
			TurnID:            strings.TrimSpace(update.GetTurnId()),
			Role:              strings.TrimSpace(update.GetRole()),
			Kind:              strings.TrimSpace(update.GetKind()),
			Status:            strings.TrimSpace(update.GetStatus()),
			CallID:            strings.TrimSpace(update.GetCallId()),
			ParentCallID:      strings.TrimSpace(update.GetParentCallId()),
			RootCallID:        strings.TrimSpace(update.GetRootCallId()),
			Title:             strings.TrimSpace(update.GetTitle()),
			Payload:           structMap(update.GetPayload()),
			OccurredAtUnixMS:  update.GetOccurredAtUnixMs(),
			StartedAtUnixMS:   update.GetStartedAtUnixMs(),
			CompletedAtUnixMS: update.GetCompletedAtUnixMs(),
		})
	}
	return out
}

func statePatchFromProto(patch *guestdesktoprelayv1.AgentActivityStatePatch) agentsessionstore.WorkspaceAgentStatePatch {
	out := agentsessionstore.WorkspaceAgentStatePatch{
		AgentSessionID:    strings.TrimSpace(patch.GetAgentSessionId()),
		Provider:          strings.TrimSpace(patch.GetProvider()),
		ProviderSessionID: strings.TrimSpace(patch.GetProviderSessionId()),
		Model:             strings.TrimSpace(patch.GetModel()),
		CWD:               strings.TrimSpace(patch.GetCwd()),
		Title:             strings.TrimSpace(patch.GetTitle()),
		LifecycleStatus:   strings.TrimSpace(patch.GetLifecycleStatus()),
		CurrentPhase:      strings.TrimSpace(patch.GetCurrentPhase()),
		OccurredAtUnixMS:  patch.GetOccurredAtUnixMs(),
	}
	if turn := patch.GetTurn(); turn != nil {
		out.Turn = &agentsessionstore.WorkspaceAgentTurnPatch{
			TurnID:            strings.TrimSpace(turn.GetTurnId()),
			Phase:             strings.TrimSpace(turn.GetPhase()),
			Outcome:           strings.TrimSpace(turn.GetOutcome()),
			FileChanges:       structMap(turn.GetFileChanges()),
			StartedAtUnixMS:   turn.GetStartedAtUnixMs(),
			CompletedAtUnixMS: turn.GetCompletedAtUnixMs(),
		}
	}
	for _, entity := range patch.GetEntities() {
		if entity == nil {
			continue
		}
		out.Entities = append(out.Entities, agentsessionstore.WorkspaceAgentEntityPatch{
			CallID:            strings.TrimSpace(entity.GetCallId()),
			TurnID:            strings.TrimSpace(entity.GetTurnId()),
			CallType:          strings.TrimSpace(entity.GetCallType()),
			Name:              strings.TrimSpace(entity.GetName()),
			Status:            strings.TrimSpace(entity.GetStatus()),
			Input:             structMap(entity.GetInput()),
			Output:            structMap(entity.GetOutput()),
			Error:             structMap(entity.GetError()),
			StartedAtUnixMS:   entity.GetStartedAtUnixMs(),
			CompletedAtUnixMS: entity.GetCompletedAtUnixMs(),
		})
	}
	return out
}

func structMap(value interface{ AsMap() map[string]any }) map[string]any {
	if value == nil {
		return nil
	}
	out := value.AsMap()
	if len(out) == 0 {
		return nil
	}
	return out
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
