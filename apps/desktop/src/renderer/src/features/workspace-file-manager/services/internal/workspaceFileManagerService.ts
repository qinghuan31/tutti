import {
  createWorkspaceFileManagerService,
  type WorkspaceFileEntry,
  type WorkspaceFileManagerI18nRuntime,
  type WorkspaceFileManagerPersistedState,
  type WorkspaceFileManagerMutationErrorMessage
} from "@tutti-os/workspace-file-manager/services";
import { getActiveLocale } from "../../../../i18n/runtime.ts";
import { createDesktopWorkspaceFileManagerAdapter } from "./desktopWorkspaceFileManagerAdapter.ts";
import type {
  IWorkspaceFileManagerService,
  WorkspaceFileManagerCanvasPreviewLauncher,
  WorkspaceFileManagerSession
} from "../workspaceFileManagerService.interface";
import type { TuttidClient } from "@tutti-os/client-tuttid-ts";
import {
  INotificationService,
  type NotificationService
} from "@tutti-os/ui-notifications";
import type { DesktopHostFilesApi, DesktopPlatformApi } from "@preload/types";
import { getAppI18nRuntime, translate } from "../../../../i18n/appRuntime.ts";
import { FileManagerFileCreatedReporter } from "../../../analytics/reporters/file-manager-file-created/fileManagerFileCreatedReporter.ts";
import { FileManagerOpenedReporter } from "../../../analytics/reporters/file-manager-opened/fileManagerOpenedReporter.ts";
import { createAnalyticsOpenedSourceParams } from "../../../analytics/reporters/openedSource.ts";
import type { IReporterService } from "../../../analytics/services/reporterService.interface.ts";

export interface WorkspaceFileManagerServiceDependencies {
  hostFilesApi: DesktopHostFilesApi;
  tuttidClient: TuttidClient;
  platformApi: Pick<
    DesktopPlatformApi,
    "homeDirectory" | "os" | "resolveDroppedPaths"
  >;
  reporterService?: Pick<IReporterService, "trackEvents">;
}

export class WorkspaceFileManagerService implements IWorkspaceFileManagerService {
  readonly _serviceBrand = undefined;
  private readonly canvasFilePreviewLaunchers = new Map<
    string,
    WorkspaceFileManagerCanvasPreviewLauncher
  >();
  private readonly dependencies: WorkspaceFileManagerServiceDependencies;
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly notifications: NotificationService;
  private readonly sharedService = createWorkspaceFileManagerService();
  private readonly sessions = new Map<string, WorkspaceFileManagerSession>();

  constructor(
    dependencies: WorkspaceFileManagerServiceDependencies,
    notifications: NotificationService = noopNotifications
  ) {
    this.dependencies = dependencies;
    this.notifications = notifications;
  }

  get hostOs(): NodeJS.Platform {
    return this.dependencies.platformApi.os;
  }

  getSession(
    workspaceID: string,
    i18n: WorkspaceFileManagerI18nRuntime,
    restoredState?: WorkspaceFileManagerPersistedState | null
  ): WorkspaceFileManagerSession {
    const existing = this.sessions.get(workspaceID);
    if (existing) {
      existing.setI18nRuntime(i18n);
      return existing;
    }

    const session = this.sharedService.createSession({
      i18n,
      host: createDesktopWorkspaceFileManagerAdapter(
        {
          ...this.dependencies,
          notifyPreviewUnsupportedFallback: () => {
            this.notifications.info({
              title: translate(
                "workspace.workbenchDesktop.filePreview.unsupportedFallback"
              )
            });
          },
          notifyRevealFailed: (message) => {
            this.notifications.error({
              description: message,
              title: getAppI18nRuntime(getActiveLocale()).t(
                "workspaceFileManager.revealFailedTitle"
              )
            });
          },
          reportFileCreated: () => this.reportFileCreated(),
          reportFileOpened: () => this.reportFileOpened()
        },
        getActiveLocale,
        {
          openCanvasPreview: (target, workspaceID) =>
            this.openCanvasPreview(workspaceID, target)
        }
      ),
      initialDirectoryPath: this.dependencies.platformApi.homeDirectory,
      onMutationErrorMessage: (message) =>
        this.notifyHandledMutationError(message),
      persistence: {
        load: () => restoredState ?? null,
        save: () => this.notify(workspaceID)
      },
      workspaceID
    });
    this.sessions.set(workspaceID, session);
    return session;
  }

  getSnapshotState(
    workspaceID: string
  ): WorkspaceFileManagerPersistedState | null {
    return this.sessions.get(workspaceID)?.getPersistedState() ?? null;
  }

  async resolveEntryIconUrl(
    workspaceID: string,
    entry: WorkspaceFileEntry
  ): Promise<string | null> {
    return this.dependencies.hostFilesApi.resolveEntryIcon(workspaceID, {
      kind: entry.kind,
      mtimeMs: entry.mtimeMs,
      name: entry.name,
      path: entry.path
    });
  }

  setCanvasFilePreviewLauncher(
    workspaceID: string,
    launcher: WorkspaceFileManagerCanvasPreviewLauncher | null
  ): void {
    if (!launcher) {
      this.canvasFilePreviewLaunchers.delete(workspaceID);
      return;
    }
    this.canvasFilePreviewLaunchers.set(workspaceID, launcher);
  }

  subscribe(workspaceID: string, listener: () => void): () => void {
    const listeners = this.listeners.get(workspaceID) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(workspaceID, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(workspaceID);
      }
    };
  }

  private notify(workspaceID: string): void {
    for (const listener of this.listeners.get(workspaceID) ?? []) {
      listener();
    }
  }

  private async openCanvasPreview(
    workspaceID: string,
    target: Parameters<WorkspaceFileManagerCanvasPreviewLauncher>[0]
  ): Promise<boolean> {
    return (
      (await this.canvasFilePreviewLaunchers.get(workspaceID)?.(target)) ===
      true
    );
  }

  private notifyHandledMutationError(
    message: WorkspaceFileManagerMutationErrorMessage
  ): boolean {
    this.notifications.error({
      title: message.message
    });
    return true;
  }

  private reportFileOpened(): void {
    const reporterService = this.dependencies.reporterService;
    if (!reporterService) {
      return;
    }

    void new FileManagerOpenedReporter(
      createAnalyticsOpenedSourceParams("file_manager"),
      {
        reporterService
      }
    ).report();
  }

  private reportFileCreated(): void {
    this.reportFileManagerEvent(FileManagerFileCreatedReporter);
  }

  private reportFileManagerEvent(
    Reporter: typeof FileManagerFileCreatedReporter
  ): void {
    const reporterService = this.dependencies.reporterService;
    if (!reporterService) {
      return;
    }

    void new Reporter(
      {},
      {
        reporterService
      }
    ).report();
  }
}

// Avoid decorator syntax so the renderer Babel pass can parse this file.
INotificationService(WorkspaceFileManagerService, undefined, 1);

const noopNotifications: NotificationService = {
  _serviceBrand: undefined,
  error() {},
  info() {},
  notify() {},
  success() {},
  warning() {}
};
