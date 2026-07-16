import type { WorkbenchHostHandle } from "@tutti-os/workbench-surface";
import type { WorkspaceAppSurfacePresenter } from "../../workspace-app-center/services/workspaceAppSurfaceHost.interface.ts";
import {
  workspaceAppWebviewInstanceId,
  workspaceAppWebviewTypeID
} from "../../workspace-app-center/services/workspaceAppCenterLaunchIds.ts";
import { workspaceOnboardingAppId } from "./workspaceOnboarding.ts";

export function createWorkbenchWorkspaceAppSurfacePresenter(input: {
  host: WorkbenchHostHandle;
  workspaceId: string;
}): WorkspaceAppSurfacePresenter {
  return {
    beginOpen() {},
    close(request) {
      if (request.workspaceId !== input.workspaceId) {
        return;
      }
      closeWorkspaceAppWebviews(input.host, request.appId);
    },
    isOpen(request) {
      return (
        request.workspaceId === input.workspaceId &&
        isWorkspaceAppWebviewOpen(input.host, request.appId)
      );
    },
    async presentPrepared(request) {
      if (request.workspaceId !== input.workspaceId) {
        return false;
      }
      return (
        (await input.host.launchNode({
          payload: {
            appId: request.appId,
            ...(request.intent ? { intent: request.intent } : {}),
            prepared: request.prepared,
            prevStatus: request.prevStatus
          },
          reason: "host",
          typeId: workspaceAppWebviewTypeID,
          ...(request.appId === workspaceOnboardingAppId
            ? { launchSource: "onboarding-auto" }
            : {})
        })) !== null
      );
    },
    rollbackOpen() {}
  };
}

function closeWorkspaceAppWebviews(
  host: WorkbenchHostHandle,
  appId: string
): void {
  const instanceId = workspaceAppWebviewInstanceId(appId);
  for (const node of host.getSnapshot().nodes) {
    if (
      node.data.typeId === workspaceAppWebviewTypeID &&
      node.data.instanceId === instanceId
    ) {
      host.closeNode(node.id);
    }
  }
}

function isWorkspaceAppWebviewOpen(
  host: WorkbenchHostHandle,
  appId: string
): boolean {
  const instanceId = workspaceAppWebviewInstanceId(appId);
  return host
    .getSnapshot()
    .nodes.some(
      (node) =>
        node.data.typeId === workspaceAppWebviewTypeID &&
        node.data.instanceId === instanceId
    );
}
