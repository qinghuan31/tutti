import { normalizeAgentGuiWorkbenchProvider } from "@tutti-os/agent-gui/workbench/providerCatalog";
import type { AgentGuiWorkbenchProvider } from "@tutti-os/agent-gui/workbench/types";

export function resolveWorkspaceAgentChatProvider(input: {
  defaultProvider?: string | null;
  requestedProvider?: string | null;
}): AgentGuiWorkbenchProvider {
  return normalizeAgentGuiWorkbenchProvider(
    input.requestedProvider ?? input.defaultProvider
  );
}
