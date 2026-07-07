import claudeCodeFlatFilledIconUrl from "./app/renderer/assets/icons/agents/claudecode-flat-filled.svg";
import codexFlatFilledIconUrl from "./app/renderer/assets/icons/agents/codex-flat-filled.svg";
import cursorFlatFilledIconUrl from "./app/renderer/assets/icons/agents/cursor-flat-filled.svg";
import { cursorColorfulUrl } from "./managedAgentIconAssets";
import { normalizeManagedAgentProvider } from "./shared/managedAgentProviders";

export {
  claudeCodeFlatFilledIconUrl,
  codexFlatFilledIconUrl,
  cursorColorfulUrl,
  cursorFlatFilledIconUrl
};

export function resolveAgentGuiSessionProviderIconUrl(
  provider: string | undefined
): string | null {
  switch (normalizeManagedAgentProvider(provider)) {
    case "claude-code":
      return claudeCodeFlatFilledIconUrl;
    case "codex":
      return codexFlatFilledIconUrl;
    case "cursor":
      return cursorColorfulUrl;
    default:
      return null;
  }
}
