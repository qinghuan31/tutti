import type { WorkspaceAppCenterAppTab } from "@tutti-os/workspace-app-center";

export function shouldLoadWorkspaceAppFactoryDependencies(
  activeAppTab: WorkspaceAppCenterAppTab
): boolean {
  return activeAppTab === "my";
}
