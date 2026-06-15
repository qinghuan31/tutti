import type {
  DesktopDeveloperLogFileSummary,
  DesktopDeveloperLogsState
} from "@shared/contracts/ipc";

export type WorkspaceSettingsSectionID =
  | "appearance"
  | "apps"
  | "developer"
  | "general";

export type WorkspaceManagedModelProviderID = "agnes" | "openai" | "anthropic";

export interface WorkspaceManagedModel {
  id: string;
  name: string;
  provider: WorkspaceManagedModelProviderID;
}

export interface WorkspaceManagedModelProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  enabled: boolean;
  hasApiKey: boolean;
  models: readonly WorkspaceManagedModel[];
  provider: WorkspaceManagedModelProviderID;
  updatedAt?: string;
  workspaceId?: string;
}

export interface WorkspaceManagedModelProviderDraft extends WorkspaceManagedModelProviderConfig {
  apiKey: string;
}

export interface WorkspaceSettingsManagedModelsMutableState {
  deletingProvider: WorkspaceManagedModelProviderID | null;
  detectingProvider: WorkspaceManagedModelProviderID | null;
  focusedProvider: WorkspaceManagedModelProviderID | null;
  focusRequestID: number;
  loading: boolean;
  providers: WorkspaceManagedModelProviderDraft[];
  savingProvider: WorkspaceManagedModelProviderID | null;
  testingProvider: WorkspaceManagedModelProviderID | null;
}

export interface WorkspaceSettingsManagedModelsSnapshotState {
  readonly deletingProvider: WorkspaceManagedModelProviderID | null;
  readonly detectingProvider: WorkspaceManagedModelProviderID | null;
  readonly focusedProvider: WorkspaceManagedModelProviderID | null;
  readonly focusRequestID: number;
  readonly loading: boolean;
  readonly providers: readonly WorkspaceManagedModelProviderDraft[];
  readonly savingProvider: WorkspaceManagedModelProviderID | null;
  readonly testingProvider: WorkspaceManagedModelProviderID | null;
}

export interface WorkspaceSettingsDeveloperLogsMutableState {
  clearing: boolean;
  exporting: boolean;
  loading: boolean;
  logs: DesktopDeveloperLogsState | null;
}

export interface WorkspaceSettingsDeveloperLogsState {
  readonly clearing: boolean;
  readonly exporting: boolean;
  readonly loading: boolean;
  readonly logs: DesktopDeveloperLogsState | null;
}

export interface WorkspaceSettingsDeveloperLogsSnapshotState {
  readonly clearing: boolean;
  readonly exporting: boolean;
  readonly loading: boolean;
  readonly logs: {
    readonly desktopVersion: string;
    readonly files: readonly DesktopDeveloperLogFileSummary[];
    readonly logsDir: string;
    readonly totalFiles: number;
    readonly totalSizeBytes: number;
  } | null;
}

export interface WorkspaceSettingsStoreState {
  activeSection: WorkspaceSettingsSectionID;
  developerPanelVisible: boolean;
  developerLogs: WorkspaceSettingsDeveloperLogsMutableState;
  managedModels: WorkspaceSettingsManagedModelsMutableState;
  open: boolean;
  workspaceID: string | null;
}

export interface WorkspaceSettingsReadableStoreState {
  readonly activeSection: WorkspaceSettingsSectionID;
  readonly developerPanelVisible: boolean;
  readonly developerLogs: WorkspaceSettingsDeveloperLogsSnapshotState;
  readonly managedModels: WorkspaceSettingsManagedModelsSnapshotState;
  readonly open: boolean;
  readonly workspaceID: string | null;
}
