export interface AgentGUIConversationTitleOverride {
  workspaceId: string;
  id: string;
  title: string;
  updatedAtUnixMs: number;
}

type AgentGUIConversationTitleOverrideListener = (
  override: AgentGUIConversationTitleOverride
) => void;

const listeners = new Set<AgentGUIConversationTitleOverrideListener>();

export function publishAgentGUIConversationTitleOverride(
  override: AgentGUIConversationTitleOverride
): void {
  const workspaceId = override.workspaceId.trim();
  const id = override.id.trim();
  const title = override.title.trim();
  if (!workspaceId || !id || !title) {
    return;
  }
  const normalized = {
    workspaceId,
    id,
    title,
    updatedAtUnixMs: override.updatedAtUnixMs
  };
  for (const listener of listeners) {
    listener(normalized);
  }
}

export function subscribeAgentGUIConversationTitleOverrides(
  listener: AgentGUIConversationTitleOverrideListener
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
