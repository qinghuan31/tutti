import type { AgentHostInputApi } from "@tutti-os/agent-gui";
import { type DesktopAgentGUIProvider } from "../../desktopAgentGUINodeState.ts";
import {
  agentHostWorkspaceSessionFromCore,
  agentMessageFromCore,
  cloneAgentMessage,
  type AgentHostWorkspaceAgentMessage
} from "./desktopAgentHostProjection.ts";
import {
  forgetHiddenAgentSession,
  isHiddenAgentSession,
  type DesktopAgentHostWorkspaceState
} from "./desktopAgentHostWorkspaceState.ts";
import type { IWorkspaceAgentActivityService } from "../workspaceAgentActivityService.interface.ts";

interface CreateDesktopAgentHostWorkspaceAgentsApiInput {
  agentActivityService: IWorkspaceAgentActivityService;
  workspaceId: string;
  workspaceState: DesktopAgentHostWorkspaceState;
}

const desktopAgentGUIPresenceProviders = [
  "claude-code",
  "codex",
  "cursor",
  "nexight",
  "gemini",
  "hermes",
  "openclaw"
] as const satisfies readonly DesktopAgentGUIProvider[];

export function createDesktopAgentHostWorkspaceAgentsApi({
  agentActivityService,
  workspaceId,
  workspaceState
}: CreateDesktopAgentHostWorkspaceAgentsApiInput): NonNullable<
  AgentHostInputApi["workspaceAgents"]
> {
  return {
    deleteSession: async (payload) => {
      const agentSessionId = payload.agentSessionId.trim();
      if (!agentSessionId) {
        return { removed: false };
      }
      const result = await agentActivityService.deleteSession({
        workspaceId,
        agentSessionId
      });
      forgetHiddenAgentSession(workspaceState, agentSessionId);
      return result;
    },
    getSessionSummary: (payload) =>
      Promise.resolve({
        agentSessionId: payload.agentSessionId,
        recentAgentReplies: [],
        recentTurns: []
      }),
    list: async (_payload) => {
      const activitySnapshot = await agentActivityService.load(workspaceId);
      const visibleSessions = activitySnapshot.sessions.filter(
        (session) =>
          session.visible !== false &&
          !isHiddenAgentSession(workspaceState, session)
      );
      return {
        presences: desktopAgentGUIPresenceProviders.map((provider, index) => ({
          id: index + 1,
          provider,
          workspaceId,
          status: "active",
          userId: "local"
        })),
        sessionMessagesById: cachedSessionMessagesById(),
        sessions: visibleSessions.map((session, index) =>
          agentHostWorkspaceSessionFromCore(workspaceId, session, index + 1)
        )
      };
    },
    listSessionMessages: async (payload) => {
      const afterVersion = payload.afterVersion ?? 0;
      const limit =
        typeof payload.limit === "number" && payload.limit > 0
          ? payload.limit
          : undefined;

      const response = await agentActivityService.listSessionMessages({
        workspaceId,
        agentSessionId: payload.agentSessionId,
        afterVersion,
        beforeVersion: payload.beforeVersion,
        order: payload.order,
        limit
      });
      const fetchedMessages = response.messages.map(agentMessageFromCore);
      return {
        hasMore: response.hasMore,
        latestVersion: response.latestVersion,
        messages: fetchedMessages.map(cloneAgentMessage)
      };
    }
  } satisfies NonNullable<AgentHostInputApi["workspaceAgents"]>;

  function cachedSessionMessagesById(): Record<
    string,
    AgentHostWorkspaceAgentMessage[]
  > {
    const result: Record<string, AgentHostWorkspaceAgentMessage[]> = {};
    const snapshot = agentActivityService.getSnapshot(workspaceId);
    for (const [agentSessionId, messages] of Object.entries(
      snapshot.sessionMessagesById
    )) {
      result[agentSessionId] = messages.map((message) =>
        cloneAgentMessage(agentMessageFromCore(message))
      );
    }
    return result;
  }
}
