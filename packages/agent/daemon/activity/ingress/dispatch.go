package ingress

import (
	"context"
	"strings"
	"sync"

	agentsessionstore "github.com/tutti-os/tutti/packages/agent/daemon/activity"
	guestdesktoprelayv1 "github.com/tutti-os/tutti/packages/agent/daemon/internal/guestdesktoprelay/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// WorkspaceHandler handles events for a single workspace on the
// multi-workspace DispatchService.
type WorkspaceHandler struct {
	RoomID   string
	Reporter Reporter
}

type ActivityObserver func(workspaceID string)

// DispatchService is a multi-workspace variant of the ingress service.
// It maintains a registry of workspace handlers and routes incoming
// requests to the correct handler based on the explicit workspace_id.
type DispatchService struct {
	guestdesktoprelayv1.UnimplementedAgentActivityIngressServiceServer

	mu               sync.RWMutex
	handlers         map[string]WorkspaceHandler // workspace_id → handler
	activityObserver ActivityObserver
}

// NewDispatchService creates a DispatchService.
func NewDispatchService() *DispatchService {
	return &DispatchService{
		handlers: make(map[string]WorkspaceHandler),
	}
}

// RegisterWorkspace adds a handler for the given workspace.
func (d *DispatchService) RegisterWorkspace(workspaceID string, handler WorkspaceHandler) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return
	}
	d.mu.Lock()
	d.handlers[workspaceID] = handler
	d.mu.Unlock()
}

// UnregisterWorkspace removes the handler for the given workspace.
func (d *DispatchService) UnregisterWorkspace(workspaceID string) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return
	}
	d.mu.Lock()
	delete(d.handlers, workspaceID)
	d.mu.Unlock()
}

func (d *DispatchService) SetActivityObserver(fn ActivityObserver) {
	d.mu.Lock()
	d.activityObserver = fn
	d.mu.Unlock()
}

func (d *DispatchService) ReportActivity(ctx context.Context, req *guestdesktoprelayv1.ReportAgentActivityRequest) (*guestdesktoprelayv1.ReportAgentActivityResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	workspaceID, roomID, handler, err := d.resolveHandler(req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	if reportRequestIndicatesAgentWork(req) {
		d.notifyActivity(workspaceID)
	}
	source, err := eventSourceFromProto(req.GetSource())
	if err != nil {
		return nil, err
	}

	reply, err := agentsessionstore.ReportActivityAsSessionUpdates(ctx, handler.Reporter, agentsessionstore.ReportActivityInput{
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

func (d *DispatchService) ReportSessionState(ctx context.Context, req *guestdesktoprelayv1.ReportAgentSessionStateRequest) (*guestdesktoprelayv1.ReportAgentSessionStateResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	workspaceID, roomID, handler, err := d.resolveHandler(req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	agentSessionID := strings.TrimSpace(req.GetAgentSessionId())
	if agentSessionID == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_session_id is required")
	}
	d.notifyActivity(workspaceID)

	sessionOrigin, err := serverSessionOriginFromProto(req.GetSessionOrigin())
	if err != nil {
		return nil, err
	}
	source, err := eventSourceFromProto(req.GetSource())
	if err != nil {
		return nil, err
	}
	reply, err := handler.Reporter.ReportSessionState(ctx, agentsessionstore.ReportSessionStateInput{
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

func (d *DispatchService) ReportSessionMessages(ctx context.Context, req *guestdesktoprelayv1.ReportAgentSessionMessagesRequest) (*guestdesktoprelayv1.ReportAgentSessionMessagesResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	workspaceID, roomID, handler, err := d.resolveHandler(req.GetWorkspaceId())
	if err != nil {
		return nil, err
	}
	agentSessionID := strings.TrimSpace(req.GetAgentSessionId())
	if agentSessionID == "" {
		return nil, status.Error(codes.InvalidArgument, "agent_session_id is required")
	}
	d.notifyActivity(workspaceID)

	sessionOrigin, err := serverSessionOriginFromProto(req.GetSessionOrigin())
	if err != nil {
		return nil, err
	}
	source, err := eventSourceFromProto(req.GetSource())
	if err != nil {
		return nil, err
	}
	reply, err := handler.Reporter.ReportSessionMessages(ctx, agentsessionstore.ReportSessionMessagesInput{
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

func (d *DispatchService) resolveHandler(workspaceID string) (string, string, WorkspaceHandler, error) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return "", "", WorkspaceHandler{}, status.Error(codes.InvalidArgument, "workspace_id is required")
	}

	d.mu.RLock()
	handler, ok := d.handlers[workspaceID]
	d.mu.RUnlock()
	if !ok {
		return "", "", WorkspaceHandler{}, status.Errorf(codes.NotFound, "no handler registered for workspace %q", workspaceID)
	}
	roomID := strings.TrimSpace(handler.RoomID)
	if roomID == "" {
		return "", "", WorkspaceHandler{}, status.Error(codes.FailedPrecondition, "workspace handler missing room")
	}
	if handler.Reporter == nil {
		return "", "", WorkspaceHandler{}, status.Error(codes.FailedPrecondition, "workspace handler missing reporter")
	}
	return workspaceID, roomID, handler, nil
}

func (d *DispatchService) notifyActivity(workspaceID string) {
	d.mu.RLock()
	observer := d.activityObserver
	d.mu.RUnlock()
	if observer != nil {
		observer(workspaceID)
	}
}

// RegisterDispatch registers a DispatchService on a gRPC server.
func RegisterDispatch(srv *grpc.Server, dispatch *DispatchService) {
	guestdesktoprelayv1.RegisterAgentActivityIngressServiceServer(srv, dispatch)
}

func reportRequestIndicatesAgentWork(req *guestdesktoprelayv1.ReportAgentActivityRequest) bool {
	if req == nil {
		return false
	}
	for _, patch := range req.GetStatePatches() {
		if patch == nil {
			continue
		}
		if activePhase(patch.GetCurrentPhase()) {
			return true
		}
		if turn := patch.GetTurn(); turn != nil && activePhase(turn.GetPhase()) {
			return true
		}
		for _, entity := range patch.GetEntities() {
			if entity == nil {
				continue
			}
			if strings.TrimSpace(entity.GetCallId()) != "" ||
				strings.TrimSpace(entity.GetName()) != "" ||
				strings.TrimSpace(entity.GetStatus()) != "" ||
				entity.GetStartedAtUnixMs() != 0 ||
				entity.GetCompletedAtUnixMs() != 0 {
				return true
			}
		}
	}
	return false
}

func activePhase(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "", "idle":
		return false
	default:
		return true
	}
}
