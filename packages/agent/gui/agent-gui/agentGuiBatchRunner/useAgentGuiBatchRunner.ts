import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAgentHostApi } from "../../agentActivityHost";
import { useAgentActivityRuntime } from "../../agentActivityRuntime";
import type { AgentActivitySession } from "@tutti-os/agent-activity-core";
import type {
  AgentGuiBatchPromptCase,
  AgentGuiBatchRunCaseResult,
  AgentGuiBatchRunExportResult,
  AgentGuiBatchRunnerProvider
} from "../../shared/contracts/dto";
import type {
  AgentSessionComposerSettings,
  AgentSessionState
} from "../../shared/agentSessionTypes";
import { projectWorkspaceAgentMessagesToTimelineItems } from "../../shared/agentConversation/projection/workspaceAgentMessageProjection";
import { loadWorkspaceAgentSessionMessagePages } from "../../host/workspaceAgentSessionMessages";
import type { AgentGuiI18nLocale } from "../../i18n/index";
import type { WorkspaceAgentActivityTimelineItem } from "../../shared/workspaceAgentActivityTypes";
import builtInPromptCasesJsonl from "./agentGuiBatchBuiltInCases.jsonl?raw";
import builtInPromptCasesZhCNJsonl from "./agentGuiBatchBuiltInCases.zh-CN.jsonl?raw";
import {
  parseAgentGuiBatchJsonl,
  type AgentGuiBatchJsonlParseError
} from "./agentGuiBatchJsonl";

export const AGENT_GUI_BATCH_RUNNER_LOG_PREFIX = "[agent-gui-batch-runner]";

export const AGENT_GUI_BATCH_RUNNER_PROVIDERS: AgentGuiBatchRunnerProvider[] = [
  "codex",
  "claude-code",
  "nexight",
  "hermes",
  "openclaw"
];

type RunnerStatus =
  | "idle"
  | "ready"
  | "running"
  | "completed"
  | "blocked"
  | "error"
  | "exporting";

interface SelectedPromptFile {
  name: string;
  path: string;
  source: "builtin" | "local";
}

interface UseAgentGuiBatchRunnerInput {
  locale?: AgentGuiI18nLocale;
  workspaceId: string;
  workspacePath: string | null | undefined;
  initialProviders?: readonly string[];
}

interface CaseTerminalObservation {
  status: AgentGuiBatchRunCaseResult["status"];
  error?: string;
}

export type AgentGuiBatchSelectedResultKey = string;

export interface AgentGuiBatchSessionTimelineState {
  timelineItems: WorkspaceAgentActivityTimelineItem[];
  loading: boolean;
  error: string | null;
  lastLoadedAtUnixMs: number | null;
}

export interface UseAgentGuiBatchRunnerResult {
  batchId: string | null;
  selectedFile: SelectedPromptFile | null;
  selectedProviders: AgentGuiBatchRunnerProvider[];
  status: RunnerStatus;
  cases: AgentGuiBatchPromptCase[];
  parseErrors: AgentGuiBatchJsonlParseError[];
  results: AgentGuiBatchRunCaseResult[];
  sessionTimelines: Record<
    AgentGuiBatchSelectedResultKey,
    AgentGuiBatchSessionTimelineState
  >;
  exportResult: AgentGuiBatchRunExportResult | null;
  error: string | null;
  isRunnable: boolean;
  isExportable: boolean;
  toggleSelectedProvider: (provider: AgentGuiBatchRunnerProvider) => void;
  selectPromptFile: () => Promise<void>;
  selectBuiltInPromptFile: () => void;
  loadSessionTimeline: (result: AgentGuiBatchRunCaseResult) => Promise<void>;
  run: () => Promise<void>;
  exportRun: () => Promise<void>;
}

const BUILT_IN_PROMPT_FILE: SelectedPromptFile = {
  name: "agent-gui-batch-built-in-cases.jsonl",
  path: "packages/agent/gui/agent-gui/agentGuiBatchRunner/agentGuiBatchBuiltInCases.jsonl",
  source: "builtin"
};

const CASE_POLL_INTERVAL_MS = 2000;
const CASE_TIMEOUT_MS = 45 * 60 * 1000;
const SESSION_TIMELINE_PAGE_LIMIT = 50;
const SESSION_TIMELINE_MAX_PAGES = 10;

function builtInPromptCasesForLocale(locale: AgentGuiI18nLocale): string {
  return locale === "zh-CN"
    ? builtInPromptCasesZhCNJsonl
    : builtInPromptCasesJsonl;
}

function logAgentGuiBatchRunner(
  event: string,
  details: Record<string, unknown>,
  level: "info" | "error" = "info"
): void {
  const payload = JSON.stringify({ event, ...details });
  if (level === "error") {
    console.error(AGENT_GUI_BATCH_RUNNER_LOG_PREFIX, payload);
    return;
  }
  console.info(AGENT_GUI_BATCH_RUNNER_LOG_PREFIX, payload);
}

function generateBatchRunnerId(prefix: string): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return `${prefix}-${randomUUID}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function generateBatchRunnerSessionId(): string {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return randomUUID;
  }
  const fallbackHex = Math.random().toString(16).slice(2).padEnd(12, "0");
  return `00000000-0000-4000-8000-${fallbackHex.slice(0, 12)}`;
}

function localPathToFileUri(path: string): string {
  const segments = path
    .split("/")
    .map((segment) => encodeURIComponent(segment));
  return `file://${segments.join("/")}`;
}

function localFileNameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function isSupportedBatchProvider(
  provider: string
): provider is AgentGuiBatchRunnerProvider {
  return AGENT_GUI_BATCH_RUNNER_PROVIDERS.includes(
    provider as AgentGuiBatchRunnerProvider
  );
}

function normalizeInitialProviders(
  providers: readonly string[] | null | undefined
): AgentGuiBatchRunnerProvider[] {
  const selected = (providers ?? []).filter(isSupportedBatchProvider);
  const deduped = AGENT_GUI_BATCH_RUNNER_PROVIDERS.filter((provider) =>
    selected.includes(provider)
  );
  return deduped.length > 0 ? deduped : ["codex"];
}

function normalizeStatusFromState(
  state: AgentSessionState
): CaseTerminalObservation | null {
  if (state.pendingInteractive) {
    return {
      status: "blocked",
      error: JSON.stringify({
        kind: state.pendingInteractive.kind,
        requestId: state.pendingInteractive.requestId ?? null,
        status: state.pendingInteractive.status ?? null
      })
    };
  }

  switch (state.status) {
    case "failed":
      return { status: "failed" };
    case "canceled":
      return { status: "canceled" };
    case "completed":
    case "ready":
      return { status: "completed" };
    case "working":
    default:
      return null;
  }
}

function normalizeStatusFromActivitySession(
  session: AgentActivitySession | null | undefined
): CaseTerminalObservation | null {
  const status = session?.status?.trim().toLowerCase();
  switch (status) {
    case "failed":
      return {
        status: "failed",
        error: session?.lastError?.trim() || undefined
      };
    case "canceled":
      return { status: "canceled" };
    case "completed":
    case "ready":
      return { status: "completed" };
    default:
      return null;
  }
}

function caseTitle(batchCase: AgentGuiBatchPromptCase): string | null {
  return batchCase.title?.trim() || batchCase.id;
}

function buildSessionSettings(
  batchCase: AgentGuiBatchPromptCase
): AgentSessionComposerSettings {
  return {
    permissionModeId: "full-access",
    ...(batchCase.settings ?? {})
  };
}

export function agentGuiBatchRunCaseResultKey(
  result: Pick<AgentGuiBatchRunCaseResult, "provider" | "id" | "line">
): AgentGuiBatchSelectedResultKey {
  return `${result.provider}:${result.line}:${result.id}`;
}

export function mergeAgentGuiBatchSessionTimelineItems(
  previous: readonly WorkspaceAgentActivityTimelineItem[],
  incoming: readonly WorkspaceAgentActivityTimelineItem[]
): WorkspaceAgentActivityTimelineItem[] {
  const byKey = new Map<string, WorkspaceAgentActivityTimelineItem>();
  for (const item of [...previous, ...incoming]) {
    byKey.set(agentGuiBatchTimelineItemKey(item), item);
  }
  return [...byKey.values()].sort(compareAgentGuiBatchTimelineItemsAscending);
}

function agentGuiBatchTimelineItemKey(
  item: WorkspaceAgentActivityTimelineItem
): string {
  const eventId = item.eventId?.trim();
  if (eventId) {
    return `event:${eventId}`;
  }
  if (Number.isFinite(item.id) && item.id > 0) {
    return `id:${item.id}`;
  }
  const seq = item.seq ?? 0;
  return seq > 0
    ? `seq:${seq}`
    : `local:${item.itemType}:${item.occurredAtUnixMs ?? 0}`;
}

function compareAgentGuiBatchTimelineItemsAscending(
  left: WorkspaceAgentActivityTimelineItem,
  right: WorkspaceAgentActivityTimelineItem
): number {
  const leftTime = left.occurredAtUnixMs ?? left.createdAtUnixMs ?? 0;
  const rightTime = right.occurredAtUnixMs ?? right.createdAtUnixMs ?? 0;
  return (
    leftTime - rightTime ||
    (left.id ?? 0) - (right.id ?? 0) ||
    left.eventId.localeCompare(right.eventId)
  );
}

function sessionTimelineIdCandidates(
  result: AgentGuiBatchRunCaseResult
): string[] {
  const candidates = [result.agentSessionId, result.providerSessionId];
  const seen = new Set<string>();
  return candidates.flatMap((candidate) => {
    const normalized = candidate?.trim() ?? "";
    if (!normalized || seen.has(normalized)) {
      return [];
    }
    seen.add(normalized);
    return [normalized];
  });
}

export function useAgentGuiBatchRunner({
  locale = "en",
  workspaceId,
  workspacePath,
  initialProviders
}: UseAgentGuiBatchRunnerInput): UseAgentGuiBatchRunnerResult {
  const agentActivityRuntime = useAgentActivityRuntime();
  const agentHostApi = useAgentHostApi();
  const [batchId, setBatchId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<SelectedPromptFile | null>(
    null
  );
  const [selectedProviders, setSelectedProviders] = useState<
    AgentGuiBatchRunnerProvider[]
  >(() => normalizeInitialProviders(initialProviders));
  const [status, setStatus] = useState<RunnerStatus>("idle");
  const [cases, setCases] = useState<AgentGuiBatchPromptCase[]>([]);
  const [parseErrors, setParseErrors] = useState<
    AgentGuiBatchJsonlParseError[]
  >([]);
  const [results, setResults] = useState<AgentGuiBatchRunCaseResult[]>([]);
  const [sessionTimelines, setSessionTimelines] = useState<
    Record<AgentGuiBatchSelectedResultKey, AgentGuiBatchSessionTimelineState>
  >({});
  const [exportResult, setExportResult] =
    useState<AgentGuiBatchRunExportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runStartedAtRef = useRef<number | null>(null);
  const runCompletedAtRef = useRef<number | null>(null);
  const selectedBuiltInLocaleRef = useRef<AgentGuiI18nLocale | null>(null);

  const updateResult = useCallback((next: AgentGuiBatchRunCaseResult): void => {
    setResults((previous) =>
      previous.map((result) =>
        result.id === next.id &&
        result.line === next.line &&
        result.provider === next.provider
          ? next
          : result
      )
    );
  }, []);

  const mergeSessionTimelineItems = useCallback(
    (
      resultKey: AgentGuiBatchSelectedResultKey,
      incomingItems: readonly WorkspaceAgentActivityTimelineItem[]
    ): void => {
      if (incomingItems.length === 0) {
        return;
      }
      setSessionTimelines((previous) => {
        const current = previous[resultKey];
        const timelineItems = mergeAgentGuiBatchSessionTimelineItems(
          current?.timelineItems ?? [],
          incomingItems
        );
        return {
          ...previous,
          [resultKey]: {
            timelineItems,
            loading: current?.loading ?? false,
            error: null,
            lastLoadedAtUnixMs: current?.lastLoadedAtUnixMs ?? null
          }
        };
      });
    },
    []
  );

  const listSessionMessagesForBatch = useCallback(
    async (input: {
      afterVersion?: number;
      agentSessionId: string;
      beforeVersion?: number;
      limit?: number;
      order?: "asc" | "desc";
      workspaceId: string;
    }) =>
      agentActivityRuntime.listSessionMessages({
        workspaceId: input.workspaceId,
        agentSessionId: input.agentSessionId,
        afterVersion: input.afterVersion,
        beforeVersion: input.beforeVersion,
        limit: input.limit,
        order: input.order
      }),
    [agentActivityRuntime]
  );

  const loadSessionTimeline = useCallback(
    async (result: AgentGuiBatchRunCaseResult): Promise<void> => {
      const resultKey = agentGuiBatchRunCaseResultKey(result);
      const candidates = sessionTimelineIdCandidates(result);
      if (candidates.length === 0) {
        setSessionTimelines((previous) => ({
          ...previous,
          [resultKey]: {
            timelineItems: previous[resultKey]?.timelineItems ?? [],
            loading: false,
            error: null,
            lastLoadedAtUnixMs: Date.now()
          }
        }));
        return;
      }

      setSessionTimelines((previous) => ({
        ...previous,
        [resultKey]: {
          timelineItems: previous[resultKey]?.timelineItems ?? [],
          loading: true,
          error: null,
          lastLoadedAtUnixMs: previous[resultKey]?.lastLoadedAtUnixMs ?? null
        }
      }));

      const loadedItems: WorkspaceAgentActivityTimelineItem[] = [];
      const errors: string[] = [];
      for (const candidate of candidates) {
        try {
          // oxlint-disable-next-line no-await-in-loop -- session id candidates are ordered fallbacks for the same session.
          const messages = await loadWorkspaceAgentSessionMessagePages({
            workspaceId,
            agentSessionId: candidate,
            limit: SESSION_TIMELINE_PAGE_LIMIT,
            maxPages: SESSION_TIMELINE_MAX_PAGES,
            listSessionMessages: listSessionMessagesForBatch
          });
          loadedItems.push(
            ...projectWorkspaceAgentMessagesToTimelineItems(messages)
          );
        } catch (cause) {
          errors.push(cause instanceof Error ? cause.message : String(cause));
          logAgentGuiBatchRunner(
            "session-timeline-load-error",
            {
              workspaceId,
              caseId: result.id,
              provider: result.provider,
              requestedAgentSessionId: candidate,
              error: cause instanceof Error ? cause.message : String(cause)
            },
            "error"
          );
        }
      }

      setSessionTimelines((previous) => {
        const current = previous[resultKey];
        const timelineItems = mergeAgentGuiBatchSessionTimelineItems(
          current?.timelineItems ?? [],
          loadedItems
        );
        const allCandidatesFailed =
          loadedItems.length === 0 && errors.length === candidates.length;
        return {
          ...previous,
          [resultKey]: {
            timelineItems,
            loading: false,
            error: allCandidatesFailed ? errors.join("\n") : null,
            lastLoadedAtUnixMs: Date.now()
          }
        };
      });
    },
    [listSessionMessagesForBatch, workspaceId]
  );

  const toggleSelectedProvider = useCallback(
    (provider: AgentGuiBatchRunnerProvider): void => {
      setSelectedProviders((previous) => {
        if (previous.includes(provider)) {
          return previous.length <= 1
            ? previous
            : previous.filter((item) => item !== provider);
        }
        return AGENT_GUI_BATCH_RUNNER_PROVIDERS.filter(
          (candidate) => candidate === provider || previous.includes(candidate)
        );
      });
    },
    []
  );

  const applyPromptFileContent = useCallback(
    (file: SelectedPromptFile, content: string): void => {
      const parsed = parseAgentGuiBatchJsonl(content);
      if (file.source !== "builtin") {
        selectedBuiltInLocaleRef.current = null;
      }
      setSelectedFile(file);
      setCases(parsed.cases);
      setParseErrors(parsed.errors);
      setResults([]);
      setSessionTimelines({});
      setBatchId(null);
      setStatus(
        parsed.errors.length > 0 || parsed.cases.length === 0
          ? "error"
          : "ready"
      );
      setError(
        parsed.errors.length > 0
          ? null
          : parsed.cases.length === 0
            ? "empty-file"
            : null
      );
      logAgentGuiBatchRunner("select-file-complete", {
        workspaceId,
        path: file.path,
        source: file.source,
        caseCount: parsed.cases.length,
        errorCount: parsed.errors.length
      });
    },
    [workspaceId]
  );

  const selectPromptFile = useCallback(async (): Promise<void> => {
    setError(null);
    setExportResult(null);
    const selection = await agentHostApi.workspace.selectFiles({
      allowDirectories: false
    });
    const file = selection[0] ?? null;
    if (!file) {
      logAgentGuiBatchRunner("select-file-canceled", { workspaceId });
      return;
    }

    logAgentGuiBatchRunner("select-file-start", {
      workspaceId,
      path: file.path
    });
    const { content } = await agentHostApi.filesystem.readFileText({
      uri: localPathToFileUri(file.path)
    });
    applyPromptFileContent(
      {
        name: file.name ?? localFileNameFromPath(file.path),
        path: file.path,
        source: "local"
      },
      content
    );
  }, [
    agentHostApi.filesystem,
    agentHostApi.workspace,
    applyPromptFileContent,
    workspaceId
  ]);

  const selectBuiltInPromptFile = useCallback((): void => {
    setError(null);
    setExportResult(null);
    logAgentGuiBatchRunner("select-built-in-file-start", {
      workspaceId,
      path: BUILT_IN_PROMPT_FILE.path
    });
    selectedBuiltInLocaleRef.current = locale;
    applyPromptFileContent(
      BUILT_IN_PROMPT_FILE,
      builtInPromptCasesForLocale(locale)
    );
  }, [applyPromptFileContent, locale, workspaceId]);

  useEffect(() => {
    if (
      selectedFile?.source !== "builtin" ||
      selectedBuiltInLocaleRef.current === locale ||
      status === "running" ||
      status === "exporting"
    ) {
      return;
    }

    selectedBuiltInLocaleRef.current = locale;
    applyPromptFileContent(
      BUILT_IN_PROMPT_FILE,
      builtInPromptCasesForLocale(locale)
    );
  }, [applyPromptFileContent, locale, selectedFile?.source, status]);

  const runCase = useCallback(
    async (
      activeBatchId: string,
      provider: AgentGuiBatchRunnerProvider,
      batchCase: AgentGuiBatchPromptCase
    ): Promise<AgentGuiBatchRunCaseResult> => {
      const startedAtUnixMs = Date.now();
      const agentSessionId = generateBatchRunnerSessionId();
      const baseResult: AgentGuiBatchRunCaseResult = {
        id: batchCase.id,
        line: batchCase.line,
        title: caseTitle(batchCase),
        prompt: batchCase.prompt,
        status: "running",
        provider,
        agentSessionId,
        startedAtUnixMs
      };
      const resultKey = agentGuiBatchRunCaseResultKey(baseResult);
      updateResult(baseResult);
      logAgentGuiBatchRunner("case-start", {
        batchId: activeBatchId,
        workspaceId,
        provider,
        caseId: batchCase.id,
        line: batchCase.line,
        agentSessionId
      });

      let releaseSessionEvents: (() => void) | null = null;
      let unsubscribeSnapshot: (() => void) | null = null;
      let sentInput = true;
      let resolveObservation:
        | ((observation: CaseTerminalObservation) => void)
        | null = null;
      let pollIntervalId: number | null = null;
      const observationPromise = new Promise<CaseTerminalObservation>(
        (resolve) => {
          resolveObservation = resolve;
        }
      );

      try {
        const activation = await agentActivityRuntime.activateSession({
          mode: "new",
          workspaceId,
          agentSessionId,
          provider,
          cwd: workspacePath ?? "/workspace",
          initialContent: [{ type: "text", text: batchCase.prompt }],
          title: caseTitle(batchCase) ?? `Case ${batchCase.line}`,
          settings: buildSessionSettings(batchCase)
        });
        const providerSessionId = activation.session.providerSessionId;

        const handleRuntimeSnapshot = (): void => {
          const snapshot = agentActivityRuntime.getSnapshot(workspaceId);
          const messages = snapshot.sessionMessagesById[agentSessionId] ?? [];
          if (messages.length > 0) {
            mergeSessionTimelineItems(
              resultKey,
              projectWorkspaceAgentMessagesToTimelineItems(messages)
            );
          }
          if (!sentInput) {
            return;
          }
          const session = snapshot.sessions.find(
            (candidate) => candidate.agentSessionId === agentSessionId
          );
          const terminal = normalizeStatusFromActivitySession(session);
          if (terminal) {
            resolveObservation?.(terminal);
          }
        };

        const ensureSessionSynchronized =
          agentActivityRuntime.ensureSessionSynchronized ??
          agentActivityRuntime.retainSessionEvents;
        releaseSessionEvents = ensureSessionSynchronized({
          workspaceId,
          agentSessionId,
          onError: (cause) => {
            logAgentGuiBatchRunner(
              "case-retain-events-error",
              {
                batchId: activeBatchId,
                workspaceId,
                provider,
                caseId: batchCase.id,
                line: batchCase.line,
                agentSessionId,
                error: cause instanceof Error ? cause.message : String(cause)
              },
              "error"
            );
          }
        });
        unsubscribeSnapshot = agentActivityRuntime.subscribe(
          workspaceId,
          handleRuntimeSnapshot
        );
        handleRuntimeSnapshot();

        const runningResult: AgentGuiBatchRunCaseResult = {
          ...baseResult,
          providerSessionId
        };
        updateResult(runningResult);

        const pollPromise = new Promise<CaseTerminalObservation>((resolve) => {
          const started = Date.now();
          pollIntervalId = window.setInterval(() => {
            void agentActivityRuntime
              .getSessionControlState({
                workspaceId,
                agentSessionId
              })
              .then((state) => {
                const terminal = normalizeStatusFromState(state);
                if (terminal) {
                  if (pollIntervalId !== null) {
                    window.clearInterval(pollIntervalId);
                    pollIntervalId = null;
                  }
                  resolve(terminal);
                  return;
                }
                if (Date.now() - started > CASE_TIMEOUT_MS) {
                  if (pollIntervalId !== null) {
                    window.clearInterval(pollIntervalId);
                    pollIntervalId = null;
                  }
                  resolve({
                    status: "error",
                    error: JSON.stringify({
                      reason: "timeout",
                      timeoutMs: CASE_TIMEOUT_MS
                    })
                  });
                }
              })
              .catch((cause) => {
                if (pollIntervalId !== null) {
                  window.clearInterval(pollIntervalId);
                  pollIntervalId = null;
                }
                resolve({
                  status: "error",
                  error: cause instanceof Error ? cause.message : String(cause)
                });
              });
          }, CASE_POLL_INTERVAL_MS);
        });

        const terminal = await Promise.race([observationPromise, pollPromise]);
        if (pollIntervalId !== null) {
          window.clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        const completedAtUnixMs = Date.now();
        const finalResult: AgentGuiBatchRunCaseResult = {
          ...runningResult,
          status: terminal.status,
          completedAtUnixMs,
          durationMs: completedAtUnixMs - startedAtUnixMs,
          ...(terminal.error ? { error: terminal.error } : {})
        };
        updateResult(finalResult);
        logAgentGuiBatchRunner("case-complete", {
          batchId: activeBatchId,
          workspaceId,
          provider,
          caseId: batchCase.id,
          line: batchCase.line,
          agentSessionId,
          turnId: runningResult.turnId ?? null,
          status: finalResult.status,
          durationMs: finalResult.durationMs,
          error: finalResult.error ?? null
        });
        return finalResult;
      } catch (cause) {
        const completedAtUnixMs = Date.now();
        const finalResult: AgentGuiBatchRunCaseResult = {
          ...baseResult,
          status: "error",
          completedAtUnixMs,
          durationMs: completedAtUnixMs - startedAtUnixMs,
          error: cause instanceof Error ? cause.message : String(cause)
        };
        updateResult(finalResult);
        logAgentGuiBatchRunner(
          "case-error",
          {
            batchId: activeBatchId,
            workspaceId,
            provider,
            caseId: batchCase.id,
            line: batchCase.line,
            agentSessionId,
            error: finalResult.error
          },
          "error"
        );
        return finalResult;
      } finally {
        if (pollIntervalId !== null) {
          window.clearInterval(pollIntervalId);
        }
        unsubscribeSnapshot?.();
        releaseSessionEvents?.();
        void agentActivityRuntime
          .unactivateSession({
            workspaceId,
            agentSessionId
          })
          .catch((cause) => {
            logAgentGuiBatchRunner(
              "case-unactivate-error",
              {
                batchId: activeBatchId,
                workspaceId,
                provider,
                agentSessionId,
                error: cause instanceof Error ? cause.message : String(cause)
              },
              "error"
            );
          });
      }
    },
    [
      agentActivityRuntime,
      mergeSessionTimelineItems,
      updateResult,
      workspaceId,
      workspacePath
    ]
  );

  const run = useCallback(async (): Promise<void> => {
    if (cases.length === 0 || status === "running") {
      return;
    }
    const nextBatchId = generateBatchRunnerId("agent-gui-batch");
    const pendingResults = selectedProviders.flatMap((provider) =>
      cases.map<AgentGuiBatchRunCaseResult>((batchCase) => ({
        id: batchCase.id,
        line: batchCase.line,
        title: caseTitle(batchCase),
        prompt: batchCase.prompt,
        status: "pending",
        provider
      }))
    );
    runStartedAtRef.current = Date.now();
    runCompletedAtRef.current = null;
    setBatchId(nextBatchId);
    setResults(pendingResults);
    setSessionTimelines({});
    setExportResult(null);
    setError(null);
    setStatus("running");
    logAgentGuiBatchRunner("run-start", {
      batchId: nextBatchId,
      workspaceId,
      providers: selectedProviders,
      caseCount: cases.length,
      runCount: pendingResults.length
    });

    const finalResults: AgentGuiBatchRunCaseResult[] = [];
    for (const provider of selectedProviders) {
      for (const batchCase of cases) {
        // oxlint-disable-next-line no-await-in-loop -- batch cases intentionally run one fresh session at a time.
        const result = await runCase(nextBatchId, provider, batchCase);
        finalResults.push(result);
        if (result.status === "blocked") {
          setStatus("blocked");
          runCompletedAtRef.current = Date.now();
          logAgentGuiBatchRunner("run-blocked", {
            batchId: nextBatchId,
            workspaceId,
            provider,
            caseId: result.id,
            line: result.line,
            agentSessionId: result.agentSessionId ?? null
          });
          return;
        }
      }
    }

    const completedAtUnixMs = Date.now();
    runCompletedAtRef.current = completedAtUnixMs;
    setStatus("completed");
    logAgentGuiBatchRunner("run-complete", {
      batchId: nextBatchId,
      workspaceId,
      providers: selectedProviders,
      runCount: finalResults.length
    });
  }, [cases, runCase, selectedProviders, status, workspaceId]);

  const exportRun = useCallback(async (): Promise<void> => {
    if (!batchId || results.length === 0 || status === "running") {
      return;
    }
    setStatus("exporting");
    setError(null);
    logAgentGuiBatchRunner("export-start", {
      batchId,
      workspaceId,
      providers: selectedProviders,
      caseCount: results.length
    });
    try {
      const exported = await agentHostApi.agentGuiBatch.exportRun({
        batchId,
        workspaceId,
        workspacePath: workspacePath ?? null,
        providers: selectedProviders,
        sourceFileName: selectedFile?.name ?? null,
        sourceFilePath: selectedFile?.path ?? null,
        startedAtUnixMs: runStartedAtRef.current ?? undefined,
        completedAtUnixMs: runCompletedAtRef.current ?? undefined,
        cases: results
      });
      setExportResult(exported);
      setStatus(
        results.some((result) => result.status === "blocked")
          ? "blocked"
          : "completed"
      );
      logAgentGuiBatchRunner("export-complete", {
        batchId,
        workspaceId,
        providers: selectedProviders,
        filePath: exported.filePath,
        artifactCount: exported.artifactCount,
        fileCount: exported.fileCount
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setStatus("error");
      logAgentGuiBatchRunner(
        "export-error",
        { batchId, workspaceId, providers: selectedProviders, error: message },
        "error"
      );
    }
  }, [
    batchId,
    results,
    selectedFile,
    selectedProviders,
    status,
    workspaceId,
    workspacePath
  ]);

  const isRunnable = useMemo(
    () =>
      cases.length > 0 &&
      selectedProviders.length > 0 &&
      parseErrors.length === 0 &&
      status !== "running" &&
      status !== "exporting",
    [cases.length, parseErrors.length, selectedProviders.length, status]
  );
  const isExportable = useMemo(
    () =>
      Boolean(batchId) &&
      results.some((result) => Boolean(result.agentSessionId)) &&
      status !== "running" &&
      status !== "exporting",
    [batchId, results, status]
  );

  return {
    batchId,
    selectedFile,
    selectedProviders,
    status,
    cases,
    parseErrors,
    results,
    sessionTimelines,
    exportResult,
    error,
    isRunnable,
    isExportable,
    toggleSelectedProvider,
    selectPromptFile,
    selectBuiltInPromptFile,
    loadSessionTimeline,
    run,
    exportRun
  };
}
