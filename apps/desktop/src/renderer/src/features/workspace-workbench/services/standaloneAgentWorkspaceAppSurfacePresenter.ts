import type { WorkspaceAppCenterViewState } from "@tutti-os/workspace-app-center";
import type { WorkspaceAppSurfacePresenter } from "../../workspace-app-center/services/workspaceAppSurfaceHost.interface.ts";

export function createStandaloneAgentWorkspaceAppSurfacePresenter(input: {
  ensureWorkspaceAppPolling(): void;
  getViewState(workspaceId: string): WorkspaceAppCenterViewState;
  setViewState(request: {
    state: Partial<WorkspaceAppCenterViewState>;
    workspaceId: string;
  }): void;
  workspaceId: string;
}): WorkspaceAppSurfacePresenter {
  let activeAttemptId: number | null = null;
  return {
    beginOpen(attempt) {
      if (attempt.workspaceId !== input.workspaceId) {
        return;
      }
      activeAttemptId = attempt.attemptId;
      input.ensureWorkspaceAppPolling();
      input.setViewState({
        state: { openAppId: attempt.appId },
        workspaceId: input.workspaceId
      });
    },
    close(request) {
      if (
        request.workspaceId === input.workspaceId &&
        input.getViewState(input.workspaceId).openAppId === request.appId
      ) {
        input.setViewState({
          state: { openAppId: null },
          workspaceId: input.workspaceId
        });
      }
    },
    isOpen(request) {
      return (
        request.workspaceId === input.workspaceId &&
        input.getViewState(input.workspaceId).openAppId === request.appId
      );
    },
    presentPrepared(request) {
      if (
        request.workspaceId !== input.workspaceId ||
        activeAttemptId !== request.attempt.attemptId ||
        input.getViewState(input.workspaceId).openAppId !== request.appId
      ) {
        return false;
      }
      activeAttemptId = null;
      return true;
    },
    rollbackOpen(attempt) {
      if (
        attempt.workspaceId !== input.workspaceId ||
        activeAttemptId !== attempt.attemptId ||
        input.getViewState(input.workspaceId).openAppId !== attempt.appId
      ) {
        return;
      }
      activeAttemptId = null;
      input.setViewState({
        state: { openAppId: null },
        workspaceId: input.workspaceId
      });
    }
  };
}
