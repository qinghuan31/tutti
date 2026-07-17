import { createDecorator } from "@tutti-os/infra/di";
import type { WorkspaceAppCenterApp } from "@tutti-os/workspace-app-center";
import type { TuttiExternalWorkspaceOpenRouteIntent } from "@tutti-os/workspace-external-core/contracts";

export interface WorkspaceAppOpenAttempt {
  readonly appId: string;
  readonly attemptId: number;
  readonly workspaceId: string;
}

export interface WorkspaceAppSurfacePreparedOpenInput {
  readonly appId: string;
  readonly attempt: WorkspaceAppOpenAttempt;
  readonly intent?: TuttiExternalWorkspaceOpenRouteIntent;
  readonly prepared: true;
  readonly prevStatus?: WorkspaceAppCenterApp["runtimeStatus"];
  readonly workspaceId: string;
}

export interface WorkspaceAppSurfacePresenter {
  beginOpen(attempt: WorkspaceAppOpenAttempt): void;
  close(input: { appId: string; workspaceId: string }): void;
  isOpen(input: { appId: string; workspaceId: string }): boolean;
  presentPrepared(
    input: WorkspaceAppSurfacePreparedOpenInput
  ): Promise<boolean> | boolean;
  rollbackOpen(attempt: WorkspaceAppOpenAttempt): void;
}

export interface IWorkspaceAppSurfaceHost {
  readonly _serviceBrand: undefined;
  beginOpen(input: {
    appId: string;
    workspaceId: string;
  }): WorkspaceAppOpenAttempt;
  close(input: { appId: string; workspaceId: string }): void;
  isOpen(input: { appId: string; workspaceId: string }): boolean;
  presentPrepared(
    input: WorkspaceAppSurfacePreparedOpenInput
  ): Promise<boolean>;
  registerPresenter(presenter: WorkspaceAppSurfacePresenter): () => void;
  rollbackOpen(attempt: WorkspaceAppOpenAttempt): void;
}

export const IWorkspaceAppSurfaceHost =
  createDecorator<IWorkspaceAppSurfaceHost>("workspace-app-surface-host");
