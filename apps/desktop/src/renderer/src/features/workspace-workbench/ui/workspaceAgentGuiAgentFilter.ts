import type { AgentGUIAgent } from "@tutti-os/agent-gui";

export function filterWorkspaceAgentGuiAgents(
  agents: readonly AgentGUIAgent[],
  input: { tuttiAgentSwitchEnabled: boolean }
): readonly AgentGUIAgent[] {
  if (input.tuttiAgentSwitchEnabled) {
    return agents;
  }
  return agents.filter((agent) => agent.provider !== "tutti-agent");
}
