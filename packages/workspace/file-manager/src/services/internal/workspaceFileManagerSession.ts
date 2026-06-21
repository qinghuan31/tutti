import { subscribe } from "valtio/vanilla";
import {
  normalizeWorkspaceFilePath,
  validateWorkspaceFileEntryName
} from "../workspaceFileManagerModel.ts";
import { getWorkspaceFileManagerPersistedState } from "./workspaceFileManagerStore.ts";
import type { WorkspaceFileManagerI18nRuntime } from "../../i18n/workspaceFileManagerI18n.ts";
import type {
  CreateWorkspaceFileManagerSessionInput,
  WorkspaceFileManagerHost,
  WorkspaceFileManagerMutationErrorMessage
} from "../workspaceFileManagerHost.interface.ts";
import type {
  WorkspaceFileManagerFileActivationRequest,
  WorkspaceFileManagerHostActionMessage,
  WorkspaceFileManagerHostActionResult,
  WorkspaceFileManagerHostFallbackAction
} from "../workspaceFileManagerHostTypes.ts";
import type { WorkspaceFileManagerSession } from "../workspaceFileManagerService.interface.ts";
import type {
  WorkspaceFileEntry,
  WorkspaceFileOpenWithApplication,
  WorkspaceFileManagerPersistedState,
  WorkspaceFileManagerState
} from "../workspaceFileManagerTypes.ts";
import { WorkspaceFileManagerActivationController } from "./workspaceFileManagerActivationController.ts";
import { WorkspaceFileManagerMutationController } from "./workspaceFileManagerMutationController.ts";
import { WorkspaceFileManagerNavigationController } from "./workspaceFileManagerNavigationController.ts";
import { WorkspaceFileManagerPreviewController } from "./workspaceFileManagerPreviewController.ts";
import { WorkspaceFileManagerImportController } from "./workspaceFileManagerImportController.ts";
import {
  resolveWorkspaceFileOpenWithCacheKey,
  WorkspaceFileOpenWithApplicationsCache
} from "./model/openWithApplicationsCache.ts";

export interface WorkspaceFileManagerSessionInput {
  copy: WorkspaceFileManagerI18nRuntime;
  host: WorkspaceFileManagerHost;
  onHostActionMessage?: (
    message: WorkspaceFileManagerHostActionMessage
  ) => void;
  onMutationErrorMessage?: (
    message: WorkspaceFileManagerMutationErrorMessage
  ) => boolean | void;
  persistence?: CreateWorkspaceFileManagerSessionInput["persistence"];
  resolveFileDefaultOpener?: CreateWorkspaceFileManagerSessionInput["resolveFileDefaultOpener"];
  store: WorkspaceFileManagerState;
}

type WorkspaceFileManagerHostActionResultFallback =
  | {
      actionKind?: "export";
      entry: WorkspaceFileEntry;
      kind: "view";
    }
  | { actionKind?: "import"; kind: "import" };

export class DefaultWorkspaceFileManagerSession implements WorkspaceFileManagerSession {
  readonly store: WorkspaceFileManagerState;
  private readonly host: WorkspaceFileManagerHost;
  private hasInitialized = false;
  private initializePromise: Promise<void> | null = null;
  private isActive = false;
  private isDisposed = false;
  private lastObservedEntries: WorkspaceFileManagerState["entries"];
  private lastObservedPersistedState: string;
  private lastObservedSelectedPath: WorkspaceFileManagerState["selectedPath"];
  private lastRevealRequestID: string | null = null;
  private readonly onHostActionMessage?: (
    message: WorkspaceFileManagerHostActionMessage
  ) => void;
  private readonly onMutationErrorMessage?: (
    message: WorkspaceFileManagerMutationErrorMessage
  ) => boolean | void;
  private searchRequestSeq = 0;
  private readonly activationController: WorkspaceFileManagerActivationController;
  private copy: WorkspaceFileManagerI18nRuntime;
  private readonly mutationController: WorkspaceFileManagerMutationController;
  private readonly navigationController: WorkspaceFileManagerNavigationController;
  private readonly previewController: WorkspaceFileManagerPreviewController;
  private readonly persistence?: CreateWorkspaceFileManagerSessionInput["persistence"];
  private unsubscribeStore: (() => void) | null = null;
  private readonly importController: WorkspaceFileManagerImportController;
  private readonly openWithApplicationsCache =
    new WorkspaceFileOpenWithApplicationsCache();

  constructor(input: WorkspaceFileManagerSessionInput) {
    this.copy = input.copy;
    this.host = input.host;
    this.onHostActionMessage = input.onHostActionMessage;
    this.onMutationErrorMessage = input.onMutationErrorMessage;
    this.persistence = input.persistence;
    this.store = input.store;
    this.navigationController = new WorkspaceFileManagerNavigationController({
      host: input.host,
      resolveErrorMessage: (error) => this.resolveErrorMessage(error),
      store: this.store
    });
    this.activationController = new WorkspaceFileManagerActivationController({
      copy: () => this.copy,
      host: input.host,
      loadDirectory: (path) => this.navigationController.loadDirectory(path),
      resolveErrorMessage: (error, overrides) =>
        this.resolveErrorMessage(error, overrides),
      resolveFileDefaultOpener: input.resolveFileDefaultOpener,
      store: this.store
    });
    this.mutationController = new WorkspaceFileManagerMutationController({
      host: input.host,
      onErrorMessage: (message) => this.onMutationErrorMessage?.(message),
      refresh: () => this.refresh(),
      resolveErrorMessage: (error) => this.resolveErrorMessage(error),
      store: this.store
    });
    this.previewController = new WorkspaceFileManagerPreviewController({
      copy: () => this.copy,
      host: input.host,
      isDisposed: () => this.isDisposed,
      resolveErrorMessage: (error, overrides) =>
        this.resolveErrorMessage(error, overrides),
      store: this.store
    });
    this.importController = new WorkspaceFileManagerImportController({
      applyHostActionResult: (result, fallback) =>
        this.applyHostActionResult(result, fallback),
      copy: () => this.copy,
      host: input.host,
      refresh: () => this.refresh(),
      resolveErrorMessage: (error) => this.resolveErrorMessage(error),
      store: this.store
    });
    this.lastObservedEntries = this.store.entries;
    this.lastObservedPersistedState = serializePersistedState(
      this.getPersistedState()
    );
    this.lastObservedSelectedPath = this.store.selectedPath;
  }

  async activateFile(request: WorkspaceFileManagerFileActivationRequest) {
    return this.activationController.activateFile(request);
  }

  async applyRevealIntent(
    intent: {
      mode?: "reveal" | "open-directory";
      path: string;
      requestID: string;
    } | null
  ): Promise<void> {
    if (!intent?.path || !intent.requestID) {
      return;
    }
    if (intent.requestID === this.lastRevealRequestID) {
      return;
    }
    this.lastRevealRequestID = intent.requestID;
    if (intent.mode === "open-directory") {
      await this.loadDirectory(intent.path);
      return;
    }
    await this.revealPath(intent.path);
  }

  closeContextMenu(): void {
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
  }

  closeCreateDialog(): void {
    if (this.store.busyAction === "create") {
      return;
    }
    this.store.createDialog = null;
  }

  closeDeleteDialog(): void {
    if (this.store.busyAction === "delete") {
      return;
    }
    this.store.deleteDialog = null;
  }

  cancelInlineRename(): void {
    if (this.store.busyAction === "rename") {
      return;
    }
    this.store.inlineRenameEntryPath = null;
    this.store.inlineRenameValidation = null;
  }

  closeTransientUi(): void {
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    if (this.store.busyAction !== null) {
      return;
    }
    this.store.createDialog = null;
    this.store.deleteDialog = null;
    this.store.inlineRenameEntryPath = null;
    this.store.inlineRenameValidation = null;
    this.store.unsupportedDialog = null;
    this.store.importConflictDialog = null;
  }

  closeUnsupportedDialog(): void {
    if (this.store.busyAction === "view") {
      return;
    }
    this.store.unsupportedDialog = null;
  }

  closeImportConflictDialog(): void {
    if (this.store.busyAction === "import") {
      return;
    }
    this.store.importConflictDialog = null;
  }

  async confirmCreateDialog(): Promise<void> {
    const createDialog = this.store.createDialog;
    if (!createDialog) {
      return;
    }
    const validation = validateWorkspaceFileEntryName(createDialog.name);
    if (validation) {
      this.store.createDialog = {
        ...createDialog,
        errorMessage:
          validation === "required"
            ? this.copy.t("createNameRequired")
            : this.copy.t("createNameInvalid")
      };
      return;
    }

    const path =
      `${this.store.currentDirectoryPath}/${createDialog.name.trim()}`.replaceAll(
        /\/+/g,
        "/"
      );
    this.store.busyAction = "create";
    try {
      if (createDialog.kind === "directory") {
        await this.createDirectory(path);
      } else {
        await this.createFile(path);
      }
      this.store.createDialog = null;
    } finally {
      this.store.busyAction = null;
    }
  }

  async confirmDeleteDialog(): Promise<void> {
    const deleteDialog = this.store.deleteDialog;
    if (!deleteDialog) {
      return;
    }
    this.store.busyAction = "delete";
    try {
      this.store.selectedPath = deleteDialog.entryPath;
      await this.deleteSelected();
      this.store.deleteDialog = null;
    } finally {
      this.store.busyAction = null;
    }
  }

  async confirmInlineRename(newName: string): Promise<boolean> {
    const inlineRenameEntryPath = this.store.inlineRenameEntryPath;
    if (!inlineRenameEntryPath) {
      return true;
    }
    const entry = this.store.entries.find(
      (candidate) => candidate.path === inlineRenameEntryPath
    );
    if (!entry) {
      this.store.inlineRenameEntryPath = null;
      this.store.inlineRenameValidation = null;
      return true;
    }

    const trimmedName = newName.trim();
    if (trimmedName === entry.name) {
      this.store.inlineRenameEntryPath = null;
      this.store.inlineRenameValidation = null;
      return true;
    }

    const validation = validateWorkspaceFileEntryName(trimmedName);
    if (validation) {
      this.store.inlineRenameValidation = validation;
      return false;
    }

    this.store.inlineRenameValidation = null;
    this.store.busyAction = "rename";
    try {
      await this.mutationController.renameEntry(entry, trimmedName);
      this.store.inlineRenameEntryPath = null;
      return true;
    } finally {
      this.store.busyAction = null;
    }
  }

  async confirmImportConflict(): Promise<void> {
    await this.importController.confirmImportConflict();
  }

  async createDirectory(path: string): Promise<void> {
    await this.mutationController.createDirectory(path);
  }

  async createFile(path: string): Promise<void> {
    await this.mutationController.createFile(path);
  }

  async deleteSelected(): Promise<void> {
    await this.mutationController.deleteSelected();
  }

  decrementDragDepth(): void {
    this.store.dragDepth =
      this.store.dragDepth <= 1 ? 0 : this.store.dragDepth - 1;
  }

  dispose(): void {
    this.isDisposed = true;
    this.hasInitialized = false;
    this.initializePromise = null;
    this.isActive = false;
    this.searchRequestSeq += 1;
    this.store.isSearching = false;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    this.previewController.dispose();
  }

  async goBack(): Promise<void> {
    await this.navigationController.goBack();
  }

  async goForward(): Promise<void> {
    await this.navigationController.goForward();
  }

  getPersistedState(): WorkspaceFileManagerPersistedState {
    return getWorkspaceFileManagerPersistedState(this.store);
  }

  async handleActivationFallbackAction(
    action: WorkspaceFileManagerHostFallbackAction
  ): Promise<void> {
    await this.activationController.handleFallbackAction(action);
  }

  async exportEntry(
    entry: WorkspaceFileEntry
  ): Promise<WorkspaceFileManagerHostActionResult> {
    if (!this.host.exportEntry) {
      return { supported: false } as const;
    }

    this.store.busyAction = "export";
    this.store.error = null;
    try {
      const result = await this.host.exportEntry({
        entry,
        workspaceID: this.store.workspaceID
      });
      this.applyHostActionResult(result, {
        actionKind: "export",
        entry,
        kind: "view"
      });
      return result;
    } catch (error) {
      const result = {
        message: this.resolveErrorMessage(error),
        supported: false,
        title: this.copy.t("downloadFailedTitle")
      } as const;
      this.applyHostActionResult(result, {
        actionKind: "export",
        entry,
        kind: "view"
      });
      return result;
    } finally {
      this.store.busyAction = null;
    }
  }

  incrementDragDepth(): void {
    if (!this.isActive) {
      return;
    }
    this.store.dragDepth += 1;
  }

  async initialize(): Promise<void> {
    if (this.hasInitialized) {
      return;
    }
    if (this.initializePromise) {
      await this.initializePromise;
      return;
    }
    this.isDisposed = false;
    this.initializePromise = (async () => {
      this.observeStore();
      if (!this.hasLoadedDirectoryState()) {
        await this.navigationController.loadDirectory();
      }
      await this.previewController.syncPreviewState();
      this.hasInitialized = true;
    })();
    try {
      await this.initializePromise;
    } finally {
      this.initializePromise = null;
    }
  }

  async loadDirectory(path = this.store.currentDirectoryPath): Promise<void> {
    await this.navigationController.loadDirectory(path);
  }

  openContextMenu(input: {
    entryPath: string | null;
    x: number;
    y: number;
  }): void {
    this.store.contextMenuEntryPath = input.entryPath;
    this.store.contextMenu = input;
  }

  openCreateDirectoryDialog(): void {
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    this.store.createDialog = {
      errorMessage: null,
      kind: "directory",
      name: ""
    };
  }

  openCreateFileDialog(): void {
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    this.store.createDialog = {
      errorMessage: null,
      kind: "file",
      name: ""
    };
  }

  openDeleteDialog(entry: WorkspaceFileEntry): void {
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    this.store.deleteDialog = {
      entryPath: entry.path
    };
  }

  startInlineRename(entry: WorkspaceFileEntry): void {
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    this.store.inlineRenameEntryPath = entry.path;
    this.store.inlineRenameValidation = null;
    this.store.selectedPath = entry.path;
  }

  async copyToClipboard(entry: WorkspaceFileEntry): Promise<void> {
    if (!this.host.copyEntriesToClipboard) {
      return;
    }

    await this.host.copyEntriesToClipboard({
      paths: [entry.path],
      workspaceID: this.store.workspaceID
    });
  }

  getCachedOpenWithApplications(
    entry: WorkspaceFileEntry
  ): WorkspaceFileOpenWithApplication[] | null {
    if (!this.host.listOpenWithApplications) {
      return null;
    }
    return this.openWithApplicationsCache.get(
      resolveWorkspaceFileOpenWithCacheKey(entry)
    );
  }

  async listOpenWithApplications(
    entry: WorkspaceFileEntry
  ): Promise<WorkspaceFileOpenWithApplication[]> {
    if (!this.host.listOpenWithApplications) {
      return [];
    }
    return this.openWithApplicationsCache.resolve(
      resolveWorkspaceFileOpenWithCacheKey(entry),
      () =>
        this.host.listOpenWithApplications!({
          path: entry.path,
          workspaceID: this.store.workspaceID
        })
    );
  }

  async openEntry(entry: WorkspaceFileEntry): Promise<void> {
    await this.activationController.openEntry(entry);
  }

  async openFileWithApplication(
    entry: WorkspaceFileEntry,
    applicationPath: string
  ): Promise<void> {
    if (!this.host.openFileWithApplication) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    await this.host.openFileWithApplication({
      applicationPath,
      path: entry.path,
      workspaceID: this.store.workspaceID
    });
  }

  async openFileInAppBrowser(entry: WorkspaceFileEntry): Promise<void> {
    if (!this.host.openFileInAppBrowser) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    await this.host.openFileInAppBrowser({
      path: entry.path,
      workspaceID: this.store.workspaceID
    });
  }

  async openFileInDefaultBrowser(entry: WorkspaceFileEntry): Promise<void> {
    if (!this.host.openFileInDefaultBrowser) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    await this.host.openFileInDefaultBrowser({
      path: entry.path,
      workspaceID: this.store.workspaceID
    });
  }

  async openFileInFileViewer(entry: WorkspaceFileEntry): Promise<void> {
    await this.activationController.openFileInFileViewer(entry);
  }

  async openFileInSystemDefault(entry: WorkspaceFileEntry): Promise<void> {
    if (!this.host.openFileInSystemDefault) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    await this.host.openFileInSystemDefault({
      path: entry.path,
      workspaceID: this.store.workspaceID
    });
  }

  async openFileWithOtherApplication(entry: WorkspaceFileEntry): Promise<void> {
    if (!this.host.openFileWithOtherApplication) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    await this.host.openFileWithOtherApplication({
      applicationPickerPrompt: this.copy.t("openWithOtherPickerPrompt"),
      path: entry.path,
      workspaceID: this.store.workspaceID
    });
  }

  async revealEntry(entry: WorkspaceFileEntry): Promise<void> {
    if (!this.host.revealEntry) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    await this.host.revealEntry({
      path: entry.path,
      workspaceID: this.store.workspaceID
    });
  }

  async moveEntry(
    entry: WorkspaceFileEntry,
    targetDirectoryPath: string
  ): Promise<void> {
    this.store.busyAction = "move";
    try {
      await this.mutationController.moveEntry(entry, targetDirectoryPath);
    } finally {
      this.store.busyAction = null;
    }
  }

  async refresh(): Promise<void> {
    await this.navigationController.refresh();
  }

  async revealPath(path: string): Promise<void> {
    await this.navigationController.revealPath(path);
  }

  resetDragDepth(): void {
    this.store.dragDepth = 0;
  }

  async search(query: string): Promise<void> {
    const requestID = ++this.searchRequestSeq;
    this.store.searchQuery = query;
    this.store.searchError = null;
    if (!this.host.search || query.trim() === "") {
      this.store.searchEntries = [];
      this.store.isSearching = false;
      return;
    }

    this.store.isSearching = true;
    try {
      const result = await this.host.search({
        query,
        workspaceID: this.store.workspaceID
      });
      if (this.isDisposed || requestID !== this.searchRequestSeq) {
        return;
      }
      this.store.searchEntries = result.entries;
    } catch (error) {
      if (!this.isDisposed && requestID === this.searchRequestSeq) {
        this.store.searchError = this.resolveErrorMessage(error);
      }
    } finally {
      if (!this.isDisposed && requestID === this.searchRequestSeq) {
        this.store.isSearching = false;
      }
    }
  }

  select(path: string | null): void {
    const nextSelectedPath = path
      ? normalizeWorkspaceFilePath(path, this.store.root)
      : null;
    if (this.store.selectedPath === nextSelectedPath) {
      return;
    }
    this.store.selectedPath = nextSelectedPath;
  }

  setActive(active: boolean): void {
    if (this.isActive === active) {
      return;
    }
    this.isActive = active;
    if (active) {
      return;
    }
    this.store.contextMenu = null;
    this.store.contextMenuEntryPath = null;
    this.store.dragDepth = 0;
  }

  setI18nRuntime(copy: WorkspaceFileManagerI18nRuntime): void {
    if (this.copy === copy) {
      return;
    }
    this.copy = copy;
    void this.previewController.syncPreviewState();
  }

  updateCreateDialogName(name: string): void {
    if (!this.store.createDialog) {
      return;
    }
    this.store.createDialog = {
      ...this.store.createDialog,
      errorMessage: null,
      name
    };
  }

  clearInlineRenameValidation(): void {
    this.store.inlineRenameValidation = null;
  }

  async importDroppedFiles(
    dataTransfer: Pick<DataTransfer, "files" | "items">,
    targetDirectoryPath: string
  ): Promise<WorkspaceFileManagerHostActionResult> {
    return this.importController.importDroppedFiles(
      dataTransfer,
      targetDirectoryPath
    );
  }

  async importFiles(
    targetDirectoryPath: string
  ): Promise<WorkspaceFileManagerHostActionResult> {
    return this.importController.importFiles(targetDirectoryPath);
  }

  private applyHostActionResult(
    result: WorkspaceFileManagerHostActionResult | void,
    fallback: WorkspaceFileManagerHostActionResultFallback
  ): void {
    if (!result) {
      return;
    }

    this.notifyHostActionMessages(result, fallback);

    if (result.importConflict) {
      this.store.unsupportedDialog = null;
      this.store.importConflictDialog = result.importConflict;
      return;
    }

    if (result.supported === false) {
      this.store.importConflictDialog = null;
      this.store.unsupportedDialog = {
        entryPath: "entry" in fallback ? fallback.entry.path : null,
        kind: fallback.kind,
        message: result.message,
        title: result.title
      };
      return;
    }

    this.store.unsupportedDialog = null;
    this.store.importConflictDialog = null;
  }

  private hasLoadedDirectoryState(): boolean {
    return (
      this.store.error !== null ||
      this.store.entries.length > 0 ||
      this.store.selectedPath !== null
    );
  }

  private notifyHostActionMessages(
    result: WorkspaceFileManagerHostActionResult,
    fallback: WorkspaceFileManagerHostActionResultFallback
  ): void {
    if (!this.onHostActionMessage) {
      return;
    }

    const entry = "entry" in fallback ? fallback.entry : null;
    const actionKind =
      fallback.actionKind ?? (fallback.kind === "import" ? "import" : "export");
    if (result.cancelledMessage?.trim()) {
      this.notifyHostActionMessage(actionKind, entry, "cancelled", result);
      return;
    }
    if (result.supported === false || result.importConflict) {
      return;
    }
    if (result.completedMessage?.trim()) {
      this.notifyHostActionMessage(actionKind, entry, "completed", result);
      return;
    }
    this.notifyHostActionMessage(actionKind, entry, "started", result);
  }

  private notifyHostActionMessage(
    actionKind: WorkspaceFileManagerHostActionMessage["actionKind"],
    entry: WorkspaceFileEntry | null,
    status: WorkspaceFileManagerHostActionMessage["status"],
    result: WorkspaceFileManagerHostActionResult
  ): void {
    const messageByStatus = {
      cancelled: "cancelledMessage",
      completed: "completedMessage",
      started: "startedMessage"
    } as const;
    const message = result[messageByStatus[status]]?.trim();
    if (!message) {
      return;
    }
    this.onHostActionMessage?.({
      actionKind,
      entry,
      message,
      status
    });
  }

  private observeStore(): void {
    if (this.unsubscribeStore) {
      return;
    }

    this.lastObservedEntries = this.store.entries;
    this.lastObservedSelectedPath = this.store.selectedPath;
    this.unsubscribeStore = subscribe(this.store, () => {
      if (this.isDisposed) {
        return;
      }
      if (
        this.lastObservedEntries === this.store.entries &&
        this.lastObservedSelectedPath === this.store.selectedPath
      ) {
        this.savePersistedStateIfChanged();
        return;
      }
      this.lastObservedEntries = this.store.entries;
      this.lastObservedSelectedPath = this.store.selectedPath;
      this.savePersistedStateIfChanged();
      void this.previewController.syncPreviewState();
      this.warmOpenWithApplicationsCache(this.store.entries);
    });
  }

  private warmOpenWithApplicationsCache(
    entries: WorkspaceFileManagerState["entries"]
  ): void {
    if (!this.host.listOpenWithApplications || this.store.isLoading) {
      return;
    }
    this.openWithApplicationsCache.scheduleWarmup(entries, (entry) =>
      this.listOpenWithApplications(entry)
    );
  }

  private savePersistedStateIfChanged(): void {
    if (!this.persistence?.save) {
      return;
    }
    const nextState = this.getPersistedState();
    const serialized = serializePersistedState(nextState);
    if (serialized === this.lastObservedPersistedState) {
      return;
    }
    this.lastObservedPersistedState = serialized;
    this.persistence.save(nextState);
  }

  private resolveErrorMessage(
    error: unknown,
    overrides: Record<string, string | undefined> = {}
  ): string {
    const filteredOverrides = Object.fromEntries(
      Object.entries(overrides).filter((entry) => entry[1] !== undefined)
    ) as Record<string, string>;
    if (this.host.resolveErrorMessage) {
      return this.host.resolveErrorMessage(error, filteredOverrides);
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: unknown }).code === "string"
    ) {
      const override = filteredOverrides[(error as { code: string }).code];
      if (override) {
        return override;
      }
    }

    return this.copy.t("unknownErrorMessage");
  }
}

function serializePersistedState(
  state: WorkspaceFileManagerPersistedState
): string {
  return JSON.stringify(state);
}
