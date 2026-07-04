package hostquery

import (
	"context"
	"testing"

	agentsessionstore "github.com/tutti-os/tutti/packages/agent/daemon/activity"
	guestdesktoprelayv1 "github.com/tutti-os/tutti/packages/agent/daemon/internal/guestdesktoprelay/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func resolvedActivePeersContext(_ string) context.Context {
	return context.Background()
}

func TestActivePeersMarksSelfAndMapsWorkingSessions(t *testing.T) {
	client := &fakeAgentStateGetter{
		ok: true,
		state: agentsessionstore.State{
			Sessions: []agentsessionstore.WorkspaceAgentSession{
				{
					AgentSessionID:    "agent-self",
					Provider:          "codex",
					ProviderSessionID: "codex-session",
					CWD:               "/workspace/project",
					EffectiveStatus:   "working",
					TurnPhase:         "working",
					Title:             "codex work",
				},
				{
					AgentSessionID:    "agent-other",
					Provider:          "claude-code",
					ProviderSessionID: "claude-session",
					CWD:               "/workspace/project",
					EffectiveStatus:   "working",
					TurnPhase:         "working",
					Title:             "claude work",
				},
				{
					AgentSessionID:    "agent-done",
					Provider:          "claude-code",
					ProviderSessionID: "claude-done",
					EffectiveStatus:   "completed",
				},
			},
		},
	}
	service, err := New(Config{RoomID: "room-1", Client: client})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	reply, err := service.ActivePeers(resolvedActivePeersContext("room-1"), &guestdesktoprelayv1.ActivePeersRequest{
		Self: &guestdesktoprelayv1.AgentContextIdentity{
			Known:             true,
			Provider:          "codex",
			ProviderSessionId: "codex-session",
		},
	})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if client.roomID != "room-1" {
		t.Fatalf("GetAgentState room = %q, want room-1", client.roomID)
	}
	if len(reply.GetAgents()) != 2 {
		t.Fatalf("agents = %d, want 2: %#v", len(reply.GetAgents()), reply.GetAgents())
	}
	if got := reply.GetAgents()[0]; !got.GetIsSelfSet() || !got.GetIsSelf() || got.GetProvider() != "codex" || got.GetUserId() != "" {
		t.Fatalf("unexpected self agent: %#v", got)
	}
	if got := reply.GetAgents()[1]; !got.GetIsSelfSet() || got.GetIsSelf() || got.GetProvider() != "claude-code" || got.GetUserId() != "" {
		t.Fatalf("unexpected other agent: %#v", got)
	}
}

func TestActivePeersMapsContextBackedSessionsWithPresenceAttribution(t *testing.T) {
	client := &fakeAgentStateGetter{
		ok: true,
		state: agentsessionstore.State{
			Presences: []agentsessionstore.WorkspaceAgentPresence{
				{
					ID:       42,
					UserID:   "user-42",
					Provider: "codex",
				},
			},
			Sessions: []agentsessionstore.WorkspaceAgentSession{
				{
					AgentSessionID:    "agent-session-1",
					PresenceID:        42,
					ProviderSessionID: "codex-session-1",
					CWD:               "/workspace",
					Title:             "Implement feature",
					TurnPhase:         "started",
					EffectiveStatus:   "active",
					UpdatedAtUnixMS:   1710000002000,
				},
			},
		},
	}
	service, err := New(Config{RoomID: "room-1", Client: client})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	reply, err := service.ActivePeers(resolvedActivePeersContext("room-1"), &guestdesktoprelayv1.ActivePeersRequest{
		Self: &guestdesktoprelayv1.AgentContextIdentity{
			Known:             true,
			Provider:          "codex",
			ProviderSessionId: "codex-session-1",
		},
	})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if len(reply.GetAgents()) != 1 {
		t.Fatalf("agents = %d, want 1: %#v", len(reply.GetAgents()), reply.GetAgents())
	}
	agent := reply.GetAgents()[0]
	if agent.GetProvider() != "codex" ||
		agent.GetUserId() != "user-42" ||
		!agent.GetIsSelfSet() ||
		!agent.GetIsSelf() ||
		agent.GetUpdatedAtUnixMs() != 1710000002000 {
		t.Fatalf("agent = %#v, want context-backed self", agent)
	}
}

func TestActivePeersUsesConfiguredRoomWhenWorkspaceIDMissing(t *testing.T) {
	client := &fakeAgentStateGetter{ok: true}
	service, err := New(Config{RoomID: "room-1", Client: client})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}
	_, err = service.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if client.roomID != "room-1" {
		t.Fatalf("GetAgentState room = %q, want room-1", client.roomID)
	}
}

func TestActivePeersRejectsWorkspaceIDMismatch(t *testing.T) {
	client := &fakeAgentStateGetter{ok: true}
	service, err := New(Config{RoomID: "room-1", Client: client})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	_, err = service.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{WorkspaceId: "other-room"})
	if status.Code(err) != codes.PermissionDenied {
		t.Fatalf("ActivePeers() code = %v, want PermissionDenied (err=%v)", status.Code(err), err)
	}
	if client.roomID != "" {
		t.Fatalf("GetAgentState room = %q, want no call", client.roomID)
	}
}

func TestActivePeersUsesExplicitWorkspaceID(t *testing.T) {
	client := &fakeAgentStateGetter{ok: true}
	service, err := New(Config{RoomID: "room-from-request", Client: client})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	_, err = service.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{WorkspaceId: "room-from-request", Cwd: "/workspace/runtime-ws-1/project"})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if client.roomID != "room-from-request" {
		t.Fatalf("GetAgentState room = %q, want room-from-request", client.roomID)
	}
}

func TestDispatchActivePeersRoutesByWorkspaceID(t *testing.T) {
	dispatch := NewDispatchService()
	client := &fakeAgentStateGetter{ok: true}
	dispatch.RegisterWorkspace("runtime-ws-1", WorkspaceHandler{RoomID: "room-1", Client: client})

	_, err := dispatch.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{WorkspaceId: "runtime-ws-1", Cwd: "/workspace/runtime-ws-1"})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if client.roomID != "room-1" {
		t.Fatalf("GetAgentState room = %q, want room-1", client.roomID)
	}
}

func TestDispatchActivePeersRoutesByRoomID(t *testing.T) {
	dispatch := NewDispatchService()
	client := &fakeAgentStateGetter{ok: true}
	dispatch.RegisterWorkspace("runtime-ws-1", WorkspaceHandler{RoomID: "room-1", Client: client})

	_, err := dispatch.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{RoomId: "room-1", Cwd: "/workspace/runtime-ws-1"})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if client.roomID != "room-1" {
		t.Fatalf("GetAgentState room = %q, want room-1", client.roomID)
	}
}

func TestDispatchActivePeersPrefersRoomIDOverStaleWorkspaceID(t *testing.T) {
	dispatch := NewDispatchService()
	client := &fakeAgentStateGetter{ok: true}
	dispatch.RegisterWorkspace("runtime-ws-1", WorkspaceHandler{RoomID: "room-1", Client: client})
	dispatch.RegisterWorkspace("runtime-ws-2", WorkspaceHandler{RoomID: "room-2", Client: &fakeAgentStateGetter{ok: true}})

	_, err := dispatch.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{
		WorkspaceId: "runtime-ws-2",
		RoomId:      "room-1",
		Cwd:         "/workspace/runtime-ws-2",
	})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if client.roomID != "room-1" {
		t.Fatalf("GetAgentState room = %q, want room-1", client.roomID)
	}
}

func TestDispatchActivePeersRequiresWorkspaceID(t *testing.T) {
	dispatch := NewDispatchService()
	dispatch.RegisterWorkspace("runtime-ws-1", WorkspaceHandler{RoomID: "room-1", Client: &fakeAgentStateGetter{ok: true}})

	_, err := dispatch.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{})
	if status.Code(err) != codes.InvalidArgument {
		t.Fatalf("ActivePeers() code = %v, want InvalidArgument (err=%v)", status.Code(err), err)
	}
}

func TestDispatchActivePeersRejectsUnregisteredWorkspace(t *testing.T) {
	dispatch := NewDispatchService()
	client := &fakeAgentStateGetter{ok: true}
	dispatch.RegisterWorkspace("runtime-ws-1", WorkspaceHandler{RoomID: "handler-room", Client: client})
	_, err := dispatch.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{WorkspaceId: "missing-ws", Cwd: "/workspace/runtime-ws-1"})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("ActivePeers() code = %v, want NotFound (err=%v)", status.Code(err), err)
	}
	if client.roomID != "" {
		t.Fatalf("GetAgentState room = %q, want empty", client.roomID)
	}
}

func TestDispatchActivePeersRejectsUnknownRoomID(t *testing.T) {
	dispatch := NewDispatchService()
	dispatch.RegisterWorkspace("runtime-ws-1", WorkspaceHandler{RoomID: "room-1", Client: &fakeAgentStateGetter{ok: true}})

	_, err := dispatch.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{RoomId: "room-missing"})
	if status.Code(err) != codes.NotFound {
		t.Fatalf("ActivePeers() code = %v, want NotFound (err=%v)", status.Code(err), err)
	}
}

func TestActivePeersDistinguishesSameUserMultipleSessions(t *testing.T) {
	client := &fakeAgentStateGetter{
		ok: true,
		state: agentsessionstore.State{
			Sessions: []agentsessionstore.WorkspaceAgentSession{
				{
					AgentSessionID:    "agent-self",
					Provider:          "codex",
					ProviderSessionID: "codex-session-current",
					EffectiveStatus:   "working",
				},
				{
					AgentSessionID:    "agent-same-user-other-session",
					Provider:          "codex",
					ProviderSessionID: "codex-session-other",
					EffectiveStatus:   "working",
				},
				{
					AgentSessionID:    "agent-other-user",
					Provider:          "claude-code",
					ProviderSessionID: "claude-session",
					EffectiveStatus:   "working",
				},
				{
					AgentSessionID:    "agent-idle",
					Provider:          "claude-code",
					ProviderSessionID: "claude-idle",
					EffectiveStatus:   "idle",
				},
				{
					AgentSessionID:    "agent-completed",
					Provider:          "claude-code",
					ProviderSessionID: "claude-completed",
					EffectiveStatus:   "completed",
				},
			},
		},
	}
	service, err := New(Config{RoomID: "room-1", Client: client})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	reply, err := service.ActivePeers(resolvedActivePeersContext("room-1"), &guestdesktoprelayv1.ActivePeersRequest{
		Self: &guestdesktoprelayv1.AgentContextIdentity{
			Known:             true,
			Provider:          "codex",
			ProviderSessionId: "codex-session-current",
		},
	})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if len(reply.GetAgents()) != 3 {
		t.Fatalf("working agents = %d, want 3: %#v", len(reply.GetAgents()), reply.GetAgents())
	}

	byID := map[string]*guestdesktoprelayv1.ActivePeerAgent{}
	for _, agent := range reply.GetAgents() {
		byID[agent.GetAgentId()] = agent
	}
	if got := byID["agent-self"]; got == nil || !got.GetIsSelfSet() || !got.GetIsSelf() {
		t.Fatalf("self agent = %#v, want marked self", got)
	}
	if got := byID["agent-same-user-other-session"]; got == nil || !got.GetIsSelfSet() || got.GetIsSelf() || got.GetUserId() != "" {
		t.Fatalf("same-provider other session = %#v, want non-self empty user", got)
	}
	if got := byID["agent-other-user"]; got == nil || !got.GetIsSelfSet() || got.GetIsSelf() || got.GetUserId() != "" {
		t.Fatalf("other-provider agent = %#v, want non-self empty user", got)
	}
	if byID["agent-idle"] != nil || byID["agent-completed"] != nil {
		t.Fatalf("non-working agents leaked into response: %#v", byID)
	}
}

func TestActivePeersLeavesSelfMarkerUnsetWhenSelfUnknown(t *testing.T) {
	service, err := New(Config{
		RoomID: "room-1",
		Client: &fakeAgentStateGetter{
			ok: true,
			state: agentsessionstore.State{
				Sessions: []agentsessionstore.WorkspaceAgentSession{
					{AgentSessionID: "agent-1", Provider: "codex", ProviderSessionID: "codex-session", EffectiveStatus: "working"},
					{AgentSessionID: "agent-2", Provider: "claude-code", ProviderSessionID: "claude-session", EffectiveStatus: "working"},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	reply, err := service.ActivePeers(resolvedActivePeersContext("room-1"), &guestdesktoprelayv1.ActivePeersRequest{})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if len(reply.GetAgents()) != 2 {
		t.Fatalf("agents = %d, want 2", len(reply.GetAgents()))
	}
	for _, agent := range reply.GetAgents() {
		if agent.GetIsSelfSet() {
			t.Fatalf("agent should not have self marker when self is unknown: %#v", agent)
		}
	}
}

func TestActivePeersCollapsesDuplicateRuntimeSessionsAndPrefersNewest(t *testing.T) {
	service, err := New(Config{
		RoomID: "room-1",
		Client: &fakeAgentStateGetter{
			ok: true,
			state: agentsessionstore.State{
				Sessions: []agentsessionstore.WorkspaceAgentSession{
					{
						AgentSessionID:    "runtime-shadow",
						Provider:          "codex",
						ProviderSessionID: "provider-session-1",
						SessionOrigin:     agentsessionstore.WorkspaceAgentSessionOriginRuntime,
						EffectiveStatus:   "working",
						UpdatedAtUnixMS:   100,
						Title:             "old runtime row",
					},
					{
						AgentSessionID:    "runtime-current",
						Provider:          "codex",
						ProviderSessionID: "provider-session-1",
						SessionOrigin:     agentsessionstore.WorkspaceAgentSessionOriginRuntime,
						EffectiveStatus:   "working",
						UpdatedAtUnixMS:   200,
						Title:             "current runtime row",
					},
					{
						AgentSessionID:    "other-runtime",
						Provider:          "claude-code",
						ProviderSessionID: "provider-session-2",
						SessionOrigin:     agentsessionstore.WorkspaceAgentSessionOriginRuntime,
						EffectiveStatus:   "working",
						UpdatedAtUnixMS:   150,
					},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("New() error = %v", err)
	}

	reply, err := service.ActivePeers(context.Background(), &guestdesktoprelayv1.ActivePeersRequest{
		Self: &guestdesktoprelayv1.AgentContextIdentity{
			Known:             true,
			Provider:          "codex",
			ProviderSessionId: "provider-session-1",
		},
	})
	if err != nil {
		t.Fatalf("ActivePeers() error = %v", err)
	}
	if len(reply.GetAgents()) != 2 {
		t.Fatalf("agents = %d, want 2: %#v", len(reply.GetAgents()), reply.GetAgents())
	}
	if got := reply.GetAgents()[0]; got.GetAgentId() != "runtime-current" || !got.GetIsSelf() {
		t.Fatalf("first logical peer = %#v, want current runtime self row", got)
	}
	if got := reply.GetAgents()[1]; got.GetAgentId() != "other-runtime" {
		t.Fatalf("second logical peer = %#v, want unrelated runtime row", got)
	}
}

type fakeAgentStateGetter struct {
	roomID string
	state  agentsessionstore.State
	ok     bool
}

func (f *fakeAgentStateGetter) GetAgentState(roomID string) (agentsessionstore.State, bool) {
	f.roomID = roomID
	return f.state, f.ok
}
