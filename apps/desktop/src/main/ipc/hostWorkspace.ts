import { desktopIpcChannels } from "../../shared/contracts/ipc";
import type {
  DesktopHostReplaceWorkspaceWindowInput,
  DesktopWorkspaceAppPayload
} from "../../shared/contracts/ipc";
import { createWorkspaceHostAccess } from "../host/workspaceHostAccess.ts";
import type { WorkspaceLaunch } from "../host/workspaceLaunch";
import { registerDesktopIpcHandler } from "./handle";
import { resolveOwnerWindowFromEvent } from "./ownerWindow";

export interface HostWorkspaceIpcDependencies {
  openWorkspaceAppFolder?: (
    payload: DesktopWorkspaceAppPayload
  ) => Promise<void>;
  workspaceLaunch: Pick<
    WorkspaceLaunch,
    "replaceWorkspaceWindow" | "showWorkspace"
  >;
}

export function registerHostWorkspaceIpc(
  deps: HostWorkspaceIpcDependencies
): void {
  const hostAccess = createWorkspaceHostAccess({
    openWorkspaceAppFolder: deps.openWorkspaceAppFolder,
    workspaceLaunch: deps.workspaceLaunch
  });

  registerDesktopIpcHandler(
    desktopIpcChannels.host.workspace.openWorkspaceAppFolder,
    (_event, payload: DesktopWorkspaceAppPayload) =>
      hostAccess.openWorkspaceAppFolder(payload)
  );
  registerDesktopIpcHandler(
    desktopIpcChannels.host.workspace.replaceWorkspaceWindow,
    (event, input: DesktopHostReplaceWorkspaceWindowInput) =>
      deps.workspaceLaunch.replaceWorkspaceWindow(
        resolveOwnerWindowFromEvent(event),
        normalizeWorkspaceID(input.workspaceId),
        normalizeWindowKind(input.mode)
      )
  );
  registerDesktopIpcHandler(
    desktopIpcChannels.host.workspace.showWorkspace,
    (event, workspaceID: string) =>
      hostAccess.showWorkspace(resolveOwnerWindowFromEvent(event), workspaceID)
  );
}

function normalizeWorkspaceID(workspaceID: string): string {
  const normalizedWorkspaceID = workspaceID.trim();
  if (!normalizedWorkspaceID) {
    throw new Error("workspaceId is required to replace the workspace window");
  }
  return normalizedWorkspaceID;
}

function normalizeWindowKind(mode: string): "agent" | "workspace" {
  if (mode === "agent") {
    return "agent";
  }
  if (mode === "os") {
    return "workspace";
  }
  throw new Error(
    "mode must be agent or os when replacing the workspace window"
  );
}
