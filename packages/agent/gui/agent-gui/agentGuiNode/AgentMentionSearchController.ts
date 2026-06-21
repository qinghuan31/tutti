import { resolveAgentMentionFileThumbnailUrl } from "../shared/mentionFilePresentation";
import { getOptionalAgentHostApi } from "../../agentActivityHost";
import type { RuntimeDiagnosticsDetailValue } from "../../shared/contracts/dto/debug";
import { presentAgentGeneratedFileMentionItems } from "./agentMentionAgentGeneratedFilesPresentation";
import {
  emitAgentMentionSearchDiagnostic,
  logAgentMentionSearchInfo,
  queryAgentMentionProviderWithDiagnostics,
  type AgentMentionProviderQueryDiagnostic,
  type AgentMentionSearchDiagnosticLog
} from "./agentMentionSearchDiagnostics";
import {
  AGENT_MENTION_FILTER_TAB_ORDER,
  buildEmptyGroup,
  compactText,
  filterForGroup,
  DEFAULT_MENTION_GROUP_PAGE_SIZE,
  groupIdsForFilter,
  mentionGroupPageSize,
  normalizeQuery,
  resolveMentionGroupItems,
  resolveMentionGroupTotalCount,
  shouldPrefetchBrowseFilter,
  shouldShowEmptyGroup
} from "./agentMentionSearchHelpers";
import { agentMentionFilterLabel } from "./AgentMentionLabels";
import type { AgentContextMentionItem } from "./agentRichText/agentFileMentionExtension";
import {
  buildAgentGenericMentionHref,
  buildAgentSessionMentionHref,
  buildAgentWorkspaceAppMentionHref,
  buildAgentWorkspaceIssueMentionHref,
  normalizeAgentSessionMentionTitle
} from "./agentRichText/agentFileMentionExtension";
import type {
  AgentContextMentionInsertResult,
  AgentContextMentionProvider
} from "./agentContextMentionProvider";
import { AGENT_CONTEXT_MENTION_PROVIDER_IDS } from "./agentContextMentionProvider";
import type {
  MentionPaletteGroup,
  MentionPaletteState
} from "@tutti-os/ui-rich-text/at-panel";

export type AgentMentionFilterId = "all" | "app" | "file" | "session" | "issue";
export type AgentMentionGroupId =
  | "apps"
  | "files"
  | "opened_files"
  | "agent_generated_files"
  | "my_sessions"
  | "collab_sessions"
  | "issues";

type AgentMentionRawGroupId = Exclude<AgentMentionGroupId, "files">;

export interface AgentMentionBrowseCategory {
  id: AgentMentionFilterId;
  label: string;
}

export type AgentMentionGroup = MentionPaletteGroup<AgentContextMentionItem>;

export type AgentMentionSearchState =
  MentionPaletteState<AgentContextMentionItem>;

interface AgentMentionSearchControllerOptions {
  contextMentionProviders?: readonly AgentContextMentionProvider[];
  debounceMs?: number;
  fileLimit?: number;
  issueLimit?: number;
  browseCacheTtlMs?: number;
  providerTimeoutMs?: number;
  diagnosticInfoLogger?: (payload: AgentMentionSearchDiagnosticLog) => void;
  diagnosticNow?: () => number;
  diagnosticSlowThresholdMs?: number;
}

type Listener = (state: AgentMentionSearchState) => void;

const DEFAULT_DEBOUNCE_MS = 120;
const DEFAULT_FILE_LIMIT = 30;
const DEFAULT_ISSUE_LIMIT = 25;
const DEFAULT_SESSION_LIMIT = 30;
const DEFAULT_PROVIDER_TIMEOUT_MS = 3500;
const DEFAULT_DIAGNOSTIC_SLOW_THRESHOLD_MS = 250;
const DEFAULT_BROWSE_CACHE_TTL_MS = 30_000;
const AGENT_MENTION_LIFECYCLE_LOG_PREFIX = "[agent-gui] mention-lifecycle";

type AgentMentionRawGroups = Record<
  AgentMentionRawGroupId,
  AgentContextMentionItem[]
>;

type AgentMentionTotalCounts = Partial<Record<AgentMentionGroupId, number>>;

interface AgentMentionBrowseFetchResult {
  providerDiagnostics: AgentMentionProviderQueryDiagnostic[];
  rawGroups: AgentMentionRawGroups;
  totalCounts: AgentMentionTotalCounts;
}

interface AgentMentionBrowseCacheEntry extends AgentMentionBrowseFetchResult {
  cachedAt: number;
}

type AgentMentionBrowseLoadReason = "open" | "preload";

interface AgentMentionLifecycleDiagnosticLog {
  event:
    | "controller.construct"
    | "controller.dispose"
    | "browse.open"
    | "browse.preload"
    | "browse.cache"
    | "browse.fetch.start"
    | "browse.fetch.dedupe"
    | "browse.fetch.success"
    | "browse.fetch.error"
    | "browse.apply.skipped";
  details: Record<string, RuntimeDiagnosticsDetailValue>;
}

const sharedAgentMentionBrowseCache = new Map<
  string,
  AgentMentionBrowseCacheEntry
>();
const sharedAgentMentionBrowseFetches = new Map<
  string,
  Promise<AgentMentionBrowseFetchResult>
>();

// Bound the shared browse cache so long-lived renderer sessions cannot grow it
// without limit. Eviction happens on write (LRU-by-insertion-order); reads keep
// returning stale entries so the stale-while-revalidate path stays intact.
export const MAX_BROWSE_CACHE_ENTRIES = 64;

function writeBrowseCacheEntry(
  cacheKey: string,
  entry: AgentMentionBrowseCacheEntry
): void {
  // Re-insert so the freshly written key becomes the newest (Map preserves
  // insertion order), then drop the oldest keys past the cap.
  sharedAgentMentionBrowseCache.delete(cacheKey);
  sharedAgentMentionBrowseCache.set(cacheKey, entry);
  while (sharedAgentMentionBrowseCache.size > MAX_BROWSE_CACHE_ENTRIES) {
    const oldestKey = sharedAgentMentionBrowseCache.keys().next().value;
    if (oldestKey === undefined) {
      break;
    }
    sharedAgentMentionBrowseCache.delete(oldestKey);
  }
}

// Defer speculative warm-up to a browser idle slot so it never blocks the
// caller's synchronous path (e.g. a composer focus handler) or a render commit.
// Falls back to a macrotask where requestIdleCallback is unavailable (jsdom,
// older runtimes). Returns a canceller the owner uses on teardown.
function scheduleIdleTask(task: () => void): () => void {
  const scope = globalThis as typeof globalThis & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number }
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof scope.requestIdleCallback === "function") {
    const handle = scope.requestIdleCallback(() => task(), { timeout: 500 });
    return () => scope.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(task, 0);
  return () => clearTimeout(handle);
}

export function resetAgentMentionSearchBrowseCacheForTests(): void {
  sharedAgentMentionBrowseCache.clear();
  sharedAgentMentionBrowseFetches.clear();
}

(
  globalThis as typeof globalThis & {
    __tuttiResetAgentMentionSearchBrowseCacheForTests?: () => void;
  }
).__tuttiResetAgentMentionSearchBrowseCacheForTests =
  resetAgentMentionSearchBrowseCacheForTests;

// Resolve filter tab labels lazily so they reflect the active i18n locale at the
// time a state is emitted. Computing this at module load froze the labels to the
// default ("en") runtime, since the agent GUI i18n locale is only synced once the
// AgentGuiI18nProvider renders.
function buildBrowseCategories(): AgentMentionBrowseCategory[] {
  return AGENT_MENTION_FILTER_TAB_ORDER.map((id) => ({
    id,
    label: agentMentionFilterLabel(id)
  }));
}

const {
  agentGeneratedFile: AGENT_GENERATED_FILE_PROVIDER_ID,
  agentSession: AGENT_SESSION_PROVIDER_ID,
  file: FILE_PROVIDER_ID,
  workspaceApp: WORKSPACE_APP_PROVIDER_ID,
  workspaceIssue: WORKSPACE_ISSUE_PROVIDER_ID
} = AGENT_CONTEXT_MENTION_PROVIDER_IDS;

export class AgentMentionSearchController {
  private readonly contextMentionProviders: ReadonlyMap<
    string,
    AgentContextMentionProvider
  >;
  private readonly debounceMs: number;
  private readonly fileLimit: number;
  private readonly issueLimit: number;
  private readonly browseCacheTtlMs: number;
  private readonly providerTimeoutMs: number;
  private readonly diagnosticInfoLogger: (
    payload: AgentMentionSearchDiagnosticLog
  ) => void;
  private readonly diagnosticNow: () => number;
  private readonly diagnosticSlowThresholdMs: number;
  private readonly listeners = new Set<Listener>();
  private readonly expandedCounts: Partial<
    Record<AgentMentionGroupId, number>
  > = {};
  private readonly totalCounts: Partial<Record<AgentMentionGroupId, number>> =
    {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private preloadCancel: (() => void) | null = null;
  private pendingPreloadKey: string | null = null;
  private requestId = 0;
  private disposed = false;
  private activeWorkspaceId = "";
  private currentUserId = "";
  private currentFilter: AgentMentionFilterId = "all";
  private currentQuery = "";
  private currentSessionCwd = "";
  private currentFileSearchLimit: number;
  private currentIssueSearchLimit: number;
  private agentGeneratedBrowsePath: string | null = null;
  private rawGroups: AgentMentionRawGroups = emptyAgentMentionRawGroups();
  private state: AgentMentionSearchState = {
    status: "idle",
    query: "",
    mode: "browse",
    filter: "all",
    categories: buildBrowseCategories(),
    groups: [],
    error: null
  };

  constructor(options: AgentMentionSearchControllerOptions) {
    this.contextMentionProviders = new Map(
      (options.contextMentionProviders ?? []).map((provider) => [
        provider.id,
        provider
      ])
    );
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.fileLimit = options.fileLimit ?? DEFAULT_FILE_LIMIT;
    this.issueLimit = options.issueLimit ?? DEFAULT_ISSUE_LIMIT;
    this.browseCacheTtlMs =
      options.browseCacheTtlMs ?? DEFAULT_BROWSE_CACHE_TTL_MS;
    this.providerTimeoutMs =
      options.providerTimeoutMs ?? DEFAULT_PROVIDER_TIMEOUT_MS;
    this.diagnosticInfoLogger =
      options.diagnosticInfoLogger ?? logAgentMentionSearchInfo;
    this.diagnosticNow = options.diagnosticNow ?? Date.now;
    this.diagnosticSlowThresholdMs =
      options.diagnosticSlowThresholdMs ?? DEFAULT_DIAGNOSTIC_SLOW_THRESHOLD_MS;
    this.currentFileSearchLimit = this.fileLimit;
    this.currentIssueSearchLimit = this.issueLimit;
    this.logLifecycle("controller.construct", {
      providerIds: this.providerIdsForDiagnostics(),
      providerCount: this.contextMentionProviders.size
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  updateQuery(input: {
    workspaceId: string;
    currentUserId?: string | null;
    query: string;
    sessionCwd?: string | null;
  }): void {
    if (this.disposed) {
      return;
    }
    this.activeWorkspaceId = input.workspaceId.trim();
    this.currentUserId = input.currentUserId?.trim() ?? "";
    this.currentSessionCwd = input.sessionCwd?.trim() ?? "";
    this.currentQuery = normalizeQuery(input.query);
    this.clearTimer();
    const requestId = ++this.requestId;
    this.resetAgentGeneratedBrowsePath();
    this.resetExpandedCounts();
    this.resetSearchLimits();

    if (!this.activeWorkspaceId) {
      this.setState({
        status: "idle",
        query: this.currentQuery,
        mode: "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: [],
        error: null
      });
      return;
    }

    if (!this.currentQuery) {
      this.startBrowseModeFetch(this.currentFilter);
      return;
    }

    this.setState({
      status: "loading",
      query: this.currentQuery,
      mode: "results",
      filter: this.currentFilter,
      categories: buildBrowseCategories(),
      groups: this.groupsFromRawGroups(),
      error: null
    });
    this.timer = setTimeout(() => {
      void this.runSearch({
        workspaceId: this.activeWorkspaceId,
        currentUserId: this.currentUserId,
        query: this.currentQuery,
        requestId
      });
    }, this.debounceMs);
  }

  setFilter(filter: AgentMentionFilterId): void {
    if (this.disposed) {
      return;
    }
    this.currentFilter = filter;
    this.resetAgentGeneratedBrowsePath();
    this.resetExpandedCounts();
    if (!this.currentQuery) {
      this.startBrowseModeFetch(filter);
      return;
    }
    this.setState({
      status: "ready",
      query: this.currentQuery,
      mode: "results",
      filter: this.currentFilter,
      categories: buildBrowseCategories(),
      groups: this.groupsFromRawGroups(),
      error: null
    });
  }

  preloadBrowse(input: {
    workspaceId: string;
    currentUserId?: string | null;
    sessionCwd?: string | null;
    filter?: AgentMentionFilterId;
  }): void {
    if (this.disposed) {
      return;
    }
    const workspaceId = input.workspaceId.trim();
    if (!workspaceId) {
      return;
    }
    const filter = input.filter ?? "all";
    if (!shouldPrefetchBrowseFilter(filter)) {
      return;
    }
    const currentUserId = input.currentUserId?.trim() ?? "";
    const sessionCwd = input.sessionCwd?.trim() ?? "";
    const cacheKey = this.browseCacheKey({
      currentUserId,
      filter,
      sessionCwd,
      workspaceId
    });
    // Already warm — nothing to schedule.
    if (this.readBrowseCache(cacheKey).isFresh) {
      return;
    }
    // A warm-up for this exact key is already queued; let it run rather than
    // re-scheduling on every focus/dependency churn.
    if (this.pendingPreloadKey === cacheKey) {
      return;
    }
    // The controller owns *when* the warm-up runs: callers just declare intent.
    this.cancelPendingPreload();
    this.pendingPreloadKey = cacheKey;
    this.preloadCancel = scheduleIdleTask(() => {
      this.preloadCancel = null;
      this.pendingPreloadKey = null;
      if (this.disposed) {
        return;
      }
      this.runBrowsePreload({
        cacheKey,
        currentUserId,
        filter,
        sessionCwd,
        workspaceId
      });
    });
  }

  private runBrowsePreload(input: {
    cacheKey: string;
    currentUserId: string;
    filter: AgentMentionFilterId;
    sessionCwd: string;
    workspaceId: string;
  }): void {
    const { cacheKey, currentUserId, filter, sessionCwd, workspaceId } = input;
    this.logLifecycle("browse.preload", {
      filter,
      providerIds: this.providerIdsForDiagnostics(),
      sessionCwdPresent: Boolean(sessionCwd),
      workspaceId
    });
    const cached = this.readBrowseCache(cacheKey);
    this.logBrowseCacheState({
      cacheKey,
      cached,
      filter,
      reason: "preload",
      workspaceId
    });
    // Re-check freshness: another path may have warmed this key while the idle
    // task was queued.
    if (cached.isFresh) {
      return;
    }
    void this.loadBrowseFetchResult(
      {
        workspaceId,
        currentUserId,
        filter,
        sessionCwd
      },
      cacheKey,
      "preload"
    ).catch((error) => {
      this.logLifecycle("browse.fetch.error", {
        errorKind: diagnosticErrorKind(error),
        filter,
        reason: "preload",
        workspaceId
      });
    });
  }

  private cancelPendingPreload(): void {
    if (this.preloadCancel) {
      this.preloadCancel();
      this.preloadCancel = null;
    }
    this.pendingPreloadKey = null;
  }

  enterCategory(category: Exclude<AgentMentionFilterId, "all">): void {
    if (this.disposed) {
      return;
    }
    this.currentFilter = category;
    this.resetExpandedCounts();
    this.clearTimer();
    if (!this.currentQuery) {
      this.startBrowseModeFetch(category);
      return;
    }
    if (!this.activeWorkspaceId) {
      this.emitBrowseState("ready");
      return;
    }
    const requestId = ++this.requestId;
    this.setState({
      status: "loading",
      query: this.currentQuery,
      mode: "results",
      filter: this.currentFilter,
      categories: buildBrowseCategories(),
      groups: this.groupsFromRawGroups(),
      error: null
    });
    void this.runSearch({
      workspaceId: this.activeWorkspaceId,
      currentUserId: this.currentUserId,
      query: this.currentQuery,
      requestId
    });
  }

  selectAgentGeneratedMentionItem(item: AgentContextMentionItem): boolean {
    if (item.kind !== "file" || !item.mentionNavigation) {
      return false;
    }
    if (item.mentionNavigation === "agent-generated-folder") {
      this.agentGeneratedBrowsePath = item.path;
      this.expandedCounts.agent_generated_files = mentionGroupPageSize(
        this.currentFilter,
        "agent_generated_files"
      );
      this.setState({
        status: this.state.status === "loading" ? "loading" : "ready",
        query: this.currentQuery,
        mode: this.currentQuery ? "results" : "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: this.groupsFromRawGroups(),
        error: null
      });
      return true;
    }
    if (item.mentionNavigation === "agent-generated-folder-back") {
      this.resetAgentGeneratedBrowsePath();
      this.setState({
        status: this.state.status === "loading" ? "loading" : "ready",
        query: this.currentQuery,
        mode: this.currentQuery ? "results" : "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: this.groupsFromRawGroups(),
        error: null
      });
      return true;
    }
    return false;
  }

  expandGroup(groupId: AgentMentionGroupId): void {
    const pageSize = mentionGroupPageSize(this.currentFilter, groupId);
    const current = this.expandedCounts[groupId] ?? pageSize;
    this.expandedCounts[groupId] = current + pageSize;
    if (!this.currentQuery) {
      const nextFilter = filterForGroup(groupId);
      if (this.currentFilter === "all") {
        this.currentFilter = nextFilter;
      }
      this.setState({
        status: "ready",
        query: "",
        mode: "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: this.groupsFromRawGroups(),
        error: null
      });
      return;
    }
    const needsMoreFiles =
      (groupId === "opened_files" ||
        groupId === "files" ||
        groupId === "agent_generated_files") &&
      (groupId === "agent_generated_files"
        ? this.rawGroups.agent_generated_files.length >=
          this.currentFileSearchLimit
        : this.rawGroups.opened_files.length >= this.currentFileSearchLimit);
    const needsMoreIssues =
      groupId === "issues" &&
      (this.totalCounts.issues ?? this.rawGroups.issues.length) >
        this.rawGroups.issues.length;
    if (needsMoreFiles) {
      this.currentFileSearchLimit += DEFAULT_MENTION_GROUP_PAGE_SIZE;
    }
    if (needsMoreIssues) {
      this.currentIssueSearchLimit += DEFAULT_MENTION_GROUP_PAGE_SIZE;
    }
    if (needsMoreFiles || needsMoreIssues) {
      this.clearTimer();
      const requestId = ++this.requestId;
      this.setState({
        status: "loading",
        query: this.currentQuery,
        mode: "results",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: this.groupsFromRawGroups(),
        error: null
      });
      void this.runSearch({
        workspaceId: this.activeWorkspaceId,
        currentUserId: this.currentUserId,
        query: this.currentQuery,
        requestId
      });
      return;
    }
    this.setState({
      status: "ready",
      query: this.currentQuery,
      mode: "results",
      filter: this.currentFilter,
      categories: buildBrowseCategories(),
      groups: this.groupsFromRawGroups(),
      error: null
    });
  }

  close(): void {
    this.clearTimer();
    this.requestId += 1;
    this.currentFilter = "all";
    this.resetAgentGeneratedBrowsePath();
    this.resetExpandedCounts();
    this.resetSearchLimits();
    this.currentQuery = "";
    this.setState({
      status: "idle",
      query: "",
      mode: "browse",
      filter: "all",
      categories: buildBrowseCategories(),
      groups: [],
      error: null
    });
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
    this.cancelPendingPreload();
    this.listeners.clear();
    this.requestId += 1;
    this.logLifecycle("controller.dispose", {
      requestId: this.requestId,
      workspaceId: this.activeWorkspaceId
    });
  }

  private startBrowseModeFetch(filter: AgentMentionFilterId): void {
    if (!this.activeWorkspaceId || !shouldPrefetchBrowseFilter(filter)) {
      this.rawGroups = emptyAgentMentionRawGroups();
      this.resetTotalCounts();
      this.emitBrowseState("ready");
      return;
    }
    this.clearTimer();
    const requestId = ++this.requestId;
    const cacheKey = this.browseCacheKey({
      currentUserId: this.currentUserId,
      filter,
      sessionCwd: this.currentSessionCwd,
      workspaceId: this.activeWorkspaceId
    });
    this.logLifecycle("browse.open", {
      filter,
      providerIds: this.providerIdsForDiagnostics(),
      requestId,
      sessionCwdPresent: Boolean(this.currentSessionCwd),
      workspaceId: this.activeWorkspaceId
    });
    const cached = this.readBrowseCacheForBrowseInput({
      cacheKey,
      currentUserId: this.currentUserId,
      filter,
      sessionCwd: this.currentSessionCwd,
      workspaceId: this.activeWorkspaceId
    });
    this.logBrowseCacheState({
      cacheKey,
      cached,
      filter,
      reason: "open",
      workspaceId: this.activeWorkspaceId
    });
    if (cached.entry) {
      this.applyBrowseFetchResult(cached.entry);
      this.setState({
        status: "ready",
        query: "",
        mode: "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: this.groupsFromRawGroups(),
        error: null
      });
      if (cached.isFresh) {
        return;
      }
    } else {
      this.rawGroups = emptyAgentMentionRawGroups();
      this.resetTotalCounts();
      this.emitBrowseState("loading");
    }
    void this.runBrowseSearch({
      workspaceId: this.activeWorkspaceId,
      currentUserId: this.currentUserId,
      requestId,
      filter,
      sessionCwd: this.currentSessionCwd
    });
  }

  private async runSearch(input: {
    workspaceId: string;
    currentUserId: string;
    query: string;
    requestId: number;
  }): Promise<void> {
    const startedAt = this.diagnosticNow();
    const providerDiagnostics: AgentMentionProviderQueryDiagnostic[] = [];
    try {
      const [fileItems, appItems, issueItems, sessionItems] = await Promise.all(
        [
          this.queryProviderMentionItemsById({
            providerId: FILE_PROVIDER_ID,
            workspaceId: input.workspaceId,
            currentUserId: input.currentUserId,
            query: input.query,
            limit: this.currentFileSearchLimit,
            diagnostics: providerDiagnostics
          }),
          this.queryProviderMentionItemsById({
            providerId: WORKSPACE_APP_PROVIDER_ID,
            workspaceId: input.workspaceId,
            currentUserId: input.currentUserId,
            query: input.query,
            limit: DEFAULT_MENTION_GROUP_PAGE_SIZE,
            diagnostics: providerDiagnostics
          }),
          this.queryProviderMentionItemsById({
            providerId: WORKSPACE_ISSUE_PROVIDER_ID,
            workspaceId: input.workspaceId,
            currentUserId: input.currentUserId,
            query: input.query,
            limit: this.currentIssueSearchLimit,
            diagnostics: providerDiagnostics
          }),
          this.queryProviderMentionItemsById({
            providerId: AGENT_SESSION_PROVIDER_ID,
            workspaceId: input.workspaceId,
            currentUserId: input.currentUserId,
            query: input.query,
            limit: DEFAULT_SESSION_LIMIT,
            diagnostics: providerDiagnostics
          })
        ]
      );

      if (!this.canApply(input.requestId, input.workspaceId, input.query)) {
        return;
      }

      this.rawGroups = {
        apps: appItems.filter((item) => item.kind === "workspace-app"),
        opened_files: fileItems.filter((item) => item.kind === "file"),
        agent_generated_files: [],
        my_sessions: sessionItems.filter(
          (item) => item.kind === "session" && item.scope === "my_sessions"
        ),
        collab_sessions: sessionItems.filter(
          (item) => item.kind === "session" && item.scope === "collab_sessions"
        ),
        issues: issueItems.filter((item) => item.kind === "workspace-issue")
      };
      this.totalCounts.apps = this.rawGroups.apps.length;
      this.totalCounts.opened_files = this.rawGroups.opened_files.length;
      this.totalCounts.agent_generated_files = 0;
      this.totalCounts.my_sessions = this.rawGroups.my_sessions.length;
      this.totalCounts.collab_sessions = this.rawGroups.collab_sessions.length;
      this.totalCounts.issues = this.rawGroups.issues.length;
      const groups = this.groupsFromRawGroups();

      this.setState({
        status: "ready",
        query: input.query,
        mode: "results",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups,
        error: null
      });
      this.logSearchDiagnostic({
        filter: this.currentFilter,
        groups,
        mode: "results",
        providerDiagnostics,
        query: input.query,
        requestId: input.requestId,
        startedAt,
        status: "ready",
        workspaceId: input.workspaceId
      });
    } catch (error) {
      if (!this.canApply(input.requestId, input.workspaceId, input.query)) {
        return;
      }
      this.setState({
        status: "error",
        query: input.query,
        mode: "results",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: [],
        error: error instanceof Error ? error.message : String(error)
      });
      this.logSearchDiagnostic({
        error,
        filter: this.currentFilter,
        groups: [],
        mode: "results",
        providerDiagnostics,
        query: input.query,
        requestId: input.requestId,
        startedAt,
        status: "error",
        workspaceId: input.workspaceId
      });
    }
  }

  private async runBrowseSearch(input: {
    workspaceId: string;
    currentUserId: string;
    requestId: number;
    filter: AgentMentionFilterId;
    sessionCwd: string;
  }): Promise<void> {
    const startedAt = this.diagnosticNow();
    let providerDiagnostics: AgentMentionProviderQueryDiagnostic[] = [];
    const cacheKey = this.browseCacheKey(input);
    try {
      const result = await this.loadBrowseFetchResult(input, cacheKey, "open");
      providerDiagnostics = result.providerDiagnostics;
      if (!this.canApply(input.requestId, input.workspaceId, "")) {
        this.logLifecycle("browse.apply.skipped", {
          filter: input.filter,
          requestId: input.requestId,
          reason: "open",
          workspaceId: input.workspaceId
        });
        return;
      }
      this.applyBrowseFetchResult(result);
      const groups = this.groupsFromRawGroups();

      this.setState({
        status: "ready",
        query: "",
        mode: "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups,
        error: null
      });
      this.logSearchDiagnostic({
        filter: this.currentFilter,
        groups,
        mode: "browse",
        providerDiagnostics,
        query: "",
        requestId: input.requestId,
        startedAt,
        status: "ready",
        workspaceId: input.workspaceId
      });
    } catch (error) {
      if (!this.canApply(input.requestId, input.workspaceId, "")) {
        return;
      }
      this.setState({
        status: "error",
        query: "",
        mode: "browse",
        filter: this.currentFilter,
        categories: buildBrowseCategories(),
        groups: [],
        error: error instanceof Error ? error.message : String(error)
      });
      this.logSearchDiagnostic({
        error,
        filter: this.currentFilter,
        groups: [],
        mode: "browse",
        providerDiagnostics,
        query: "",
        requestId: input.requestId,
        startedAt,
        status: "error",
        workspaceId: input.workspaceId
      });
    }
  }

  private async loadBrowseFetchResult(
    input: {
      workspaceId: string;
      currentUserId: string;
      filter: AgentMentionFilterId;
      sessionCwd: string;
    },
    cacheKey: string,
    reason: AgentMentionBrowseLoadReason
  ): Promise<AgentMentionBrowseFetchResult> {
    const existingFetch = sharedAgentMentionBrowseFetches.get(cacheKey);
    if (existingFetch) {
      this.logLifecycle("browse.fetch.dedupe", {
        filter: input.filter,
        reason,
        workspaceId: input.workspaceId
      });
      return existingFetch;
    }
    const startedAt = this.diagnosticNow();
    this.logLifecycle("browse.fetch.start", {
      filter: input.filter,
      providerIds: this.providerIdsForDiagnostics(),
      reason,
      workspaceId: input.workspaceId
    });
    const fetchPromise = this.fetchBrowseResult(input)
      .then((result) => {
        writeBrowseCacheEntry(cacheKey, {
          ...result,
          cachedAt: this.diagnosticNow()
        });
        this.logLifecycle("browse.fetch.success", {
          durationMs: elapsedDiagnosticMs(this.diagnosticNow(), startedAt),
          filter: input.filter,
          itemCount: rawGroupItemCount(result.rawGroups),
          providerResults: providerDiagnosticsSummary(
            result.providerDiagnostics
          ),
          reason,
          workspaceId: input.workspaceId
        });
        return result;
      })
      .finally(() => {
        if (sharedAgentMentionBrowseFetches.get(cacheKey) === fetchPromise) {
          sharedAgentMentionBrowseFetches.delete(cacheKey);
        }
      });
    sharedAgentMentionBrowseFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  private async fetchBrowseResult(input: {
    workspaceId: string;
    currentUserId: string;
    filter: AgentMentionFilterId;
    sessionCwd: string;
  }): Promise<AgentMentionBrowseFetchResult> {
    const providerDiagnostics: AgentMentionProviderQueryDiagnostic[] = [];
    if (input.filter === "file") {
      const [fileItems, agentGeneratedFileItems] = await Promise.all([
        this.queryProviderMentionItemsById({
          providerId: FILE_PROVIDER_ID,
          workspaceId: input.workspaceId,
          currentUserId: input.currentUserId,
          query: "",
          limit: this.fileLimit,
          sessionCwd: input.sessionCwd,
          diagnostics: providerDiagnostics
        }),
        this.queryProviderMentionItemsById({
          providerId: AGENT_GENERATED_FILE_PROVIDER_ID,
          workspaceId: input.workspaceId,
          currentUserId: input.currentUserId,
          query: "",
          limit: this.fileLimit,
          sessionCwd: input.sessionCwd,
          diagnostics: providerDiagnostics
        })
      ]);
      const rawGroups: AgentMentionRawGroups = {
        apps: [],
        opened_files: fileItems.filter((item) => item.kind === "file"),
        agent_generated_files: agentGeneratedFileItems.filter(
          (item) => item.kind === "file"
        ),
        my_sessions: [],
        collab_sessions: [],
        issues: []
      };
      return {
        providerDiagnostics,
        rawGroups,
        totalCounts: totalCountsFromRawGroups(rawGroups)
      };
    }
    if (input.filter === "app") {
      const appItems = await this.queryProviderMentionItemsById({
        providerId: WORKSPACE_APP_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: DEFAULT_MENTION_GROUP_PAGE_SIZE,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      });
      const rawGroups: AgentMentionRawGroups = {
        apps: appItems.filter((item) => item.kind === "workspace-app"),
        opened_files: [],
        agent_generated_files: [],
        my_sessions: [],
        collab_sessions: [],
        issues: []
      };
      return {
        providerDiagnostics,
        rawGroups,
        totalCounts: totalCountsFromRawGroups(rawGroups)
      };
    }
    if (input.filter === "issue") {
      const issueItems = await this.queryProviderMentionItemsById({
        providerId: WORKSPACE_ISSUE_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: this.currentIssueSearchLimit,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      });
      const rawGroups: AgentMentionRawGroups = {
        apps: [],
        opened_files: [],
        agent_generated_files: [],
        my_sessions: [],
        collab_sessions: [],
        issues: issueItems.filter((item) => item.kind === "workspace-issue")
      };
      return {
        providerDiagnostics,
        rawGroups,
        totalCounts: totalCountsFromRawGroups(rawGroups)
      };
    }
    if (input.filter === "session") {
      const sessionItems = await this.queryProviderMentionItemsById({
        providerId: AGENT_SESSION_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: DEFAULT_SESSION_LIMIT,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      });
      const sessionMentionItems = sessionItems.filter(
        (item) => item.kind === "session"
      );
      const mySessionItems = sessionMentionItems
        .filter((item) =>
          input.currentUserId ? item.scope === "my_sessions" : true
        )
        .map((item) =>
          item.scope === "my_sessions"
            ? item
            : { ...item, scope: "my_sessions" as const }
        );
      const rawGroups: AgentMentionRawGroups = {
        apps: [],
        opened_files: [],
        agent_generated_files: [],
        my_sessions: mySessionItems,
        collab_sessions: [],
        issues: []
      };
      return {
        providerDiagnostics,
        rawGroups,
        totalCounts: totalCountsFromRawGroups(rawGroups)
      };
    }
    const [appItems, fileItems, issueItems, sessionItems] = await Promise.all([
      this.queryProviderMentionItemsById({
        providerId: WORKSPACE_APP_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: DEFAULT_MENTION_GROUP_PAGE_SIZE,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      }),
      this.queryProviderMentionItemsById({
        providerId: FILE_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: this.fileLimit,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      }),
      this.queryProviderMentionItemsById({
        providerId: WORKSPACE_ISSUE_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: this.currentIssueSearchLimit,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      }),
      this.queryProviderMentionItemsById({
        providerId: AGENT_SESSION_PROVIDER_ID,
        workspaceId: input.workspaceId,
        currentUserId: input.currentUserId,
        query: "",
        limit: DEFAULT_SESSION_LIMIT,
        sessionCwd: input.sessionCwd,
        diagnostics: providerDiagnostics
      })
    ]);
    const rawGroups: AgentMentionRawGroups = {
      apps: appItems.filter((item) => item.kind === "workspace-app"),
      opened_files: fileItems.filter((item) => item.kind === "file"),
      agent_generated_files: [],
      my_sessions: sessionItems.filter(
        (item) => item.kind === "session" && item.scope === "my_sessions"
      ),
      collab_sessions: sessionItems.filter(
        (item) => item.kind === "session" && item.scope === "collab_sessions"
      ),
      issues: issueItems.filter((item) => item.kind === "workspace-issue")
    };
    return {
      providerDiagnostics,
      rawGroups,
      totalCounts: totalCountsFromRawGroups(rawGroups)
    };
  }

  private async queryProviderMentionItems(input: {
    provider: AgentContextMentionProvider;
    workspaceId: string;
    currentUserId: string;
    query: string;
    limit: number;
    sessionCwd: string;
    abortSignal: AbortSignal;
  }): Promise<AgentContextMentionItem[]> {
    const items = await input.provider.query({
      keyword: input.query,
      maxResults: input.limit,
      abortSignal: input.abortSignal,
      trigger: "@",
      context: {
        metadata: {
          currentUserId: input.currentUserId,
          sessionCwd: input.sessionCwd || undefined,
          target: "agent-gui",
          workspaceId: input.workspaceId
        }
      }
    });
    if (input.abortSignal.aborted) {
      return [];
    }
    const mentionItems = await Promise.all(
      items.map(async (item) => {
        const mentionItem = providerItemToAgentMentionItem({
          currentUserId: input.currentUserId,
          insertResult: input.provider.toInsertResult(item),
          label: input.provider.getItemLabel(item),
          providerId: input.provider.id,
          subtitle: input.provider.getItemSubtitle?.(item) ?? "",
          workspaceId: input.workspaceId
        });
        if (!mentionItem || mentionItem.kind !== "file") {
          return mentionItem;
        }
        const iconUrl = await Promise.resolve(
          input.provider.getItemIconUrl?.(item) ?? null
        ).catch(() => null);
        const resolvedThumbnailUrl = resolveAgentMentionFileThumbnailUrl({
          ...mentionItem,
          thumbnailUrl: iconUrl
        });
        if (!resolvedThumbnailUrl) {
          return mentionItem;
        }
        return {
          ...mentionItem,
          thumbnailUrl: resolvedThumbnailUrl
        };
      })
    );
    return mentionItems.filter(
      (item): item is AgentContextMentionItem => item !== null
    );
  }

  private applyBrowseFetchResult(result: AgentMentionBrowseFetchResult): void {
    this.rawGroups = cloneAgentMentionRawGroups(result.rawGroups);
    this.resetTotalCounts();
    for (const [groupId, count] of Object.entries(result.totalCounts) as [
      AgentMentionGroupId,
      number
    ][]) {
      this.totalCounts[groupId] = count;
    }
  }

  private readBrowseCache(cacheKey: string): {
    entry: AgentMentionBrowseCacheEntry | null;
    isFresh: boolean;
  } {
    const entry = sharedAgentMentionBrowseCache.get(cacheKey);
    if (!entry) {
      return { entry: null, isFresh: false };
    }
    // Touch for LRU recency. We deliberately keep returning stale entries (no
    // delete here) so the stale-while-revalidate path can still surface them.
    sharedAgentMentionBrowseCache.delete(cacheKey);
    sharedAgentMentionBrowseCache.set(cacheKey, entry);
    const ageMs = this.diagnosticNow() - entry.cachedAt;
    const isFresh =
      this.browseCacheTtlMs >= 0 &&
      Number.isFinite(this.browseCacheTtlMs) &&
      ageMs <= this.browseCacheTtlMs;
    return { entry, isFresh };
  }

  private readBrowseCacheForBrowseInput(input: {
    cacheKey: string;
    workspaceId: string;
    currentUserId: string;
    filter: AgentMentionFilterId;
    sessionCwd: string;
  }): {
    entry: AgentMentionBrowseCacheEntry | null;
    isFresh: boolean;
  } {
    const direct = this.readBrowseCache(input.cacheKey);
    if (direct.entry || input.filter === "all") {
      return direct;
    }
    const allCacheKey = this.browseCacheKey({
      workspaceId: input.workspaceId,
      currentUserId: input.currentUserId,
      filter: "all",
      sessionCwd: input.sessionCwd
    });
    const allCached = this.readBrowseCache(allCacheKey);
    if (!allCached.entry || !canDeriveBrowseFilterFromAll(input.filter)) {
      return direct;
    }
    return {
      entry: deriveBrowseCacheEntryForFilter(allCached.entry, input.filter),
      isFresh: allCached.isFresh
    };
  }

  private browseCacheKey(input: {
    workspaceId: string;
    currentUserId: string;
    filter: AgentMentionFilterId;
    sessionCwd: string;
  }): string {
    return JSON.stringify({
      workspaceId: input.workspaceId,
      currentUserId: input.currentUserId,
      sessionCwd: input.sessionCwd,
      filter: input.filter,
      fileLimit: this.fileLimit,
      issueLimit: this.currentIssueSearchLimit,
      providerIds: [...this.contextMentionProviders.keys()].sort()
    });
  }

  private logBrowseCacheState(input: {
    cacheKey: string;
    cached: { entry: AgentMentionBrowseCacheEntry | null; isFresh: boolean };
    filter: AgentMentionFilterId;
    reason: AgentMentionBrowseLoadReason;
    workspaceId: string;
  }): void {
    this.logLifecycle("browse.cache", {
      ageMs: input.cached.entry
        ? elapsedDiagnosticMs(this.diagnosticNow(), input.cached.entry.cachedAt)
        : null,
      cacheKeyLength: input.cacheKey.length,
      cacheState: input.cached.entry
        ? input.cached.isFresh
          ? "fresh"
          : "stale"
        : "miss",
      filter: input.filter,
      itemCount: input.cached.entry
        ? rawGroupItemCount(input.cached.entry.rawGroups)
        : 0,
      reason: input.reason,
      workspaceId: input.workspaceId
    });
  }

  private logLifecycle(
    event: AgentMentionLifecycleDiagnosticLog["event"],
    details: Record<string, RuntimeDiagnosticsDetailValue>
  ): void {
    logAgentMentionLifecycleDiagnostic({ event, details });
  }

  private providerIdsForDiagnostics(): string {
    return [...this.contextMentionProviders.keys()].sort().join(",");
  }

  private async queryProviderMentionItemsById(input: {
    diagnostics: AgentMentionProviderQueryDiagnostic[];
    providerId: string;
    workspaceId: string;
    currentUserId: string;
    query: string;
    limit: number;
    sessionCwd?: string;
  }): Promise<AgentContextMentionItem[]> {
    const provider = this.contextMentionProviders.get(input.providerId);
    return queryAgentMentionProviderWithDiagnostics({
      diagnosticNow: this.diagnosticNow,
      diagnostics: input.diagnostics,
      fallback: [] as AgentContextMentionItem[],
      providerId: input.providerId,
      providerTimeoutMs: this.providerTimeoutMs,
      query: provider
        ? (abortSignal) =>
            this.queryProviderMentionItems({
              provider,
              workspaceId: input.workspaceId,
              currentUserId: input.currentUserId,
              query: input.query,
              limit: input.limit,
              sessionCwd: input.sessionCwd ?? this.currentSessionCwd,
              abortSignal
            })
        : null,
      resultCount: (result) => result.length
    });
  }

  private logSearchDiagnostic(input: {
    error?: unknown;
    filter: AgentMentionFilterId;
    groups: readonly AgentMentionGroup[];
    mode: "browse" | "results";
    providerDiagnostics: readonly AgentMentionProviderQueryDiagnostic[];
    query: string;
    requestId: number;
    startedAt: number;
    status: "ready" | "error";
    workspaceId: string;
  }): void {
    emitAgentMentionSearchDiagnostic({
      debounceMs: this.debounceMs,
      diagnosticInfoLogger: this.diagnosticInfoLogger,
      diagnosticNow: this.diagnosticNow,
      diagnosticSlowThresholdMs: this.diagnosticSlowThresholdMs,
      error: input.error,
      filter: input.filter,
      groups: input.groups,
      mode: input.mode,
      providerDiagnostics: input.providerDiagnostics,
      providerTimeoutMs: this.providerTimeoutMs,
      query: input.query,
      requestId: input.requestId,
      startedAt: input.startedAt,
      status: input.status,
      workspaceId: input.workspaceId
    });
  }

  private groupsFromRawGroups(): AgentMentionGroup[] {
    const orderedGroupIds = groupIdsForFilter(this.currentFilter);
    const groups = orderedGroupIds
      .map((groupId) => {
        const rawItems = resolveMentionGroupItems(groupId, this.rawGroups);
        const items =
          groupId === "agent_generated_files"
            ? presentAgentGeneratedFileMentionItems({
                files: rawItems,
                browsePath: this.agentGeneratedBrowsePath,
                query: this.currentQuery
              })
            : rawItems;
        if (items.length === 0) {
          if (
            !shouldShowEmptyGroup(
              groupId,
              this.currentFilter,
              this.currentQuery
            )
          ) {
            return null;
          }
          return buildEmptyGroup(groupId, this.currentQuery);
        }
        const pageSize = mentionGroupPageSize(this.currentFilter, groupId);
        const visibleCount = Math.min(
          items.length,
          this.expandedCounts[groupId] ?? pageSize
        );
        const totalCount = resolveMentionGroupTotalCount(
          groupId,
          this.totalCounts,
          items.length
        );
        return {
          id: groupId,
          items: items.slice(0, visibleCount),
          totalCount,
          visibleCount,
          hasMore:
            items.length > visibleCount ||
            ((groupId === "opened_files" ||
              groupId === "files" ||
              groupId === "agent_generated_files") &&
              items.length >= this.currentFileSearchLimit) ||
            totalCount > visibleCount
        } satisfies AgentMentionGroup;
      })
      .filter((group): group is AgentMentionGroup => group !== null);
    return orderMentionGroupsForFilter({
      filter: this.currentFilter,
      groups,
      query: this.currentQuery
    });
  }

  private emitBrowseState(status: "ready" | "loading"): void {
    this.setState({
      status,
      query: "",
      mode: "browse",
      filter: this.currentFilter,
      categories: buildBrowseCategories(),
      groups: [],
      error: null
    });
  }

  private canApply(
    requestId: number,
    workspaceId: string,
    query: string
  ): boolean {
    return (
      !this.disposed &&
      requestId === this.requestId &&
      workspaceId === this.activeWorkspaceId &&
      query === this.currentQuery
    );
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private resetExpandedCounts(): void {
    for (const groupId of [
      "files",
      "opened_files",
      "agent_generated_files",
      "my_sessions",
      "collab_sessions",
      "apps",
      "issues"
    ] as const) {
      this.expandedCounts[groupId] = mentionGroupPageSize(
        this.currentFilter,
        groupId
      );
    }
  }

  private resetSearchLimits(): void {
    this.currentFileSearchLimit = this.fileLimit;
    this.currentIssueSearchLimit = this.issueLimit;
  }

  private resetAgentGeneratedBrowsePath(): void {
    this.agentGeneratedBrowsePath = null;
  }

  private resetTotalCounts(): void {
    for (const groupId of [
      "files",
      "opened_files",
      "agent_generated_files",
      "my_sessions",
      "collab_sessions",
      "apps",
      "issues"
    ] as const) {
      delete this.totalCounts[groupId];
    }
  }

  private setState(state: AgentMentionSearchState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener(state);
    }
  }
}

function emptyAgentMentionRawGroups(): AgentMentionRawGroups {
  return {
    apps: [],
    opened_files: [],
    agent_generated_files: [],
    my_sessions: [],
    collab_sessions: [],
    issues: []
  };
}

function cloneAgentMentionRawGroups(
  rawGroups: AgentMentionRawGroups
): AgentMentionRawGroups {
  return {
    apps: [...rawGroups.apps],
    opened_files: [...rawGroups.opened_files],
    agent_generated_files: [...rawGroups.agent_generated_files],
    my_sessions: [...rawGroups.my_sessions],
    collab_sessions: [...rawGroups.collab_sessions],
    issues: [...rawGroups.issues]
  };
}

function totalCountsFromRawGroups(
  rawGroups: AgentMentionRawGroups
): AgentMentionTotalCounts {
  return {
    apps: rawGroups.apps.length,
    opened_files: rawGroups.opened_files.length,
    agent_generated_files: rawGroups.agent_generated_files.length,
    my_sessions: rawGroups.my_sessions.length,
    collab_sessions: rawGroups.collab_sessions.length,
    issues: rawGroups.issues.length
  };
}

function rawGroupItemCount(rawGroups: AgentMentionRawGroups): number {
  return Object.values(rawGroups).reduce(
    (count, items) => count + items.length,
    0
  );
}

function canDeriveBrowseFilterFromAll(
  filter: AgentMentionFilterId
): filter is "app" | "issue" | "session" {
  return filter === "app" || filter === "issue" || filter === "session";
}

function deriveBrowseCacheEntryForFilter(
  entry: AgentMentionBrowseCacheEntry,
  filter: "app" | "issue" | "session"
): AgentMentionBrowseCacheEntry {
  const rawGroups = deriveRawGroupsForFilter(entry.rawGroups, filter);
  return {
    providerDiagnostics: entry.providerDiagnostics,
    rawGroups,
    totalCounts: totalCountsFromRawGroups(rawGroups),
    cachedAt: entry.cachedAt
  };
}

function deriveRawGroupsForFilter(
  rawGroups: AgentMentionRawGroups,
  filter: "app" | "issue" | "session"
): AgentMentionRawGroups {
  if (filter === "app") {
    return {
      apps: rawGroups.apps,
      opened_files: [],
      agent_generated_files: [],
      my_sessions: [],
      collab_sessions: [],
      issues: []
    };
  }
  if (filter === "issue") {
    return {
      apps: [],
      opened_files: [],
      agent_generated_files: [],
      my_sessions: [],
      collab_sessions: [],
      issues: rawGroups.issues
    };
  }
  return {
    apps: [],
    opened_files: [],
    agent_generated_files: [],
    my_sessions: rawGroups.my_sessions,
    collab_sessions: [],
    issues: []
  };
}

function providerDiagnosticsSummary(
  diagnostics: readonly AgentMentionProviderQueryDiagnostic[]
): string {
  return diagnostics
    .map(
      (diagnostic) =>
        `${diagnostic.providerId}:${diagnostic.status}:${diagnostic.resultCount}:${diagnostic.durationMs}`
    )
    .join(",");
}

function elapsedDiagnosticMs(now: number, startedAt: number): number {
  const durationMs = now - startedAt;
  return Number.isFinite(durationMs) ? Math.max(0, Math.round(durationMs)) : 0;
}

function diagnosticErrorKind(error: unknown): string {
  if (error instanceof Error && error.name.trim()) {
    return error.name.trim();
  }
  if (error === null) {
    return "null";
  }
  return typeof error;
}

function logAgentMentionLifecycleDiagnostic(
  payload: AgentMentionLifecycleDiagnosticLog
): void {
  try {
    console.info(AGENT_MENTION_LIFECYCLE_LOG_PREFIX, JSON.stringify(payload));
  } catch {
    // Diagnostic logging must never affect mention search state.
  }
  try {
    getOptionalAgentHostApi()?.debug?.logRuntimeDiagnostics?.({
      source: "renderer-workspace-surface",
      level: "info",
      event: `agent-gui.mention.${payload.event}`,
      // i18n-check-ignore: Internal diagnostic log message.
      message: "Agent GUI mention search lifecycle event.",
      details: payload.details
    });
  } catch {
    // Diagnostic logging must never affect mention search state.
  }
}

function orderMentionGroupsForFilter(input: {
  filter: AgentMentionFilterId;
  groups: AgentMentionGroup[];
  query: string;
}): AgentMentionGroup[] {
  if (input.filter !== "all") {
    return input.groups;
  }
  const query = normalizeQuery(input.query).toLowerCase();
  return input.groups
    .map((group, index) => ({
      group,
      hasItems: group.items.length > 0,
      index,
      score: mentionGroupBestMatchScore(group, query)
    }))
    .sort((left, right) => {
      if (left.hasItems !== right.hasItems) {
        return left.hasItems ? -1 : 1;
      }
      if (query && left.score !== right.score) {
        return right.score - left.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.group);
}

function mentionGroupBestMatchScore(
  group: AgentMentionGroup,
  query: string
): number {
  if (!query) {
    return 0;
  }
  return group.items.reduce(
    (bestScore, item) =>
      Math.max(bestScore, mentionItemMatchScore(item, query)),
    0
  );
}

function mentionItemMatchScore(
  item: AgentContextMentionItem,
  query: string
): number {
  const primary: string[] = [];
  const secondary: string[] = [];
  let kindBoost = 0;

  if (item.kind === "workspace-app") {
    kindBoost = 8;
    primary.push(item.name, item.appId, item.targetId);
    secondary.push(item.description ?? "");
  } else if (item.kind === "file") {
    primary.push(item.name);
    secondary.push(item.path, item.directoryPath);
  } else if (item.kind === "session") {
    primary.push(item.title);
    secondary.push(
      item.name,
      item.initiatorName,
      item.agentName,
      item.inputPreview ?? "",
      item.summaryPreview ?? ""
    );
  } else if (item.kind === "workspace-issue") {
    primary.push(item.title, item.name);
    secondary.push(
      item.creatorName ?? "",
      item.status ?? "",
      item.contentPreview ?? ""
    );
  } else if (item.kind === "workspace-app-factory") {
    primary.push(item.name, item.jobId, item.targetId);
    secondary.push(item.action ?? "", item.contextPath ?? "");
  }

  const primaryScore = maxTextMatchScore(primary, query, {
    contains: 60,
    exact: 100,
    prefix: 90,
    wordPrefix: 80
  });
  const secondaryScore = maxTextMatchScore(secondary, query, {
    contains: 25,
    exact: 60,
    prefix: 50,
    wordPrefix: 40
  });
  const score = Math.max(primaryScore, secondaryScore);
  return score > 0 ? score + kindBoost : 0;
}

function maxTextMatchScore(
  values: readonly string[],
  query: string,
  scores: {
    contains: number;
    exact: number;
    prefix: number;
    wordPrefix: number;
  }
): number {
  return values.reduce(
    (bestScore, value) =>
      Math.max(bestScore, textMatchScore(value, query, scores)),
    0
  );
}

function textMatchScore(
  value: string,
  query: string,
  scores: {
    contains: number;
    exact: number;
    prefix: number;
    wordPrefix: number;
  }
): number {
  const normalized = normalizeQuery(value).toLowerCase();
  if (!normalized) {
    return 0;
  }
  if (normalized === query) {
    return scores.exact;
  }
  if (normalized.startsWith(query)) {
    return scores.prefix;
  }
  if (normalized.split(/[^a-z0-9]+/i).some((word) => word.startsWith(query))) {
    return scores.wordPrefix;
  }
  return normalized.includes(query) ? scores.contains : 0;
}

function providerItemToAgentMentionItem(input: {
  currentUserId: string;
  providerId: string;
  insertResult: AgentContextMentionInsertResult;
  label: string;
  subtitle: string;
  workspaceId: string;
}): AgentContextMentionItem | null {
  const label = compactText(input.label);
  if (!label) {
    return null;
  }
  if (input.insertResult.kind === "markdown-link") {
    const href = input.insertResult.href.trim();
    return {
      kind: "file",
      href,
      path: href,
      name: label,
      entryKind: href.endsWith("/") ? "directory" : "unknown",
      directoryPath: dirnameFromProviderWorkspaceFileHref(href)
    };
  }
  if (input.insertResult.kind !== "mention") {
    return null;
  }

  const mention = input.insertResult.mention;
  const targetId = mention.entityId.trim();
  if (!targetId) {
    return null;
  }
  const scope = normalizeMentionScope(mention.scope);
  const presentation = mention.presentation ?? {};
  const workspaceId = scope.workspaceId || input.workspaceId;
  if (
    input.providerId === FILE_PROVIDER_ID ||
    input.providerId === AGENT_GENERATED_FILE_PROVIDER_ID
  ) {
    return {
      kind: "file",
      href: buildAgentGenericMentionHref(input.providerId, targetId, scope),
      path: targetId,
      name: label,
      entryKind: targetId.endsWith("/") ? "directory" : "unknown",
      directoryPath: dirnameFromProviderWorkspaceFileHref(targetId),
      thumbnailUrl: presentation.thumbnailUrl?.trim() || undefined
    };
  }
  if (input.providerId === WORKSPACE_ISSUE_PROVIDER_ID) {
    return {
      kind: "workspace-issue",
      href: buildAgentWorkspaceIssueMentionHref(workspaceId, targetId, {
        topicId: scope.topicId
      }),
      workspaceId,
      targetId,
      topicId: scope.topicId,
      name: label,
      title: label,
      status: presentation.status?.trim() || undefined,
      contentPreview:
        compactText(presentation.description) ||
        compactText(input.subtitle) ||
        undefined
    };
  }
  if (input.providerId === WORKSPACE_APP_PROVIDER_ID) {
    const appId = targetId;
    return {
      kind: "workspace-app",
      href: buildAgentWorkspaceAppMentionHref(workspaceId, appId),
      workspaceId,
      targetId: appId,
      appId,
      name: label,
      description:
        compactText(presentation.description) ||
        compactText(presentation.subtitle) ||
        compactText(input.subtitle) ||
        undefined,
      iconUrl: presentation.iconUrl?.trim() || undefined,
      referencesListSupported: presentation.referencesListSupported === "true"
    };
  }
  if (input.providerId === AGENT_SESSION_PROVIDER_ID) {
    const agentName = presentation.subtitle?.trim() || "";
    const title = normalizeAgentSessionMentionTitle(label) || label;
    const description = compactText(presentation.description);
    const summaryPreview =
      description || compactText(input.subtitle) || undefined;
    return {
      kind: "session",
      href: buildAgentSessionMentionHref(workspaceId, targetId),
      workspaceId,
      targetId,
      name: label,
      title,
      scope: mentionSessionScope({
        currentUserId: input.currentUserId,
        rawScope: scope.scope,
        userId: scope.userId
      }),
      initiatorName: "",
      agentName,
      status: presentation.status?.trim() || undefined,
      inputPreview: description || undefined,
      summaryPreview
    };
  }
  return null;
}

function normalizeMentionScope(
  scope?: Readonly<Record<string, string>>
): Partial<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(scope ?? {})
      .map(([key, value]) => [key.trim(), value.trim()] as const)
      .filter(([key, value]) => key.length > 0 && value.length > 0)
  );
}

function mentionSessionScope(input: {
  currentUserId: string;
  rawScope: string | undefined;
  userId?: string;
}): Extract<AgentContextMentionItem, { kind: "session" }>["scope"] {
  const rawScope = input.rawScope?.trim() ?? "";
  if (rawScope === "my_sessions" || rawScope === "collab_sessions") {
    return rawScope;
  }
  const userId = input.userId?.trim() ?? "";
  const currentUserId = input.currentUserId.trim();
  if (
    !userId ||
    !currentUserId ||
    userId === "local" ||
    currentUserId === "local"
  ) {
    return "my_sessions";
  }
  return userId === currentUserId ? "my_sessions" : "collab_sessions";
}

function dirnameFromProviderWorkspaceFileHref(href: string): string {
  const normalized = href.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return normalized.slice(0, index);
}
