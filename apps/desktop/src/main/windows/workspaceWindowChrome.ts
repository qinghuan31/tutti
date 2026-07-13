export type DesktopWorkspaceWindowKind = "agent" | "workspace";

export function resolveWorkspaceWindowFrame(
  platform: NodeJS.Platform,
  windowKind: DesktopWorkspaceWindowKind
): boolean | undefined {
  if (platform === "win32") {
    return false;
  }
  return windowKind === "agent" && platform === "darwin" ? false : undefined;
}
