import type { AgentActivityInteraction } from "@tutti-os/agent-activity-core";

export interface AgentGUIInteractionTarget {
  agentSessionId: string;
  turnId: string;
}

export function resolveAgentGUIInteractionTarget(
  interactions: readonly AgentActivityInteraction[],
  requestId: string
): AgentGUIInteractionTarget | null {
  const normalizedRequestId = requestId.trim();
  if (!normalizedRequestId) return null;
  for (let index = interactions.length - 1; index >= 0; index -= 1) {
    const interaction = interactions[index];
    if (interaction?.requestId.trim() !== normalizedRequestId) continue;
    const agentSessionId = interaction.agentSessionId.trim();
    const turnId = interaction.turnId.trim();
    if (!agentSessionId || !turnId) return null;
    return { agentSessionId, turnId };
  }
  return null;
}
