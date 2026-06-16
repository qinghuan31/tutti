export {
  agentGuiWorkbenchDockEntryId as workspaceAgentGuiDockEntryId,
  agentGuiWorkbenchInstanceId as workspaceAgentGuiInstanceId,
  agentGuiWorkbenchProviderFromIdentifier as workspaceAgentGuiProviderFromIdentifier,
  agentGuiWorkbenchProviderFromLaunchRequest as workspaceAgentGuiProviderFromLaunchRequest,
  agentGuiWorkbenchTypeId as workspaceAgentGuiNodeID,
  createAgentGuiWorkbenchDraftLaunchRequest as createWorkspaceAgentGuiDraftLaunchRequest,
  createAgentGuiWorkbenchInstanceId as createWorkspaceAgentGuiInstanceId,
  createAgentGuiWorkbenchLaunchDescriptor as createWorkspaceAgentGuiLaunchDescriptor,
  createAgentGuiWorkbenchSessionLaunchRequest as createWorkspaceAgentGuiSessionLaunchRequest
} from "@tutti-os/agent-gui/workbench/launch";

export { normalizeAgentGuiWorkbenchProvider as normalizeWorkspaceAgentGuiProvider } from "@tutti-os/agent-gui/workbench/providerCatalog";

export type { AgentGuiWorkbenchLaunchDescriptor as WorkspaceAgentGuiLaunchDescriptor } from "@tutti-os/agent-gui/workbench/launch";

export type { AgentGuiWorkbenchProvider as WorkspaceAgentGuiProvider } from "@tutti-os/agent-gui/workbench/types";
