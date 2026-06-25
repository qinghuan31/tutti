import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX
} from "react";
import { useSyncExternalStore } from "react";
import type {
  AgentProviderStatus,
  WorkspaceAgentProvider
} from "@tutti-os/client-tuttid-ts";
import {
  Button,
  CheckIcon,
  CopyIcon,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DownloadIcon,
  LoadingIcon,
  RefreshIcon,
  SuccessFilledIcon,
  WarningFilledIcon
} from "@tutti-os/ui-system";
import {
  readCodexSetupActiveAction,
  useAgentEnvPanelRequest,
  closeAgentEnvPanel,
  deriveAgentSetupStages,
  resolveWizardAutoStartAction,
  type AgentEnvPanelFocus,
  type AgentSetupStage,
  type AgentSetupStageId,
  type CodexSetupPhase,
  type CodexSetupStepStatus
} from "@tutti-os/agent-gui/agent-env";
import { useTranslation } from "@renderer/i18n";
import type { IAgentProviderStatusService } from "../services/agentProviderStatusService.interface";
import {
  desktopManagedAgentProviders,
  isDesktopManagedAgentProvider
} from "../services/internal/desktopManagedAgentProviders.ts";

interface AgentEnvPanelProps {
  agentProviderStatusService: IAgentProviderStatusService;
  workspaceId: string;
  workbenchHost?: unknown;
}

const PROVIDER_LABELS: Partial<Record<WorkspaceAgentProvider, string>> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  gemini: "Gemini",
  nexight: "Nexight",
  hermes: "Hermes",
  openclaw: "OpenClaw"
};

// Best-effort manual install command for the "install it yourself" escape hatch.
// The daemon owns the real install; this is only a copyable fallback.
const MANUAL_INSTALL_COMMANDS: Partial<Record<WorkspaceAgentProvider, string>> =
  {
    codex: "npm install -g @openai/codex",
    "claude-code": "npm install -g @anthropic-ai/claude-code"
  };

function resolveProviderLabel(provider: WorkspaceAgentProvider): string {
  return PROVIDER_LABELS[provider] ?? provider;
}

function useStatusSnapshot(service: IAgentProviderStatusService) {
  return useSyncExternalStore(
    (listener) => service.subscribe(listener),
    () => service.getSnapshot()
  );
}

/**
 * The deep-link focus picks which remediation the user landed for; it maps to a
 * primary action id so that button is emphasised when the panel opens.
 */
function focusToActionId(focus: AgentEnvPanelFocus | null): string | null {
  switch (focus) {
    case "install":
    case "repair":
    case "upgrade":
      return "install";
    case "auth":
      return "login";
    case "detect":
    case "network":
    case "registry":
      return "refresh";
    default:
      return null;
  }
}

function StepStatusIcon({
  status
}: {
  status: CodexSetupStepStatus;
}): JSX.Element {
  if (status === "ok") {
    return <SuccessFilledIcon className="size-4 text-[var(--tutti-purple)]" />;
  }
  if (status === "running") {
    return <LoadingIcon className="size-4 animate-spin" />;
  }
  if (status === "error") {
    return <WarningFilledIcon className="size-4 text-[var(--state-danger)]" />;
  }
  return (
    <span
      aria-hidden="true"
      className="size-4 rounded-full border border-[var(--border-1)]"
    />
  );
}

export function AgentEnvPanel({
  agentProviderStatusService,
  workspaceId,
  workbenchHost
}: AgentEnvPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const request = useAgentEnvPanelRequest();
  const snapshot = useStatusSnapshot(agentProviderStatusService);
  const [copied, setCopied] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const provider: WorkspaceAgentProvider = useMemo(() => {
    const requested = request.provider;
    if (requested && isDesktopManagedAgentProvider(requested)) {
      return requested;
    }
    if (
      snapshot.defaultProvider &&
      isDesktopManagedAgentProvider(snapshot.defaultProvider)
    ) {
      return snapshot.defaultProvider;
    }
    return desktopManagedAgentProviders.includes("codex")
      ? "codex"
      : desktopManagedAgentProviders[0];
  }, [request.provider, snapshot.defaultProvider]);

  const status: AgentProviderStatus | null = useMemo(
    () =>
      snapshot.statuses.find((entry) => entry.provider === provider) ?? null,
    [snapshot.statuses, provider]
  );

  const open = request.open;
  const providerLabel = resolveProviderLabel(provider);

  // Live detection: every open (or re-open via a fresh deep-link) re-checks the
  // provider so the mode is driven by reality, never a persisted install flag.
  useEffect(() => {
    if (!open) {
      return;
    }
    setCopied(false);
    setLogExpanded(false);
    void agentProviderStatusService.refresh([provider]);
  }, [open, provider, request.requestSequence, agentProviderStatusService]);

  const handleClose = useCallback((next: boolean) => {
    if (!next) {
      closeAgentEnvPanel();
    }
  }, []);

  const runAction = useCallback(
    (actionId: string) => {
      void agentProviderStatusService.runAction(provider, actionId, {
        workbenchHost,
        workspaceId
      });
    },
    [agentProviderStatusService, provider, workbenchHost, workspaceId]
  );

  const handleCopyManualCommand = useCallback(async (command: string) => {
    try {
      await navigator.clipboard?.writeText(command);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, []);

  const autoStartedSeqRef = useRef<number | null>(null);

  // Auto-start the focused remediation once detection settles, at most once per
  // open. The dock link / error card opened us with a focus; we run that action
  // for the user (decision A — the wizard takes over).
  //
  // The requestSequence ref below is the real re-entry guard: runAction mutates
  // the status snapshot (pending flag), which re-runs this effect, so the ref
  // must be set before runAction fires. The loginPending check inside
  // resolveWizardAutoStartAction is only best-effort — the desktop service does
  // not track "login" as a pending action, so that flag is effectively always
  // false here; do not weaken the ref guard on the assumption it covers re-entry.
  useEffect(() => {
    if (!open) {
      autoStartedSeqRef.current = null;
      return;
    }
    const seq = request.requestSequence;
    if (autoStartedSeqRef.current === seq) {
      return;
    }
    const liveStatus =
      snapshot.statuses.find((entry) => entry.provider === provider) ?? null;
    const action = resolveWizardAutoStartAction({
      focus: request.focus,
      detected: !snapshot.isLoading && liveStatus !== null,
      ready: liveStatus?.availability.status === "ready",
      installPending: agentProviderStatusService.isActionPending(
        provider,
        "install"
      ),
      loginPending: agentProviderStatusService.isActionPending(
        provider,
        "login"
      )
    });
    if (!action) {
      return;
    }
    autoStartedSeqRef.current = seq;
    runAction(action);
  }, [
    open,
    request.requestSequence,
    request.focus,
    snapshot.isLoading,
    snapshot.statuses,
    provider,
    agentProviderStatusService,
    runAction
  ]);

  // Do NOT early-return null when closed. This <Dialog> is a controlled Radix
  // dialog with disableOutsidePointerEvents; it must observe the open→false
  // transition to restore document.body pointer-events and the scroll lock.
  // Unmounting it while it still believes it is open strands the whole app
  // with `pointer-events: none` — clicks register nowhere and the wizard can
  // never be reopened until reload. Let the `open` prop drive visibility; the
  // DialogContent wrapper unmounts its own subtree after the close animation.

  const ready = status?.availability.status === "ready";
  const activeAction = readCodexSetupActiveAction(status);
  const installPending = agentProviderStatusService.isActionPending(
    provider,
    "install"
  );
  const loginPending = agentProviderStatusService.isActionPending(
    provider,
    "login"
  );
  const busy =
    installPending ||
    activeAction?.phase === "install" ||
    activeAction?.phase === "repair" ||
    activeAction?.phase === "verify";
  const primaryActionId = focusToActionId(request.focus);

  const versionTooOld = (status?.availability.reasonCode ?? "")
    .toLowerCase()
    .includes("version");
  const stages: AgentSetupStage[] = deriveAgentSetupStages({
    detected: status !== null,
    cliInstalled: status?.cli.installed ?? false,
    versionTooOld,
    authenticated: status?.auth.status === "authenticated",
    authRequired: status?.auth.status === "required",
    ready,
    activePhase: activeAction?.phase ?? null,
    loginPending,
    cliVersionDetail: status?.cli.version ?? null,
    accountDetail: status?.auth.accountLabel ?? null,
    labels: {
      detect: t("workspace.agentEnv.stageDetect"),
      install: t("workspace.agentEnv.stageInstall"),
      login: t("workspace.agentEnv.stageLogin"),
      ready: t("workspace.agentEnv.stageReady")
    }
  });

  const manualCommand = MANUAL_INSTALL_COMMANDS[provider] ?? null;
  const registry = activeAction?.registry ?? null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[min(640px,calc(100vh-32px))] flex-col gap-0 overflow-hidden bg-[var(--background-fronted)] p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b border-[var(--border-1)] px-5 py-4">
          <DialogTitle>
            {ready
              ? t("workspace.agentEnv.configTitle", { provider: providerLabel })
              : t("workspace.agentEnv.wizardTitle", {
                  provider: providerLabel
                })}
          </DialogTitle>
          <DialogDescription>
            {ready
              ? t("workspace.agentEnv.configDescription", {
                  provider: providerLabel
                })
              : t("workspace.agentEnv.wizardDescription", {
                  provider: providerLabel
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!isDesktopManagedAgentProvider(provider) ? (
            <p className="m-0 text-[13px] text-[var(--text-secondary)]">
              {t("workspace.agentEnv.providerUnsupported")}
            </p>
          ) : ready ? (
            <ConfigPanelBody status={status} registry={registry} t={t} />
          ) : (
            <WizardBody
              busy={Boolean(busy)}
              providerLabel={providerLabel}
              stages={stages}
              activePhase={activeAction?.phase ?? null}
              log={activeAction?.log ?? []}
              registry={registry}
              logExpanded={logExpanded}
              onToggleLog={() => setLogExpanded((value) => !value)}
              manualCommand={manualCommand}
              copied={copied}
              onCopyManualCommand={(command) =>
                void handleCopyManualCommand(command)
              }
              onRetryStage={(stageId) =>
                runAction(stageId === "login" ? "login" : "install")
              }
              error={activeAction?.error ?? null}
              t={t}
            />
          )}
        </div>

        <DialogFooter className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border-1)] px-5 py-4">
          <Button
            size="dialog"
            type="button"
            variant="ghost"
            disabled={snapshot.isLoading}
            onClick={() => void agentProviderStatusService.refresh([provider])}
          >
            <RefreshIcon className="size-4" />
            {t("workspace.agentEnv.actionDetect")}
          </Button>
          {ready ? (
            <>
              <Button
                size="dialog"
                type="button"
                variant={primaryActionId === "install" ? undefined : "ghost"}
                disabled={busy}
                onClick={() => runAction("install")}
              >
                {t("workspace.agentEnv.actionUpgrade")}
              </Button>
              <Button
                size="dialog"
                type="button"
                variant={primaryActionId === "login" ? undefined : "ghost"}
                disabled={loginPending}
                onClick={() => runAction("login")}
              >
                {t("workspace.agentEnv.actionRelogin")}
              </Button>
            </>
          ) : (
            <Button
              size="dialog"
              type="button"
              disabled={busy}
              onClick={() => runAction("install")}
            >
              {busy ? (
                <LoadingIcon className="size-4 animate-spin" />
              ) : (
                <DownloadIcon className="size-4" />
              )}
              {status?.cli.installed
                ? t("workspace.agentEnv.actionRepair")
                : t("workspace.agentEnv.actionInstall")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WizardBody({
  busy,
  providerLabel,
  stages,
  activePhase,
  log,
  registry,
  logExpanded,
  onToggleLog,
  manualCommand,
  copied,
  onCopyManualCommand,
  onRetryStage,
  error,
  t
}: {
  busy: boolean;
  providerLabel: string;
  stages: AgentSetupStage[];
  activePhase: CodexSetupPhase | null;
  log: string[];
  registry: string | null;
  logExpanded: boolean;
  onToggleLog: () => void;
  manualCommand: string | null;
  copied: boolean;
  onCopyManualCommand: (command: string) => void;
  onRetryStage: (stageId: AgentSetupStageId) => void;
  error: { code: string | null; message: string | null } | null;
  t: ReturnType<typeof useTranslation>["t"];
}): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[13px] text-[var(--text-secondary)]">
        {busy
          ? t("workspace.agentEnv.busyInstalling", { provider: providerLabel })
          : t("workspace.agentEnv.detecting", { provider: providerLabel })}
      </p>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {stages.map((stage) => {
          const isActive = stage.status === "running";
          const isError = stage.status === "error";
          const dimmed = stage.status === "pending";
          return (
            <li
              key={stage.id}
              data-stage={stage.id}
              data-status={stage.status}
              className={`flex items-start gap-2.5 rounded-[8px] bg-[var(--transparency-block)] p-3 ${
                dimmed ? "opacity-50" : ""
              }`}
            >
              <span className="mt-0.5 shrink-0">
                <StepStatusIcon status={stage.status} />
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block text-[13px] font-medium ${
                    isError
                      ? "text-[var(--state-danger)]"
                      : "text-[var(--text-primary)]"
                  }`}
                >
                  {stage.label}
                </span>
                {stage.detail ? (
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--text-secondary)]">
                    {stage.detail}
                  </span>
                ) : null}
                {isActive && log.length > 0 ? (
                  <pre className="mt-2 max-h-[160px] overflow-auto whitespace-pre-wrap break-words rounded-[6px] bg-[var(--background-fronted)] px-2 py-1.5 text-[11px] leading-5 text-[var(--text-secondary)]">
                    {log.join("\n")}
                  </pre>
                ) : null}
                {isError ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-2"
                    onClick={() => onRetryStage(stage.id)}
                  >
                    <RefreshIcon className="size-4" />
                    {t("workspace.agentEnv.stageRetry")}
                  </Button>
                ) : null}
              </span>
            </li>
          );
        })}
      </ol>

      {error?.message ? (
        <p className="m-0 text-[12px] text-[var(--state-danger)]">
          {t("workspace.agentEnv.actionFailed")}
        </p>
      ) : null}

      {(activePhase !== null || registry) && log.length > 0 ? (
        <div className="rounded-[8px] border border-[var(--border-1)]">
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent px-3 py-2 text-left text-[12px] font-semibold text-[var(--text-primary)]"
            aria-expanded={logExpanded}
            onClick={onToggleLog}
          >
            <span>{t("workspace.agentEnv.logToggle")}</span>
            {registry ? (
              <span className="text-[11px] font-normal text-[var(--text-secondary)]">
                {t("workspace.agentEnv.registryLabel")}: {registry}
              </span>
            ) : null}
          </button>
          {logExpanded ? (
            <pre className="m-0 max-h-[200px] overflow-auto whitespace-pre-wrap break-words border-t border-[var(--border-1)] px-3 py-2 text-[11px] leading-5 text-[var(--text-secondary)]">
              {log.length > 0 ? log.join("\n") : "—"}
            </pre>
          ) : null}
        </div>
      ) : null}

      {manualCommand ? (
        <div className="rounded-[8px] border border-[var(--border-1)] bg-[var(--transparency-block)] p-3">
          <strong className="text-[12px] font-semibold text-[var(--text-primary)]">
            {t("workspace.agentEnv.manualTitle")}
          </strong>
          <p className="mt-1 mb-2 text-[12px] text-[var(--text-secondary)]">
            {t("workspace.agentEnv.manualDescription")}
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-[6px] bg-[var(--background-fronted)] px-2 py-1.5 font-[var(--tsh-font-mono)] text-[12px] text-[var(--text-primary)]">
              {manualCommand}
            </code>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onCopyManualCommand(manualCommand)}
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
              {copied
                ? t("workspace.agentEnv.manualCopied")
                : t("workspace.agentEnv.manualCopy")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ConfigPanelBody({
  status,
  registry,
  t
}: {
  status: AgentProviderStatus | null;
  registry: string | null;
  t: ReturnType<typeof useTranslation>["t"];
}): JSX.Element {
  const unknown = t("workspace.agentEnv.valueUnknown");
  const rows: { label: string; value: string }[] = [
    {
      label: t("workspace.agentEnv.fieldVersion"),
      value: status?.cli.version ?? unknown
    },
    {
      label: t("workspace.agentEnv.fieldPath"),
      value: status?.cli.binaryPath ?? t("workspace.agentEnv.valueNotInstalled")
    },
    {
      label: t("workspace.agentEnv.fieldTargetNode"),
      value: status?.adapter.command?.join(" ") || unknown
    },
    {
      label: t("workspace.agentEnv.fieldAccount"),
      value:
        status?.auth.accountLabel ?? t("workspace.agentEnv.valueNotSignedIn")
    },
    {
      label: t("workspace.agentEnv.fieldRegistry"),
      value: registry ?? unknown
    }
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-[8px] bg-[var(--transparency-block)] p-3">
        <SuccessFilledIcon className="size-5 text-[var(--tutti-purple)]" />
        <span className="text-[13px] font-medium text-[var(--text-primary)]">
          {t("workspace.agentEnv.ready", {
            provider: status
              ? resolveProviderLabel(status.provider)
              : t("workspace.agentEnv.valueUnknown")
          })}
        </span>
      </div>
      <dl className="m-0 flex flex-col gap-2">
        {rows.map((row) => (
          <div
            key={row.label}
            className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-3"
          >
            <dt className="text-[12px] text-[var(--text-secondary)]">
              {row.label}
            </dt>
            <dd className="m-0 min-w-0 truncate text-[13px] text-[var(--text-primary)]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
