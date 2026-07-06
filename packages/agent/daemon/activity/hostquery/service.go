package hostquery

import (
	"context"
	"fmt"
	"strings"
	"sync"

	agentsessionstore "github.com/tutti-os/tutti/packages/agent/daemon/activity"
	guestdesktoprelayv1 "github.com/tutti-os/tutti/packages/agent/daemon/internal/guestdesktoprelay/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type AgentStateGetter interface {
	GetAgentState(roomID string) (agentsessionstore.State, bool)
}

type Config struct {
	RoomID string
	Client AgentStateGetter
}

type WorkspaceHandler struct {
	RoomID string
	Client AgentStateGetter
}

type DispatchService struct {
	guestdesktoprelayv1.UnimplementedAgentContextServiceServer

	mu              sync.RWMutex
	handlers        map[string]WorkspaceHandler
	roomToWorkspace map[string]string
}

type Service struct {
	guestdesktoprelayv1.UnimplementedAgentContextServiceServer

	roomID string
	client AgentStateGetter
}

type activePeerCandidate struct {
	session     agentsessionstore.WorkspaceAgentSession
	presence    agentsessionstore.WorkspaceAgentPresence
	hasPresence bool
	provider    string
	userID      string
}

func Register(grpcServer *grpc.Server, cfg Config) error {
	service, err := New(cfg)
	if err != nil {
		return err
	}
	guestdesktoprelayv1.RegisterAgentContextServiceServer(grpcServer, service)
	return nil
}

func NewDispatchService() *DispatchService {
	return &DispatchService{
		handlers:        make(map[string]WorkspaceHandler),
		roomToWorkspace: make(map[string]string),
	}
}

func RegisterDispatch(grpcServer *grpc.Server, dispatch *DispatchService) {
	guestdesktoprelayv1.RegisterAgentContextServiceServer(grpcServer, dispatch)
}

func (d *DispatchService) RegisterWorkspace(workspaceID string, handler WorkspaceHandler) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return
	}
	d.mu.Lock()
	if previous, ok := d.handlers[workspaceID]; ok {
		previousRoomID := strings.TrimSpace(previous.RoomID)
		if previousRoomID != "" && d.roomToWorkspace[previousRoomID] == workspaceID {
			delete(d.roomToWorkspace, previousRoomID)
		}
	}
	d.handlers[workspaceID] = handler
	if roomID := strings.TrimSpace(handler.RoomID); roomID != "" {
		d.roomToWorkspace[roomID] = workspaceID
	}
	d.mu.Unlock()
}

func (d *DispatchService) UnregisterWorkspace(workspaceID string) {
	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return
	}
	d.mu.Lock()
	if handler, ok := d.handlers[workspaceID]; ok {
		roomID := strings.TrimSpace(handler.RoomID)
		if roomID != "" && d.roomToWorkspace[roomID] == workspaceID {
			delete(d.roomToWorkspace, roomID)
		}
	}
	delete(d.handlers, workspaceID)
	d.mu.Unlock()
}

func (d *DispatchService) ActivePeers(ctx context.Context, req *guestdesktoprelayv1.ActivePeersRequest) (*guestdesktoprelayv1.ActivePeersResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	roomID := strings.TrimSpace(req.GetRoomId())
	workspaceID := strings.TrimSpace(req.GetWorkspaceId())
	if roomID == "" && workspaceID == "" {
		return nil, status.Error(codes.InvalidArgument, "workspace_id or room_id is required")
	}

	d.mu.RLock()
	resolvedWorkspaceID := workspaceID
	if roomID != "" {
		if mappedWorkspaceID, ok := d.roomToWorkspace[roomID]; ok {
			resolvedWorkspaceID = mappedWorkspaceID
		} else {
			d.mu.RUnlock()
			return nil, status.Errorf(codes.NotFound, "no handler registered for room %q", roomID)
		}
	}
	handler, ok := d.handlers[resolvedWorkspaceID]
	d.mu.RUnlock()
	if !ok {
		return nil, status.Errorf(codes.NotFound, "no handler registered for workspace %q", resolvedWorkspaceID)
	}
	service, err := New(Config(handler))
	if err != nil {
		return nil, status.Errorf(codes.FailedPrecondition, "agent context handler is invalid: %v", err)
	}
	handlerReq := *req
	handlerReq.RoomId = strings.TrimSpace(handler.RoomID)
	handlerReq.WorkspaceId = ""
	return service.ActivePeers(ctx, &handlerReq)
}

func New(cfg Config) (*Service, error) {
	roomID := strings.TrimSpace(cfg.RoomID)
	if cfg.Client == nil {
		return nil, fmt.Errorf("client is required")
	}
	return &Service{roomID: roomID, client: cfg.Client}, nil
}

func (s *Service) ActivePeers(_ context.Context, req *guestdesktoprelayv1.ActivePeersRequest) (*guestdesktoprelayv1.ActivePeersResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "request is required")
	}
	roomID := strings.TrimSpace(req.GetRoomId())
	if roomID == "" {
		roomID = strings.TrimSpace(req.GetWorkspaceId())
	}
	if roomID == "" {
		roomID = strings.TrimSpace(s.roomID)
	}
	if roomID == "" {
		return nil, status.Error(codes.InvalidArgument, "workspace_id or room_id is required")
	}
	if configuredRoomID := strings.TrimSpace(s.roomID); configuredRoomID != "" && roomID != configuredRoomID {
		return nil, status.Error(codes.PermissionDenied, "request room does not match service room")
	}
	state, ok := s.client.GetAgentState(roomID)
	if !ok {
		state = agentsessionstore.State{}
	}

	presenceByID := make(map[uint64]agentsessionstore.WorkspaceAgentPresence, len(state.Presences))
	for _, presence := range state.Presences {
		presenceByID[presence.ID] = presence
	}

	self := req.GetSelf()
	groupedCandidates := make(map[string]activePeerCandidate)
	orderedKeys := make([]string, 0)

	recordCandidate := func(candidate activePeerCandidate) {
		key := logicalActivePeerKey(candidate)
		current, ok := groupedCandidates[key]
		if !ok {
			groupedCandidates[key] = candidate
			orderedKeys = append(orderedKeys, key)
			return
		}
		if shouldPreferActivePeerCandidate(current, candidate, self) {
			groupedCandidates[key] = candidate
		}
	}

	var agents []*guestdesktoprelayv1.ActivePeerAgent
	for _, session := range state.Sessions {
		if !isWorkingSession(session) {
			continue
		}
		presence, hasPresence := presenceByID[session.PresenceID]
		provider := strings.TrimSpace(session.Provider)
		if provider == "" && hasPresence {
			provider = strings.TrimSpace(presence.Provider)
		}
		userID := ""
		if hasPresence {
			userID = strings.TrimSpace(presence.UserID)
		}
		recordCandidate(activePeerCandidate{
			session:     session,
			presence:    presence,
			hasPresence: hasPresence,
			provider:    provider,
			userID:      userID,
		})
	}
	for _, key := range orderedKeys {
		candidate := groupedCandidates[key]
		session := candidate.session
		wire := &guestdesktoprelayv1.ActivePeerAgent{
			AgentId:           strings.TrimSpace(session.AgentSessionID),
			UserId:            candidate.userID,
			Provider:          candidate.provider,
			ProviderSessionId: strings.TrimSpace(session.ProviderSessionID),
			EffectiveStatus:   strings.TrimSpace(session.EffectiveStatus),
			WorkPhase:         strings.TrimSpace(session.TurnPhase),
			Title:             strings.TrimSpace(session.Title),
			Cwd:               strings.TrimSpace(session.CWD),
			UpdatedAtUnixMs:   session.UpdatedAtUnixMS,
		}
		if self != nil && self.GetKnown() && strings.TrimSpace(self.GetProviderSessionId()) != "" {
			wire.IsSelfSet = true
			selfProvider := strings.TrimSpace(self.GetProvider())
			sameProvider := wire.Provider == "" || selfProvider == "" || wire.Provider == selfProvider
			wire.IsSelf = sameProvider && wire.ProviderSessionId == strings.TrimSpace(self.GetProviderSessionId())
		}
		agents = append(agents, wire)
	}
	return &guestdesktoprelayv1.ActivePeersResponse{Agents: agents}, nil
}

func isWorkingSession(session agentsessionstore.WorkspaceAgentSession) bool {
	switch strings.TrimSpace(session.EffectiveStatus) {
	case "working", "active":
		return true
	default:
		return false
	}
}

func logicalActivePeerKey(candidate activePeerCandidate) string {
	provider := strings.TrimSpace(candidate.provider)
	providerSessionID := strings.TrimSpace(candidate.session.ProviderSessionID)
	if providerSessionID != "" {
		return provider + "\x00" + providerSessionID
	}
	return strings.TrimSpace(candidate.session.AgentSessionID)
}

func shouldPreferActivePeerCandidate(
	current, next activePeerCandidate,
	self *guestdesktoprelayv1.AgentContextIdentity,
) bool {
	currentOriginRank := activePeerOriginRank(current.session.SessionOrigin)
	nextOriginRank := activePeerOriginRank(next.session.SessionOrigin)
	if currentOriginRank != nextOriginRank {
		return nextOriginRank > currentOriginRank
	}
	currentIsSelf := activePeerCandidateMatchesSelf(current, self)
	nextIsSelf := activePeerCandidateMatchesSelf(next, self)
	if currentIsSelf != nextIsSelf {
		return nextIsSelf
	}
	if current.session.UpdatedAtUnixMS != next.session.UpdatedAtUnixMS {
		return next.session.UpdatedAtUnixMS > current.session.UpdatedAtUnixMS
	}
	if strings.TrimSpace(current.session.AgentSessionID) == "" && strings.TrimSpace(next.session.AgentSessionID) != "" {
		return true
	}
	if strings.TrimSpace(current.userID) == "" && strings.TrimSpace(next.userID) != "" {
		return true
	}
	if strings.TrimSpace(current.provider) == "" && strings.TrimSpace(next.provider) != "" {
		return true
	}
	return false
}

func activePeerOriginRank(origin string) int {
	switch agentsessionstore.NormalizeSessionOrigin(origin) {
	case agentsessionstore.WorkspaceAgentSessionOriginRuntime:
		return 1
	default:
		return 0
	}
}

func activePeerCandidateMatchesSelf(
	candidate activePeerCandidate,
	self *guestdesktoprelayv1.AgentContextIdentity,
) bool {
	if self == nil || !self.GetKnown() {
		return false
	}
	selfProviderSessionID := strings.TrimSpace(self.GetProviderSessionId())
	if selfProviderSessionID == "" || strings.TrimSpace(candidate.session.ProviderSessionID) != selfProviderSessionID {
		return false
	}
	selfProvider := strings.TrimSpace(self.GetProvider())
	return selfProvider == "" || strings.TrimSpace(candidate.provider) == "" || strings.TrimSpace(candidate.provider) == selfProvider
}
