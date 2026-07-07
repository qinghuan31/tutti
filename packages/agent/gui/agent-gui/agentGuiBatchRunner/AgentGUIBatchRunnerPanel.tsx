import React from "react";
import {
  Bot,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  FileText,
  Filter,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Minus,
  Upload
} from "lucide-react";
import { Button } from "../../app/renderer/components/ui/button";
import { useTranslation } from "../../i18n/index";
import { managedAgentRoundedIconUrl } from "../../shared/managedAgentIcons";
import type {
  AgentGuiBatchRunCaseResult,
  AgentGuiBatchRunnerProvider
} from "../../shared/contracts/dto";
import {
  AgentGUIBatchRunnerSessionTab,
  buildAgentGuiBatchSessionDetail,
  getAgentGuiBatchSessionDiagnostics,
  type AgentGuiBatchSessionDiagnostics
} from "./AgentGUIBatchRunnerSessionTab";
import type { AgentGuiBatchJsonlParseError } from "./agentGuiBatchJsonl";
import {
  AGENT_GUI_BATCH_RUNNER_PROVIDERS,
  agentGuiBatchRunCaseResultKey,
  useAgentGuiBatchRunner
} from "./useAgentGuiBatchRunner";

interface AgentGUIBatchRunnerPanelProps {
  workspaceId: string;
  workspacePath: string | null | undefined;
  initialProviders?: readonly string[];
  onMinimize?: () => void;
  onHeaderPointerDown?: React.PointerEventHandler<HTMLDivElement>;
}

type BatchCaseStatus = AgentGuiBatchRunCaseResult["status"];
type BatchResultRow = AgentGuiBatchRunCaseResult;
type BatchRunnerView = "results" | "session";

const PAGE_SIZE = 10;

const providerLabelKeys: Record<AgentGuiBatchRunnerProvider, string> = {
  "claude-code": "agentHost.agentGui.batchRunnerProviderClaudeCode",
  codex: "agentHost.agentGui.batchRunnerProviderCodex",
  hermes: "agentHost.agentGui.batchRunnerProviderHermes",
  nexight: "agentHost.agentGui.batchRunnerProviderNexight",
  openclaw: "agentHost.agentGui.batchRunnerProviderOpenClaw",
  "tutti-agent": "agentHost.agentGui.batchRunnerProviderTuttiAgent"
};

const statusToneClassNames: Record<BatchCaseStatus, string> = {
  blocked: "border-amber-200 bg-amber-50 text-amber-700",
  canceled: "border-red-200 bg-red-50 text-red-700",
  completed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  error: "border-red-200 bg-red-50 text-red-700",
  failed: "border-red-200 bg-red-50 text-red-700",
  pending: "border-neutral-200 bg-neutral-100 text-neutral-600",
  running: "border-blue-200 bg-blue-50 text-blue-700"
};

const batchRunnerStatusKeyByStatus: Record<BatchCaseStatus, string> = {
  blocked: "agentHost.agentGui.batchRunnerStatus_blocked",
  canceled: "agentHost.agentGui.batchRunnerStatus_canceled",
  completed: "agentHost.agentGui.batchRunnerStatus_completed",
  error: "agentHost.agentGui.batchRunnerStatus_error",
  failed: "agentHost.agentGui.batchRunnerStatus_failed",
  pending: "agentHost.agentGui.batchRunnerStatus_pending",
  running: "agentHost.agentGui.batchRunnerStatus_running"
};

const terminalStatuses = new Set<BatchCaseStatus>([
  "blocked",
  "canceled",
  "completed",
  "error",
  "failed"
]);

const parseErrorLabelKeys: Record<
  AgentGuiBatchJsonlParseError["code"],
  string
> = {
  invalidJson: "agentHost.agentGui.batchRunnerParseInvalidJson",
  missingPrompt: "agentHost.agentGui.batchRunnerParsePromptRequired",
  rowMustBeObject: "agentHost.agentGui.batchRunnerParseObjectRequired"
};

function shortSessionId(sessionId: string | null | undefined): string {
  if (!sessionId) {
    return "-";
  }
  return sessionId.length > 12 ? sessionId.slice(-12) : sessionId;
}

function statusIcon(status: BatchCaseStatus): React.JSX.Element {
  switch (status) {
    case "completed":
      return <CheckCircle2 size={14} strokeWidth={2.4} aria-hidden />;
    case "running":
      return <Loader2 size={14} className="animate-spin" aria-hidden />;
    case "pending":
      return <Clock3 size={14} aria-hidden />;
    default:
      return <Circle size={14} aria-hidden />;
  }
}

function progressPercent(rows: readonly BatchResultRow[]): number {
  if (rows.length === 0) {
    return 0;
  }
  const finished = rows.filter((row) =>
    terminalStatuses.has(row.status)
  ).length;
  return Math.round((finished / rows.length) * 100);
}

function countStatus(
  rows: readonly BatchResultRow[],
  status: BatchCaseStatus
): number {
  return rows.filter((row) => row.status === status).length;
}

export function AgentGUIBatchRunnerPanel({
  workspaceId,
  workspacePath,
  initialProviders,
  onMinimize,
  onHeaderPointerDown
}: AgentGUIBatchRunnerPanelProps): React.JSX.Element {
  const { locale, t } = useTranslation();
  const runner = useAgentGuiBatchRunner({
    locale,
    workspaceId,
    workspacePath,
    initialProviders
  });
  const [searchQuery, setSearchQuery] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    BatchCaseStatus | "all"
  >("all");
  const [page, setPage] = React.useState(1);
  const [activeView, setActiveView] =
    React.useState<BatchRunnerView>("results");
  const [selectedResultKey, setSelectedResultKey] = React.useState<
    string | null
  >(null);

  const rows = React.useMemo<BatchResultRow[]>(() => {
    if (runner.results.length > 0) {
      return runner.results;
    }
    return runner.selectedProviders.flatMap((provider) =>
      runner.cases.map((batchCase) => ({
        id: batchCase.id,
        line: batchCase.line,
        title: batchCase.title?.trim() || batchCase.id,
        prompt: batchCase.prompt,
        status: "pending" as const,
        provider,
        agentSessionId: null,
        providerSessionId: null,
        error: null
      }))
    );
  }, [runner.cases, runner.results, runner.selectedProviders]);

  const filteredRows = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        row.id,
        row.title ?? "",
        String(row.line),
        row.agentSessionId ?? ""
      ]
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [rows, searchQuery, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = filteredRows.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );
  const sessionTimelines = runner.sessionTimelines;
  const loadSessionTimeline = runner.loadSessionTimeline;
  const selectedResult = React.useMemo(() => {
    if (!selectedResultKey) {
      return null;
    }
    return (
      rows.find(
        (row) => agentGuiBatchRunCaseResultKey(row) === selectedResultKey
      ) ?? null
    );
  }, [rows, selectedResultKey]);
  const selectedProviderLabel = selectedResult
    ? t(providerLabelKeys[selectedResult.provider])
    : "";
  const selectedTimelineState = selectedResult
    ? sessionTimelines[agentGuiBatchRunCaseResultKey(selectedResult)]
    : null;
  const progress = progressPercent(rows);
  const completedCount = countStatus(rows, "completed");
  const runningCount = countStatus(rows, "running");
  const pendingCount = countStatus(rows, "pending");
  const issueCount = rows.filter((row) =>
    ["blocked", "canceled", "error", "failed"].includes(row.status)
  ).length;
  const rowDiagnosticsByKey = React.useMemo(() => {
    const diagnosticsByKey: Record<string, AgentGuiBatchSessionDiagnostics> =
      {};
    rows.forEach((row) => {
      if (!terminalStatuses.has(row.status)) {
        return;
      }
      const rowKey = agentGuiBatchRunCaseResultKey(row);
      const detail = buildAgentGuiBatchSessionDetail({
        result: row,
        timelineItems: sessionTimelines[rowKey]?.timelineItems ?? [],
        workspacePath,
        providerLabel: t(providerLabelKeys[row.provider])
      });
      diagnosticsByKey[rowKey] = getAgentGuiBatchSessionDiagnostics(
        detail,
        row
      );
    });
    return diagnosticsByKey;
  }, [rows, sessionTimelines, t, workspacePath]);

  React.useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, rows.length]);

  React.useEffect(() => {
    if (rows.length === 0) {
      setSelectedResultKey(null);
      return;
    }
    const selectedStillExists =
      selectedResultKey !== null &&
      rows.some(
        (row) => agentGuiBatchRunCaseResultKey(row) === selectedResultKey
      );
    if (selectedStillExists) {
      return;
    }
    const nextSelected =
      rows.find((row) => row.status === "running") ??
      rows.find((row) =>
        Boolean(row.agentSessionId ?? row.providerSessionId)
      ) ??
      rows[0] ??
      null;
    if (!nextSelected) {
      setSelectedResultKey(null);
      return;
    }
    setSelectedResultKey(agentGuiBatchRunCaseResultKey(nextSelected));
  }, [rows, selectedResultKey]);

  React.useEffect(() => {
    if (activeView !== "session" || !selectedResult) {
      return;
    }
    const sessionId =
      selectedResult.agentSessionId ?? selectedResult.providerSessionId;
    if (!sessionId) {
      return;
    }
    const state =
      sessionTimelines[agentGuiBatchRunCaseResultKey(selectedResult)];
    if (
      state?.loading ||
      state?.lastLoadedAtUnixMs ||
      (state?.timelineItems.length ?? 0) > 0
    ) {
      return;
    }
    void loadSessionTimeline(selectedResult);
  }, [activeView, loadSessionTimeline, selectedResult, sessionTimelines]);

  const handleCopySessionId = React.useCallback(
    (sessionId: string | null | undefined): void => {
      if (!sessionId) {
        return;
      }
      void navigator.clipboard?.writeText(sessionId);
    },
    []
  );

  const statusOptions: Array<BatchCaseStatus | "all"> = [
    "all",
    "pending",
    "running",
    "completed",
    "failed",
    "blocked",
    "error",
    "canceled"
  ];

  return (
    <section
      className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[16px] border border-neutral-200 bg-white/95 text-[13px] text-neutral-700 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur"
      data-testid="agent-gui-batch-runner-panel"
    >
      <div
        className="flex shrink-0 cursor-move items-center justify-between gap-4 border-b border-neutral-200 px-6 py-4"
        data-testid="agent-gui-batch-runner-drag-handle"
        onPointerDown={onHeaderPointerDown}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-blue-200 bg-blue-50 text-blue-700">
            <Bot size={22} aria-hidden />
          </div>
          <div className="min-w-0">
            <strong className="block truncate text-[20px] font-semibold leading-7 text-neutral-950">
              {t("agentHost.agentGui.batchRunnerStandaloneTitle")}
            </strong>
            <span className="block truncate text-[13px] text-neutral-500">
              {t("agentHost.agentGui.batchRunnerSubtitle")}
            </span>
          </div>
        </div>
        {onMinimize ? (
          <button
            type="button"
            aria-label={t("common.minimize")}
            className="inline-flex size-9 shrink-0 cursor-default items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 shadow-sm transition-colors hover:bg-neutral-50"
            data-testid="agent-gui-batch-minimize"
            onClick={onMinimize}
          >
            <Minus size={18} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="shrink-0 border-b border-neutral-200 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(320px,1.1fr)_max-content]">
          <div className="flex min-h-[104px] min-w-0 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <FileText size={24} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-neutral-500">
                {t("agentHost.agentGui.batchRunnerPromptSource")}
              </span>
              {runner.selectedFile ? (
                <span className="mt-1 flex min-w-0 items-center gap-2 text-[13px] leading-5">
                  <span className="truncate font-semibold text-neutral-950">
                    {runner.selectedFile.name}
                  </span>
                  <span className="shrink-0 font-medium text-neutral-500">
                    {t("agentHost.agentGui.batchRunnerLoadedFileMeta", {
                      count: runner.cases.length
                    })}
                  </span>
                </span>
              ) : (
                <span className="mt-1 block text-[13px] font-semibold leading-5 text-neutral-950">
                  {t("agentHost.agentGui.batchRunnerSelectFile")}
                </span>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    runner.status === "running" || runner.status === "exporting"
                  }
                  data-testid="agent-gui-batch-select-file"
                  onClick={() => void runner.selectPromptFile()}
                >
                  <Upload size={14} aria-hidden />
                  {t("agentHost.agentGui.batchRunnerUploadFile")}
                </button>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 text-[11px] font-semibold text-neutral-800 transition-colors hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    runner.status === "running" || runner.status === "exporting"
                  }
                  data-testid="agent-gui-batch-select-built-in"
                  onClick={runner.selectBuiltInPromptFile}
                >
                  <FileText size={14} aria-hidden />
                  {t("agentHost.agentGui.batchRunnerUseBuiltInFile")}
                </button>
              </div>
            </div>
            {runner.selectedFile ? (
              <CheckCircle2
                className="shrink-0 text-emerald-600"
                size={18}
                aria-hidden
              />
            ) : null}
          </div>

          <div className="flex min-h-[104px] min-w-0 flex-col justify-center rounded-xl border border-neutral-200 bg-white px-4 py-4 shadow-sm">
            <span className="mb-3 text-[13px] font-semibold text-neutral-700">
              {t("agentHost.agentGui.batchRunnerSelectAgent")}
            </span>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pb-1">
              {AGENT_GUI_BATCH_RUNNER_PROVIDERS.map((provider) => {
                const selected = runner.selectedProviders.includes(provider);
                return (
                  <button
                    key={provider}
                    type="button"
                    className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-md border-0 bg-transparent px-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-neutral-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                    aria-pressed={selected}
                    data-testid={`agent-gui-batch-agent-${provider}`}
                    disabled={
                      runner.status === "running" ||
                      runner.status === "exporting"
                    }
                    onClick={() => runner.toggleSelectedProvider(provider)}
                  >
                    <span
                      className={`inline-flex size-4 shrink-0 items-center justify-center rounded border ${
                        selected ? "border-neutral-950" : "border-neutral-300"
                      }`}
                      aria-hidden="true"
                    >
                      {selected ? <Check size={12} strokeWidth={3} /> : null}
                    </span>
                    <span className="truncate">
                      {t(providerLabelKeys[provider])}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex min-h-[96px] items-center justify-end gap-3">
            <Button
              type="button"
              variant="default"
              size="sm"
              className="h-11 min-w-[124px] gap-2 px-4 text-[13px]"
              disabled={!runner.isRunnable}
              data-testid="agent-gui-batch-run"
              onClick={() => void runner.run()}
            >
              <Play size={16} fill="currentColor" aria-hidden />
              {runner.status === "running"
                ? t("agentHost.agentGui.batchRunnerRunning")
                : t("agentHost.agentGui.batchRunnerRun")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-11 min-w-[92px] gap-2 px-4 text-[13px]"
              disabled={!runner.isExportable}
              data-testid="agent-gui-batch-export"
              onClick={() => void runner.exportRun()}
            >
              <Upload size={16} aria-hidden />
              {runner.status === "exporting"
                ? t("agentHost.agentGui.batchRunnerExporting")
                : t("agentHost.agentGui.batchRunnerExport")}
            </Button>
          </div>
        </div>

        <div className="mt-4 grid items-center gap-3 border-t border-neutral-100 pt-4 lg:grid-cols-[minmax(180px,360px)_1fr]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="shrink-0 text-[13px] font-semibold text-neutral-700">
              {t("agentHost.agentGui.batchRunnerProgress")}
            </span>
            <div className="h-2 min-w-[120px] flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="w-10 text-right text-[13px] font-semibold tabular-nums text-neutral-700">
              {progress}%
            </span>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[13px] text-neutral-600">
            <span className="inline-flex items-center justify-center gap-2 border-l border-neutral-200 px-2">
              <span className="size-2 rounded-full bg-blue-600" />
              {t("agentHost.agentGui.batchRunnerStatus_running")} {runningCount}
            </span>
            <span className="inline-flex items-center justify-center gap-2 border-l border-neutral-200 px-2">
              <CheckCircle2
                size={14}
                className="text-emerald-600"
                aria-hidden
              />
              {t("agentHost.agentGui.batchRunnerStatus_completed")}{" "}
              {completedCount}
            </span>
            <span className="inline-flex items-center justify-center gap-2 border-l border-neutral-200 px-2">
              <Clock3 size={14} className="text-neutral-500" aria-hidden />
              {t("agentHost.agentGui.batchRunnerStatus_pending")} {pendingCount}
            </span>
            <span className="inline-flex items-center justify-center gap-2 border-l border-neutral-200 px-2">
              {t("agentHost.agentGui.batchRunnerTotalCases", {
                count: rows.length
              })}
              {issueCount > 0
                ? ` · ${t("agentHost.agentGui.batchRunnerIssueCases", { count: issueCount })}`
                : ""}
            </span>
          </div>
        </div>
      </div>

      {runner.parseErrors.length > 0 ? (
        <div
          className="mx-4 mt-3 max-h-20 shrink-0 overflow-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700"
          data-testid="agent-gui-batch-error"
        >
          {runner.parseErrors.map((error) => (
            <div key={`${error.line}-${error.code}`}>
              {t(parseErrorLabelKeys[error.code], { line: error.line })}
            </div>
          ))}
        </div>
      ) : runner.error ? (
        <pre
          className="mx-4 mt-3 max-h-20 shrink-0 overflow-auto whitespace-pre-wrap rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] leading-5 text-red-700"
          data-testid="agent-gui-batch-error"
        >
          {runner.error === "empty-file"
            ? t("agentHost.agentGui.batchRunnerEmptyFile")
            : runner.error}
        </pre>
      ) : null}

      <div className="m-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        {activeView === "results" ? (
          <>
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
              <label className="inline-flex h-9 min-w-[220px] flex-1 items-center overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors focus-within:border-neutral-400 sm:max-w-[360px]">
                <Search
                  className="ml-3 shrink-0 text-neutral-400"
                  size={16}
                  aria-hidden
                />
                <input
                  type="search"
                  value={searchQuery}
                  className="h-full min-w-0 flex-1 border-0 bg-transparent pr-3 pl-2 text-[13px] text-neutral-900 outline-none placeholder:text-neutral-400"
                  placeholder={t(
                    "agentHost.agentGui.batchRunnerSearchPlaceholder"
                  )}
                  data-testid="agent-gui-batch-search"
                  onChange={(event) =>
                    setSearchQuery(event.currentTarget.value)
                  }
                />
              </label>
              <div className="flex items-center gap-2">
                <label className="inline-flex h-9 items-center overflow-hidden rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors focus-within:border-neutral-400">
                  <Filter
                    className="ml-3 shrink-0 text-neutral-500"
                    size={15}
                    aria-hidden
                  />
                  <select
                    value={statusFilter}
                    className="h-full min-w-[124px] appearance-none border-0 bg-transparent pr-8 pl-2 text-[13px] font-medium text-neutral-700 outline-none"
                    data-testid="agent-gui-batch-status-filter"
                    onChange={(event) =>
                      setStatusFilter(
                        event.currentTarget.value as BatchCaseStatus | "all"
                      )
                    }
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status === "all"
                          ? t("agentHost.agentGui.batchRunnerAllStatuses")
                          : t(batchRunnerStatusKeyByStatus[status])}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="inline-flex size-9 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50"
                  data-testid="agent-gui-batch-reset-filters"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("all");
                  }}
                >
                  <RefreshCw size={15} aria-hidden />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[960px] border-collapse text-left">
                <thead className="sticky top-0 z-10 bg-neutral-50 text-[11px] font-semibold text-neutral-600">
                  <tr className="border-b border-neutral-200">
                    <th className="w-[160px] px-4 py-3">
                      {t("agentHost.agentGui.batchRunnerAgent")}
                    </th>
                    <th className="w-[72px] px-4 py-3">
                      {t("agentHost.agentGui.batchRunnerLine")}
                    </th>
                    <th className="px-4 py-3">
                      {t("agentHost.agentGui.batchRunnerCase")}
                    </th>
                    <th className="w-[140px] px-4 py-3">
                      {t("agentHost.agentGui.batchRunnerStatus")}
                    </th>
                    <th className="w-[190px] px-4 py-3">
                      {t("agentHost.agentGui.batchRunnerIssues")}
                    </th>
                    <th className="w-[160px] px-4 py-3">
                      {t("agentHost.agentGui.batchRunnerSession")}
                    </th>
                    <th className="w-[88px] px-4 py-3 text-right">
                      {t("agentHost.agentGui.batchRunnerActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length > 0 ? (
                    visibleRows.map((row) => {
                      const sessionId =
                        row.agentSessionId ?? row.providerSessionId;
                      const rowKey = agentGuiBatchRunCaseResultKey(row);
                      const selected = rowKey === selectedResultKey;
                      const rowDiagnostics = rowDiagnosticsByKey[rowKey] ?? {
                        errorCount: 0,
                        failedToolCount: 0,
                        issueCount: 0
                      };
                      const showRowDiagnostics = terminalStatuses.has(
                        row.status
                      );
                      const openResultSession = (): void => {
                        setSelectedResultKey(rowKey);
                        if (sessionId) {
                          setActiveView("session");
                        }
                      };
                      return (
                        <tr
                          key={rowKey}
                          className={`cursor-pointer border-b border-neutral-100 outline-none last:border-b-0 hover:bg-neutral-50 focus-visible:bg-blue-50 ${
                            selected
                              ? "bg-blue-50/70 ring-1 ring-inset ring-blue-200"
                              : ""
                          }`}
                          data-testid="agent-gui-batch-case-row"
                          aria-selected={selected}
                          tabIndex={0}
                          onClick={openResultSession}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") {
                              return;
                            }
                            event.preventDefault();
                            openResultSession();
                          }}
                        >
                          <td className="px-4 py-3">
                            <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-neutral-900">
                              <span className="inline-flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-200 bg-white">
                                <img
                                  src={managedAgentRoundedIconUrl(row.provider)}
                                  alt=""
                                  className="size-full object-cover"
                                  aria-hidden
                                />
                              </span>
                              <span className="truncate">
                                {t(providerLabelKeys[row.provider])}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-neutral-600">
                            {row.line}
                          </td>
                          <td className="max-w-[280px] px-4 py-3">
                            <span
                              className="block truncate font-medium text-neutral-900"
                              title={row.title ?? row.id}
                            >
                              {row.title ?? row.id}
                            </span>
                            {row.error ? (
                              <span className="mt-0.5 block truncate text-[11px] text-red-600">
                                {row.error}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold ${statusToneClassNames[row.status]}`}
                            >
                              {statusIcon(row.status)}
                              {t(batchRunnerStatusKeyByStatus[row.status])}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className="flex flex-wrap gap-1.5"
                              data-testid="agent-gui-batch-case-diagnostics"
                            >
                              {showRowDiagnostics ? (
                                <>
                                  <span
                                    className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${
                                      rowDiagnostics.errorCount > 0
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-neutral-200 bg-neutral-50 text-neutral-500"
                                    }`}
                                  >
                                    {t(
                                      "agentHost.agentGui.batchRunnerSessionErrorCount",
                                      {
                                        count: rowDiagnostics.errorCount
                                      }
                                    )}
                                  </span>
                                  <span
                                    className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-semibold ${
                                      rowDiagnostics.failedToolCount > 0
                                        ? "border-red-200 bg-red-50 text-red-700"
                                        : "border-neutral-200 bg-neutral-50 text-neutral-500"
                                    }`}
                                  >
                                    {t(
                                      "agentHost.agentGui.batchRunnerSessionToolFailureCount",
                                      {
                                        count: rowDiagnostics.failedToolCount
                                      }
                                    )}
                                  </span>
                                </>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 text-[13px] font-semibold text-neutral-400">
                                  —
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {sessionId ? (
                              <span className="inline-flex rounded-md bg-neutral-100 px-2 py-1 font-mono text-[11px] tabular-nums text-neutral-700">
                                {shortSessionId(sessionId)}
                              </span>
                            ) : (
                              <span className="text-[13px] text-neutral-400">
                                -
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className="inline-flex size-8 items-center justify-center rounded-md text-neutral-600 transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                              disabled={!sessionId}
                              title={t(
                                "agentHost.agentGui.batchRunnerCopySession"
                              )}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleCopySessionId(sessionId);
                              }}
                            >
                              <FileText size={16} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-10 text-center text-[13px] text-neutral-500"
                      >
                        {t("agentHost.agentGui.batchRunnerNoResults")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex shrink-0 items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3 text-[13px] text-neutral-600">
              <span>
                {t("agentHost.agentGui.batchRunnerVisibleCount", {
                  count: filteredRows.length
                })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 disabled:opacity-40"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                >
                  <ChevronLeft size={16} aria-hidden />
                </button>
                <span className="inline-flex h-8 min-w-[88px] items-center justify-center rounded-lg bg-blue-50 px-3 font-semibold tabular-nums text-blue-700">
                  {t("agentHost.agentGui.batchRunnerPageIndicator", {
                    page: currentPage,
                    total: pageCount
                  })}
                </span>
                <button
                  type="button"
                  className="inline-flex size-8 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-700 disabled:opacity-40"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((value) => Math.min(pageCount, value + 1))
                  }
                >
                  <ChevronRight size={16} aria-hidden />
                </button>
                <span className="ml-2 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-neutral-700">
                  {t("agentHost.agentGui.batchRunnerPageSize", {
                    count: PAGE_SIZE
                  })}
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 p-4">
            <AgentGUIBatchRunnerSessionTab
              result={selectedResult}
              timelineState={selectedTimelineState}
              workspacePath={workspacePath}
              providerLabel={selectedProviderLabel}
              onBackToResults={() => setActiveView("results")}
              onRefresh={() => {
                if (!selectedResult) {
                  return;
                }
                void loadSessionTimeline(selectedResult);
              }}
            />
          </div>
        )}
      </div>

      {runner.exportResult?.filePath ? (
        <div
          className="mx-4 mb-3 shrink-0 truncate rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700"
          data-testid="agent-gui-batch-export-result"
        >
          {t("agentHost.agentGui.batchRunnerExported", {
            file: runner.exportResult.filePath
          })}
        </div>
      ) : null}
    </section>
  );
}
