import type { DesktopFeatureFlags } from "../../shared/preferences/index.ts";
import { resolveDesktopWorkspaceUiMode } from "../../shared/featureFlags/catalog.ts";

export type WorkspaceLaunchWindowKind = "agent" | "workspace";

export function resolveWorkspaceLaunchWindowKind(
  featureFlags: DesktopFeatureFlags
): WorkspaceLaunchWindowKind {
  return resolveDesktopWorkspaceUiMode(featureFlags) === "agent"
    ? "agent"
    : "workspace";
}
