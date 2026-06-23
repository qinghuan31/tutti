import type { DesktopWorkspaceAppContext } from "../../shared/contracts/ipc";
import type {
  TuttiExternalAtQueryInput,
  TuttiExternalAtQueryResult,
  TuttiExternalBridge,
  TuttiExternalFileOpenInput,
  TuttiExternalFileSelectInput,
  TuttiExternalFileSelectResult,
  TuttiExternalLogInput,
  TuttiExternalPermissionRequestInput,
  TuttiExternalPermissionRequestResult,
  TuttiExternalPdfPrintHtmlInput,
  TuttiExternalPdfPrintHtmlResult,
  TuttiExternalReferenceOpenInput,
  TuttiExternalSettingsOpenInput,
  TuttiExternalUserProjectCreateInput,
  TuttiExternalUserProjectPathInput,
  TuttiExternalUserProjectRememberDefaultSelectionInput,
  TuttiExternalWorkspaceOpenFeatureInput
} from "@tutti-os/workspace-external-core/contracts";
import { normalizeTuttiExternalLogInput } from "@tutti-os/workspace-external-core/core";
import type {
  WorkspaceUserProject,
  WorkspaceUserProjectDefaultSelection,
  WorkspaceUserProjectPathCheck,
  WorkspaceUserProjectSelectionPreparation,
  WorkspaceUserProjectSelectionPreparationInput,
  WorkspaceUserProjectServiceSnapshot
} from "@tutti-os/workspace-user-project/contracts";

export interface WorkspaceAppExternalBridgeDependencies {
  appContext: {
    get(): Promise<DesktopWorkspaceAppContext>;
    subscribe(
      listener: (context: DesktopWorkspaceAppContext) => void
    ): () => void;
  };
  invoke<TResult>(channel: string, payload?: unknown): Promise<TResult>;
  isUserActivationActive(): boolean;
  send(channel: string, payload?: unknown): void;
  subscribeToUserProjects?(
    listener: (snapshot: WorkspaceUserProjectServiceSnapshot) => void
  ): () => void;
}

export const workspaceAppExternalChannels = {
  atQuery: "workspace-app-at:query",
  browserOpenUrl: "workspace-app:open-url",
  filesOpen: "workspace-app-files:open",
  filesSelect: "workspace-app-files:select",
  logsWrite: "workspace-app-logs:write",
  permissionsRequest: "workspace-app-permissions:request",
  pdfPrintHtml: "workspace-app-pdf:print-html",
  referencesOpen: "workspace-app-references:open",
  settingsOpen: "workspace-app-settings:open",
  userProjectsCheckPath: "workspace-app-user-projects:check-path",
  userProjectsCreate: "workspace-app-user-projects:create",
  userProjectsGetDefaultSelection:
    "workspace-app-user-projects:get-default-selection",
  userProjectsGetSnapshot: "workspace-app-user-projects:get-snapshot",
  userProjectsList: "workspace-app-user-projects:list",
  userProjectsPrepareSelection: "workspace-app-user-projects:prepare-selection",
  userProjectsRefresh: "workspace-app-user-projects:refresh",
  userProjectsRememberDefaultSelection:
    "workspace-app-user-projects:remember-default-selection",
  userProjectsSelectDirectory: "workspace-app-user-projects:select-directory",
  userProjectsUse: "workspace-app-user-projects:use",
  workspaceFeatureOpen: "workspace-app-feature:open"
} as const;

export function createWorkspaceAppExternalBridge(
  dependencies: WorkspaceAppExternalBridgeDependencies
): TuttiExternalBridge {
  return {
    app: {
      getContext() {
        return dependencies.appContext.get();
      },
      subscribe(listener) {
        return dependencies.appContext.subscribe(listener);
      }
    },
    browser: {
      openUrl(input) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "browser.openUrl"
        );
        dependencies.send(workspaceAppExternalChannels.browserOpenUrl, input);
        return Promise.resolve();
      }
    },
    at: {
      query(input: TuttiExternalAtQueryInput) {
        return dependencies.invoke<TuttiExternalAtQueryResult[]>(
          workspaceAppExternalChannels.atQuery,
          input
        );
      }
    },
    files: {
      select(input?: TuttiExternalFileSelectInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "files.select"
        );
        return dependencies.invoke<TuttiExternalFileSelectResult>(
          workspaceAppExternalChannels.filesSelect,
          input ?? {}
        );
      },
      open(input: TuttiExternalFileOpenInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "files.open"
        );
        return dependencies.invoke<void>(
          workspaceAppExternalChannels.filesOpen,
          input
        );
      }
    },
    permissions: {
      request(input: TuttiExternalPermissionRequestInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "permissions.request"
        );
        return dependencies.invoke<TuttiExternalPermissionRequestResult>(
          workspaceAppExternalChannels.permissionsRequest,
          input
        );
      }
    },
    settings: {
      open(input?: TuttiExternalSettingsOpenInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "settings.open"
        );
        return dependencies.invoke<void>(
          workspaceAppExternalChannels.settingsOpen,
          input ?? {}
        );
      }
    },
    references: {
      open(input: TuttiExternalReferenceOpenInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "references.open"
        );
        return dependencies.invoke<void>(
          workspaceAppExternalChannels.referencesOpen,
          input
        );
      }
    },
    // Workspace apps are trusted installed packages. User activation gates
    // disruptive host UI, not the trusted project-state integration surface.
    userProjects: {
      checkPath(input: TuttiExternalUserProjectPathInput) {
        return dependencies.invoke<WorkspaceUserProjectPathCheck>(
          workspaceAppExternalChannels.userProjectsCheckPath,
          input
        );
      },
      create(input: TuttiExternalUserProjectCreateInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "userProjects.create"
        );
        return dependencies.invoke<WorkspaceUserProject>(
          workspaceAppExternalChannels.userProjectsCreate,
          input
        );
      },
      getDefaultSelection() {
        return dependencies.invoke<WorkspaceUserProjectDefaultSelection | null>(
          workspaceAppExternalChannels.userProjectsGetDefaultSelection
        );
      },
      getSnapshot() {
        return dependencies.invoke<WorkspaceUserProjectServiceSnapshot>(
          workspaceAppExternalChannels.userProjectsGetSnapshot
        );
      },
      list() {
        return dependencies.invoke<{ projects: WorkspaceUserProject[] }>(
          workspaceAppExternalChannels.userProjectsList
        );
      },
      prepareSelection(input: WorkspaceUserProjectSelectionPreparationInput) {
        return dependencies.invoke<WorkspaceUserProjectSelectionPreparation>(
          workspaceAppExternalChannels.userProjectsPrepareSelection,
          input
        );
      },
      refresh() {
        return dependencies.invoke<WorkspaceUserProjectServiceSnapshot>(
          workspaceAppExternalChannels.userProjectsRefresh
        );
      },
      rememberDefaultSelection(
        input: TuttiExternalUserProjectRememberDefaultSelectionInput
      ) {
        return dependencies.invoke<void>(
          workspaceAppExternalChannels.userProjectsRememberDefaultSelection,
          input
        );
      },
      selectDirectory() {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "userProjects.selectDirectory"
        );
        return dependencies.invoke<{ path: string } | null>(
          workspaceAppExternalChannels.userProjectsSelectDirectory
        );
      },
      subscribe(listener) {
        return dependencies.subscribeToUserProjects?.(listener) ?? (() => {});
      },
      use(input: TuttiExternalUserProjectPathInput) {
        return dependencies.invoke<WorkspaceUserProject>(
          workspaceAppExternalChannels.userProjectsUse,
          input
        );
      }
    },
    workspace: {
      openFeature(input: TuttiExternalWorkspaceOpenFeatureInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "workspace.openFeature"
        );
        return dependencies.invoke<void>(
          workspaceAppExternalChannels.workspaceFeatureOpen,
          input
        );
      }
    },
    pdf: {
      printHtmlToPdf(input: TuttiExternalPdfPrintHtmlInput) {
        requireUserActivation(
          dependencies.isUserActivationActive(),
          "pdf.printHtmlToPdf"
        );
        return dependencies.invoke<TuttiExternalPdfPrintHtmlResult>(
          workspaceAppExternalChannels.pdfPrintHtml,
          input
        );
      }
    },
    logs: {
      write(input: TuttiExternalLogInput) {
        try {
          dependencies.send(
            workspaceAppExternalChannels.logsWrite,
            normalizeTuttiExternalLogInput(input)
          );
        } catch {
          // Fire-and-forget: invalid app payloads are silently ignored.
        }
      }
    }
  };
}

export function requireUserActivation(
  isActive: boolean,
  operation: string
): void {
  if (!isActive) {
    throw new Error(`${operation} requires a user action.`);
  }
}
