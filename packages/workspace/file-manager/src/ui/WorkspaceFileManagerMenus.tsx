import {
  ArrowRightIcon,
  Button,
  ConfirmationDialog,
  CopyIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EyeIcon,
  FileLinedIcon,
  ImportLinedIcon as ImportIcon,
  Input,
  LaunchIcon,
  LocateFolderIcon,
  MenuSurface,
  NewWorkspaceLinedIcon,
  ViewportMenuSurface,
  WebIcon,
  cn
} from "@tutti-os/ui-system";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type RefObject
} from "react";
import {
  CONTEXT_MENU_SUBMENU_GAP_PX,
  clampContextMenuPosition,
  estimateOpenWithSubmenuHeight
} from "./contextMenuPlacement.ts";
import type {
  WorkspaceFileManagerI18nKey,
  WorkspaceFileManagerI18nRuntime
} from "../i18n/workspaceFileManagerI18n.ts";
import type {
  WorkspaceFileEntry,
  WorkspaceFileImportSummaryReason,
  WorkspaceFileOpenWithApplication
} from "../services/workspaceFileManagerTypes.ts";
import type {
  WorkspaceFileManagerHostFallbackAction,
  WorkspaceFileManagerHostImportConflict
} from "./workspaceFileManagerHostTypes.ts";

export function WorkspaceFileManagerContextMenu({
  busy,
  copy,
  contextMenu,
  contextMenuRef,
  openInAppBrowserIcon,
  showCopyAction,
  showImportAction,
  showExportAction,
  showOpenInAppBrowserAction,
  showOpenInDefaultBrowserAction,
  showOpenWithAction,
  showOpenWithOtherAction,
  showRevealInFolderAction,
  showRenameAction,
  revealInFolderLabel,
  openWithApplications,
  openWithLoading,
  resolveOpenWithApplicationIcon,
  onClose,
  onCreateDirectory,
  onCreateFile,
  onCopy,
  onCopyPath,
  onDelete,
  onExport,
  onOpen,
  onOpenInAppBrowser,
  onOpenInDefaultBrowser,
  onOpenWithApplication,
  onOpenWithOtherApplication,
  onImport,
  onRevealInFolder,
  onRename
}: {
  busy: boolean;
  copy: WorkspaceFileManagerI18nRuntime;
  contextMenu: {
    entry: WorkspaceFileEntry | null;
    x: number;
    y: number;
  } | null;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  openInAppBrowserIcon?: ReactElement;
  resolveOpenWithApplicationIcon?: (
    application: WorkspaceFileOpenWithApplication
  ) => ReactElement | null;
  showCopyAction: boolean;
  showImportAction: boolean;
  showExportAction: boolean;
  showOpenInAppBrowserAction: boolean;
  showOpenInDefaultBrowserAction: boolean;
  showOpenWithAction: boolean;
  showOpenWithOtherAction: boolean;
  showRevealInFolderAction: boolean;
  showRenameAction: boolean;
  revealInFolderLabel: string;
  openWithApplications: readonly WorkspaceFileOpenWithApplication[];
  openWithLoading: boolean;
  onClose: () => void;
  onCreateDirectory: () => void;
  onCreateFile: () => void;
  onCopy: () => Promise<void>;
  onCopyPath: () => Promise<void>;
  onDelete: () => void;
  onExport: () => Promise<void>;
  onOpen: () => Promise<void>;
  onOpenInAppBrowser: () => Promise<void>;
  onOpenInDefaultBrowser: () => Promise<void>;
  onOpenWithApplication: (applicationPath: string) => Promise<void>;
  onOpenWithOtherApplication: () => Promise<void>;
  onImport: () => Promise<void>;
  onRevealInFolder: () => Promise<void>;
  onRename: () => void;
}): ReactElement | null {
  const [position, setPosition] = useState({
    x: contextMenu?.x ?? 0,
    y: contextMenu?.y ?? 0
  });

  useLayoutEffect(() => {
    if (!contextMenu) {
      return;
    }

    setPosition({ x: contextMenu.x, y: contextMenu.y });
  }, [contextMenu?.x, contextMenu?.y]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      return;
    }

    const menu = contextMenuRef.current;
    const boundary = menu?.closest("[data-workspace-file-manager]");
    if (!menu || !boundary) {
      return;
    }

    const boundaryRect = boundary.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    setPosition(
      clampContextMenuPosition({
        boundaryHeight: boundaryRect.height,
        boundaryWidth: boundaryRect.width,
        menuHeight: menuRect.height,
        menuWidth: menuRect.width,
        x: contextMenu.x,
        y: contextMenu.y
      })
    );
  }, [
    contextMenu,
    contextMenuRef,
    openWithApplications.length,
    openWithLoading,
    showCopyAction,
    showExportAction,
    showImportAction,
    showOpenInAppBrowserAction,
    showOpenInDefaultBrowserAction,
    showOpenWithAction,
    showOpenWithOtherAction,
    showRevealInFolderAction,
    showRenameAction
  ]);

  if (!contextMenu) {
    return null;
  }

  const entry = contextMenu.entry;
  const isDirectory = entry?.kind === "directory";
  const editItems: ContextMenuActionItem[] = [];
  const transferItems: ContextMenuActionItem[] = [];
  const dangerItems: ContextMenuActionItem[] = [];
  const createItems: ContextMenuActionItem[] = [];

  if (entry) {
    if (showRenameAction) {
      editItems.push({
        action: onRename,
        disabled: busy,
        icon: <EditIcon className="size-4" />,
        key: "rename",
        label: copy.t("renameLabel")
      });
    }
    if (showCopyAction) {
      editItems.push({
        action: onCopy,
        disabled: busy,
        icon: <CopyIcon className="size-4" />,
        key: "copy",
        label: copy.t("copyLabel")
      });
    }
    editItems.push({
      action: onCopyPath,
      disabled: busy,
      icon: <CopyIcon className="size-4" />,
      key: "copy-path",
      label: copy.t("copyPathLabel")
    });
    if (showRevealInFolderAction) {
      editItems.push({
        action: onRevealInFolder,
        disabled: busy,
        icon: <LocateFolderIcon className="size-4" />,
        key: "reveal-in-folder",
        label: revealInFolderLabel
      });
    }
    if (isDirectory && showImportAction) {
      transferItems.push({
        action: onImport,
        disabled: busy,
        icon: <ImportIcon className="size-4" />,
        key: "import",
        label: copy.t("importLabel")
      });
    }
    if (showExportAction) {
      transferItems.push({
        action: onExport,
        disabled: busy,
        icon: <DownloadIcon className="size-4" />,
        key: "export",
        label: copy.t("downloadLabel")
      });
    }
    dangerItems.push({
      action: onDelete,
      disabled: busy,
      danger: true,
      icon: <DeleteIcon className="size-4" />,
      key: "delete",
      label: copy.t("deleteLabel")
    });
  } else {
    createItems.push({
      action: onCreateFile,
      disabled: busy,
      icon: <NewWorkspaceLinedIcon className="size-4" />,
      key: "create-file",
      label: copy.t("createFileLabel")
    });
    createItems.push({
      action: onCreateDirectory,
      disabled: busy,
      icon: <FileLinedIcon className="size-4" />,
      key: "create-directory",
      label: copy.t("createDirectoryLabel")
    });
    if (showImportAction) {
      transferItems.push({
        action: onImport,
        disabled: busy,
        icon: <ImportIcon className="size-4" />,
        key: "import",
        label: copy.t("importLabel")
      });
    }
  }
  const menuGroups: Array<{
    items: readonly ContextMenuActionItem[];
    key: string;
  }> = entry
    ? [
        { items: editItems, key: "edit" },
        { items: transferItems, key: "transfer" },
        { items: dangerItems, key: "danger" }
      ]
    : [
        { items: createItems, key: "create" },
        { items: transferItems, key: "transfer" }
      ];
  const visibleMenuGroups = menuGroups.filter(
    (group) => group.items.length > 0
  );

  return (
    <MenuSurface
      ref={contextMenuRef}
      className="absolute w-[220px] overflow-visible p-1"
      role="menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: "calc(var(--workspace-file-manager-dialog-overlay-z-index) - 1)"
      }}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      {entry ? (
        <ContextMenuActionButton
          disabled={busy}
          icon={<EyeIcon className="size-4" />}
          label={copy.t("openLabel")}
          onClick={() => {
            onClose();
            void onOpen();
          }}
        />
      ) : null}
      {entry && showOpenWithAction ? (
        <OpenWithMenuItem
          applications={openWithApplications}
          busy={busy}
          copy={copy}
          isLoading={openWithLoading}
          openInAppBrowserIcon={openInAppBrowserIcon}
          resolveOpenWithApplicationIcon={resolveOpenWithApplicationIcon}
          showOpenInAppBrowser={showOpenInAppBrowserAction}
          showOpenInDefaultBrowser={showOpenInDefaultBrowserAction}
          showOpenWithOther={showOpenWithOtherAction}
          onClose={onClose}
          onOpenInAppBrowser={onOpenInAppBrowser}
          onOpenInDefaultBrowser={onOpenInDefaultBrowser}
          onOpenWithApplication={onOpenWithApplication}
          onOpenWithOtherApplication={onOpenWithOtherApplication}
        />
      ) : null}
      {visibleMenuGroups.map((group, groupIndex) => (
        <ContextMenuActionGroup
          key={group.key}
          items={group.items}
          showDivider={entry !== null || groupIndex > 0}
          onClose={onClose}
        />
      ))}
    </MenuSurface>
  );
}

interface ContextMenuActionItem {
  action: () => Promise<void> | void;
  disabled?: boolean;
  danger?: boolean;
  icon: ReactElement;
  key: string;
  label: string;
}

function ContextMenuActionGroup({
  items,
  onClose,
  showDivider
}: {
  items: readonly ContextMenuActionItem[];
  onClose: () => void;
  showDivider: boolean;
}): ReactElement {
  return (
    <>
      {showDivider ? <ContextMenuDivider /> : null}
      {items.map((item) => (
        <ContextMenuActionButton
          key={item.key}
          danger={item.danger}
          disabled={item.disabled}
          icon={item.icon}
          label={item.label}
          onClick={() => {
            onClose();
            void item.action();
          }}
        />
      ))}
    </>
  );
}

function ContextMenuActionButton({
  danger = false,
  disabled = false,
  icon,
  label,
  onClick
}: {
  danger?: boolean;
  disabled?: boolean;
  icon: ReactElement;
  label: string;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[13px] transition-colors disabled:cursor-default disabled:opacity-50",
        danger
          ? "text-[var(--state-danger)] hover:bg-[var(--on-danger)]"
          : "text-[var(--text-primary)] hover:bg-transparency-block"
      )}
      disabled={disabled}
      role="menuitem"
      type="button"
      onClick={onClick}
    >
      <span
        className={cn(
          "grid size-4 flex-none place-items-center",
          danger ? "text-[var(--state-danger)]" : "text-[var(--text-secondary)]"
        )}
      >
        {icon}
      </span>
      {label}
    </button>
  );
}

function ContextMenuDivider(): ReactElement {
  return (
    <div className="mx-2 my-0.5 h-px bg-[var(--border-1)]" role="separator" />
  );
}

function OpenWithMenuItem({
  applications,
  busy,
  copy,
  isLoading,
  openInAppBrowserIcon,
  resolveOpenWithApplicationIcon,
  showOpenInAppBrowser,
  showOpenInDefaultBrowser,
  showOpenWithOther,
  onClose,
  onOpenInAppBrowser,
  onOpenInDefaultBrowser,
  onOpenWithApplication,
  onOpenWithOtherApplication
}: {
  applications: readonly WorkspaceFileOpenWithApplication[];
  busy: boolean;
  copy: WorkspaceFileManagerI18nRuntime;
  isLoading: boolean;
  openInAppBrowserIcon?: ReactElement;
  resolveOpenWithApplicationIcon?: (
    application: WorkspaceFileOpenWithApplication
  ) => ReactElement | null;
  showOpenInAppBrowser: boolean;
  showOpenInDefaultBrowser: boolean;
  showOpenWithOther: boolean;
  onClose: () => void;
  onOpenInAppBrowser: () => Promise<void>;
  onOpenInDefaultBrowser: () => Promise<void>;
  onOpenWithApplication: (applicationPath: string) => Promise<void>;
  onOpenWithOtherApplication: () => Promise<void>;
}): ReactElement {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [placementPoint, setPlacementPoint] = useState({ x: 0, y: 0 });
  const closeTimerRef = useRef<number | null>(null);
  const showExternalSection =
    showOpenInDefaultBrowser ||
    showOpenWithOther ||
    isLoading ||
    applications.length > 0;
  const estimatedSubmenuHeight = estimateOpenWithSubmenuHeight({
    applicationCount: applications.length,
    isLoading,
    showExternalSection,
    showOpenInAppBrowser,
    showOpenInDefaultBrowser,
    showOpenWithOther
  });

  const cancelClose = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 120);
  }, [cancelClose]);

  const openSubmenu = useCallback(() => {
    cancelClose();
    setOpen(true);
  }, [cancelClose]);

  useEffect(() => {
    return () => {
      cancelClose();
    };
  }, [cancelClose]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    setPlacementPoint({
      x: rect.right + CONTEXT_MENU_SUBMENU_GAP_PX,
      y: rect.top
    });
  }, [open, estimatedSubmenuHeight]);

  return (
    <div
      ref={triggerRef}
      className="relative"
      onPointerEnter={openSubmenu}
      onPointerLeave={scheduleClose}
    >
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "flex h-8 w-full items-center gap-2 rounded-md border-0 bg-transparent px-2 text-left text-[13px] text-[var(--text-primary)] transition-colors hover:bg-transparency-block disabled:cursor-default disabled:opacity-50",
          open && "bg-transparency-block"
        )}
        disabled={busy}
        role="menuitem"
        type="button"
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) {
              cancelClose();
            }
            return next;
          });
        }}
      >
        <span className="grid size-4 flex-none place-items-center text-[var(--text-secondary)]">
          <LaunchIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate">
          {copy.t("openWithLabel")}
        </span>
        <span
          aria-hidden="true"
          className="grid size-4 flex-none place-items-center text-[var(--text-tertiary)]"
        >
          <ArrowRightIcon className="size-4" />
        </span>
      </button>
      <ViewportMenuSurface
        data-workspace-file-manager-submenu=""
        open={open}
        className="w-[220px] max-h-[min(480px,calc(100vh-24px))] overflow-y-auto p-1"
        dismissOnEscape={false}
        dismissOnPointerDownOutside={false}
        dismissOnScroll={false}
        placement={{
          type: "point",
          point: placementPoint,
          alignX: "start",
          alignY: "auto",
          estimatedSize: {
            width: 220,
            height: estimatedSubmenuHeight
          }
        }}
        role="menu"
        onPointerEnter={openSubmenu}
        onPointerLeave={scheduleClose}
      >
        {showOpenInAppBrowser ? (
          <ContextMenuActionButton
            disabled={busy}
            icon={openInAppBrowserIcon ?? <WebIcon className="size-4" />}
            label={copy.t("openInAppBrowserLabel")}
            onClick={() => {
              onClose();
              void onOpenInAppBrowser();
            }}
          />
        ) : null}
        {showExternalSection ? <ContextMenuDivider /> : null}
        {isLoading ? (
          <div className="px-2 py-1.5 text-[11px] text-[var(--text-tertiary)]">
            {copy.t("openWithLoadingLabel")}
          </div>
        ) : null}
        {applications.map((application) => {
          const resolvedIcon = resolveOpenWithApplicationIcon?.(application);

          return (
            <ContextMenuActionButton
              key={application.applicationPath}
              disabled={busy}
              icon={
                resolvedIcon ??
                (application.iconDataUrl ? (
                  <img
                    alt=""
                    className="size-4 rounded-[4px] object-contain"
                    src={application.iconDataUrl}
                  />
                ) : (
                  <EyeIcon className="size-4" />
                ))
              }
              label={application.name}
              onClick={() => {
                onClose();
                void onOpenWithApplication(application.applicationPath);
              }}
            />
          );
        })}
        {showOpenInDefaultBrowser ? (
          <ContextMenuActionButton
            disabled={busy}
            icon={<WebIcon className="size-4" />}
            label={copy.t("openInDefaultBrowserLabel")}
            onClick={() => {
              onClose();
              void onOpenInDefaultBrowser();
            }}
          />
        ) : null}
        {showOpenWithOther ? (
          <ContextMenuActionButton
            disabled={busy}
            icon={<LaunchIcon className="size-4" />}
            label={copy.t("openWithOtherLabel")}
            onClick={() => {
              onClose();
              void onOpenWithOtherApplication();
            }}
          />
        ) : null}
      </ViewportMenuSurface>
    </div>
  );
}

export function WorkspaceFileManagerCreateDialog({
  busy,
  copy,
  dialog,
  onClose,
  onConfirm,
  onNameChange
}: {
  busy: boolean;
  copy: WorkspaceFileManagerI18nRuntime;
  dialog: {
    errorMessage: string | null;
    kind: "directory" | "file";
    name: string;
  } | null;
  onClose: () => void;
  onConfirm: () => void;
  onNameChange: (name: string) => void;
}): ReactElement | null {
  if (!dialog) {
    return null;
  }

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent aria-busy={busy} showCloseButton={false}>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog.kind === "directory"
                ? copy.t("createDirectoryLabel")
                : copy.t("createFileLabel")}
            </DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={
              dialog.kind === "directory"
                ? copy.t("createDirectoryPlaceholder")
                : copy.t("createFilePlaceholder")
            }
            value={dialog.name}
            onChange={(event) => {
              onNameChange(event.currentTarget.value);
            }}
          />
          {dialog.errorMessage ? (
            <p className="text-[13px] text-[var(--state-danger)]">
              {dialog.errorMessage}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              disabled={busy}
              size="dialog"
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              {copy.t("cancelLabel")}
            </Button>
            <Button disabled={busy} size="dialog" type="submit">
              {copy.t("createActionLabel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceFileManagerDeleteDialog({
  busy,
  copy,
  entry,
  onClose,
  onConfirm
}: {
  busy: boolean;
  copy: WorkspaceFileManagerI18nRuntime;
  entry: WorkspaceFileEntry | null;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement | null {
  if (!entry) {
    return null;
  }

  return (
    <ConfirmationDialog
      cancelLabel={copy.t("cancelLabel")}
      confirmBusy={busy}
      confirmLabel={busy ? copy.t("deletingLabel") : copy.t("deleteLabel")}
      description={copy.t("deleteConfirmDescription", { name: entry.name })}
      open
      title={copy.t("deleteLabel")}
      tone="destructive"
      onConfirm={onConfirm}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    />
  );
}

export function WorkspaceFileManagerUnsupportedDialog({
  copy,
  dialog,
  isViewing,
  onAction,
  onClose
}: {
  copy: WorkspaceFileManagerI18nRuntime;
  dialog: {
    actions?: WorkspaceFileManagerHostFallbackAction[] | null;
    kind: "import" | "view";
    message?: string | null;
    title?: string | null;
    entry?: WorkspaceFileEntry;
  } | null;
  isViewing: boolean;
  onAction: (action: WorkspaceFileManagerHostFallbackAction) => void;
  onClose: () => void;
}): ReactElement | null {
  if (!dialog) {
    return null;
  }

  const title =
    dialog.title ??
    (dialog.kind === "import"
      ? copy.t("unsupportedImportTitle")
      : copy.t("unsupportedViewTitle"));
  const body =
    dialog.message ??
    (dialog.kind === "import"
      ? copy.t("unsupportedImportBody")
      : copy.t("unsupportedViewBody", { name: dialog.entry?.name ?? "" }));
  const actions =
    dialog.actions?.filter((action) => action.kind !== "none") ?? [];

  return (
    <Dialog
      open
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => {
          if (isViewing) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (isViewing) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            disabled={isViewing}
            size="dialog"
            type="button"
            variant="ghost"
            onClick={onClose}
          >
            {copy.t("closeLabel")}
          </Button>
          {actions.map((action) => (
            <Button
              key={action.kind}
              disabled={isViewing}
              size="dialog"
              type="button"
              className="shadow-none"
              onClick={() => {
                onAction(action);
              }}
            >
              {action.label ??
                (action.kind === "download"
                  ? copy.t("downloadLabel")
                  : copy.t("openLabel"))}
            </Button>
          ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceFileManagerImportConflictDialog({
  busy,
  copy,
  dialog,
  onClose,
  onConfirm
}: {
  busy: boolean;
  copy: WorkspaceFileManagerI18nRuntime;
  dialog: WorkspaceFileManagerHostImportConflict | null;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement | null {
  if (!dialog) {
    return null;
  }

  const hasBlockedConflict = dialog.conflicts.some(
    (conflict) => conflict.conflictKind === "type_mismatch"
  );

  return (
    <ConfirmationDialog
      cancelLabel={
        hasBlockedConflict ? copy.t("closeLabel") : copy.t("cancelLabel")
      }
      className="max-w-lg"
      confirmBusy={busy}
      confirmLabel={
        hasBlockedConflict
          ? copy.t("closeLabel")
          : copy.t("importConflictReplaceLabel")
      }
      description={
        hasBlockedConflict
          ? copy.t("importTypeConflictDescription", {
              count: dialog.conflicts.length
            })
          : copy.t("importConflictDescription", {
              count: dialog.conflicts.length
            })
      }
      hideConfirmButton={hasBlockedConflict}
      open
      title={
        hasBlockedConflict
          ? copy.t("importTypeConflictTitle")
          : copy.t("importConflictTitle")
      }
      tone={hasBlockedConflict ? "default" : "destructive"}
      onConfirm={hasBlockedConflict ? onClose : onConfirm}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
    >
      <ImportConflictSummary copy={copy} dialog={dialog} />
      <div className="max-h-60 overflow-auto rounded-lg border border-[var(--border-1)] bg-transparency-block">
        <div className="divide-y divide-[var(--border-1)]">
          {dialog.conflicts.map((conflict) => (
            <div
              key={`${conflict.destinationPath}:${conflict.sourcePath}`}
              className="flex flex-col gap-1 px-4 py-3 text-[13px]"
            >
              <span className="font-medium text-[var(--text-primary)]">
                {conflict.name}
              </span>
              <span className="text-[11px] text-[var(--text-secondary)]">
                {copy.t("importConflictReviewLabel")}:{" "}
                {conflict.destinationPath}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ConfirmationDialog>
  );
}

function ImportConflictSummary({
  copy,
  dialog
}: {
  copy: WorkspaceFileManagerI18nRuntime;
  dialog: WorkspaceFileManagerHostImportConflict;
}): ReactElement | null {
  const summaryItems: string[] = [];
  const hasReasonBreakdown =
    dialog.summary?.reasonBreakdown?.some((reason) => reason.count > 0) ??
    false;
  if (
    typeof dialog.summary?.selectedCount === "number" &&
    dialog.summary.selectedCount > 0
  ) {
    summaryItems.push(
      copy.t("importConflictSummarySelected", {
        count: dialog.summary.selectedCount
      })
    );
  }
  if (
    !hasReasonBreakdown &&
    typeof dialog.summary?.filteredCount === "number" &&
    dialog.summary.filteredCount > 0
  ) {
    summaryItems.push(
      copy.t("importConflictSummaryFiltered", {
        count: dialog.summary.filteredCount
      })
    );
  }
  if (
    !hasReasonBreakdown &&
    typeof dialog.summary?.ignoredCount === "number" &&
    dialog.summary.ignoredCount > 0
  ) {
    summaryItems.push(
      copy.t("importConflictSummaryIgnored", {
        count: dialog.summary.ignoredCount
      })
    );
  }
  for (const reason of dialog.summary?.reasonBreakdown ?? []) {
    if (reason.count <= 0) {
      continue;
    }
    const copyKey = importSummaryReasonCopyKey(reason.reason);
    if (!copyKey) {
      continue;
    }
    summaryItems.push(copy.t(copyKey, { count: reason.count }));
  }

  if (summaryItems.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 text-[11px] text-[var(--text-secondary)]">
      {summaryItems.map((item) => (
        <span
          key={item}
          className="rounded-md border border-[var(--border-1)] px-2 py-1"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function importSummaryReasonCopyKey(
  reason: WorkspaceFileImportSummaryReason
): WorkspaceFileManagerI18nKey | null {
  switch (reason) {
    case "ignored":
      return "importConflictSummaryReasonIgnored";
    case "symlink":
      return "importConflictSummaryReasonSymlink";
    case "system_metadata":
      return "importConflictSummaryReasonSystemMetadata";
  }
}
