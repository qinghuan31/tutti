import type { AgentActivitySession } from "@tutti-os/agent-activity-core";
import type { AgentGUIAgent } from "@tutti-os/agent-gui";
import { resolveAgentGuiSessionProviderIconUrl } from "@tutti-os/agent-gui/agentGuiSessionProviderIconUrls";
import { resolveAgentGuiWorkbenchHeaderTitle } from "@tutti-os/agent-gui/workbench";
import type { DesktopAgentGUIProvider } from "@renderer/features/workspace-agent/desktopAgentGUINodeState.ts";
import { resolveDesktopAgentGUIProviderForAgentTarget } from "@renderer/features/workspace-agent/ui/desktopAgentGUIWorkbenchStateHelpers.ts";

export function resolveStandaloneAgentHeaderIdentity(input: {
  agentTargetId?: string | null;
  agents: readonly AgentGUIAgent[];
  fallbackProvider: DesktopAgentGUIProvider;
  lastActiveAgentSessionId?: string | null;
  sessions: readonly AgentActivitySession[];
}): {
  agentTitle: string | null;
  conversationIconFallbackUrl: string | null;
  conversationIconUrl: string | null;
  conversationTitle: string | null;
  provider: DesktopAgentGUIProvider;
} {
  const agentTargetId = input.agentTargetId?.trim() || null;
  const provider = resolveDesktopAgentGUIProviderForAgentTarget(
    agentTargetId,
    input.agents,
    input.fallbackProvider
  );
  if (!input.lastActiveAgentSessionId?.trim()) {
    return {
      agentTitle: null,
      conversationIconFallbackUrl: null,
      conversationIconUrl: null,
      conversationTitle: null,
      provider
    };
  }
  const agent = agentTargetId
    ? (input.agents.find(
        (candidate) => candidate.agentTargetId === agentTargetId
      ) ?? null)
    : null;
  const conversationIconFallbackUrl =
    resolveAgentGuiSessionProviderIconUrl(provider);
  const conversationTitle =
    input.sessions.find(
      (session) => session.agentSessionId === input.lastActiveAgentSessionId
    )?.title ?? null;

  return {
    agentTitle: resolveAgentGuiWorkbenchHeaderTitle({
      agentName: agent?.name,
      conversationTitle,
      provider
    }),
    conversationIconFallbackUrl,
    conversationIconUrl: agent?.iconUrl ?? conversationIconFallbackUrl,
    conversationTitle,
    provider
  };
}
