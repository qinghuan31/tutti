import {
  tuttiAgentAssetUrls,
  tuttiIssueAssetUrls
} from "./tuttiAssetProtocol.ts";

const DESKTOP_WORKSPACE_APP_DEFAULT_ICON_URLS = {
  "agent-claude-code": tuttiAgentAssetUrls.claudeCode,
  "agent-codex": tuttiAgentAssetUrls.codex,
  "agent-tutti-agent": tuttiAgentAssetUrls.tuttiAgent,
  "issue-manager": tuttiIssueAssetUrls.default
} as const;

export const SEEDED_DESKTOP_WORKSPACE_APP_ICON_IDS = [
  "agent-codex",
  "agent-claude-code",
  "agent-tutti-agent"
] as const;

export function resolveDesktopWorkspaceAppDefaultIconUrl(
  appId: string
): string | null {
  const normalizedAppId = appId.trim();
  return (
    DESKTOP_WORKSPACE_APP_DEFAULT_ICON_URLS[
      normalizedAppId as keyof typeof DESKTOP_WORKSPACE_APP_DEFAULT_ICON_URLS
    ] ?? null
  );
}
