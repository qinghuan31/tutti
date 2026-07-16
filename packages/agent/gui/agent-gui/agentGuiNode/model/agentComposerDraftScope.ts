/** Shared home-composer draft scope. Project selection does not partition this. */
export const AGENT_COMPOSER_HOME_DRAFT_SCOPE = "home";

export function normalizeAgentComposerDraftProjectPath(
  value: string | null | undefined
): string | null {
  const slashed = value?.trim().replaceAll("\\", "/") ?? "";
  const normalized = /^\/+$/u.test(slashed)
    ? "/"
    : /^[A-Za-z]:\/+$/u.test(slashed)
      ? `${slashed.slice(0, 2)}/`
      : slashed.replace(/\/+$/, "");
  return normalized ? normalized : null;
}

export function resolveAgentComposerDraftScopeKey(input: {
  agentSessionId?: string | null;
  /**
   * Retained for call-site compatibility. Home drafts ignore project identity;
   * only an active session partitions composer draft content.
   */
  projectPath?: string | null;
}): string {
  const agentSessionId = input.agentSessionId?.trim() ?? "";
  if (agentSessionId) {
    return `session:${agentSessionId}`;
  }
  return AGENT_COMPOSER_HOME_DRAFT_SCOPE;
}
