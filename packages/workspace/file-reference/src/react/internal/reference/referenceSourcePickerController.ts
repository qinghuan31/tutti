import { proxy } from "valtio/vanilla";
import type {
  ReferenceNode,
  ReferenceScope,
  SelectedReference
} from "../../../contracts/referenceSource.ts";
import type {
  ReferenceSourceAggregator,
  ReferenceSourceTab
} from "../../../core/referenceSourceAggregator.ts";
import { SOURCE_ROOT_NODE_ID } from "../../../core/referenceSourceAggregator.ts";
import {
  appendReferencePage,
  nodeRefKey,
  sortReferenceNodes
} from "../../../core/referenceSourceUtils.ts";

/**
 * node-keyed 多源 picker 的逻辑层 controller(顶部分源 tab)。
 * 独立于现有 WorkspaceFileReferencePickerController —— issue-manager 不受影响。
 * 设计见 docs/architecture/agent-reference-source-services.md §2 / §3。
 *
 * 本层只管:tabs、per-source inline 展开树(node-keyed)、cursor 加载更多、
 * per-tab 搜索、跨 tab 选中集、confirm。预览/打开留待 UI 接入步骤。
 */

export type ReferenceSourcePickerMode = "browse" | "search";

export interface ReferenceSourceNodeChildrenState {
  /** 已累积的子节点(含多页 append)。 */
  entries: ReferenceNode[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: Error | null;
}

export interface ReferenceSourceTabState {
  sourceId: string;
  expandedKeys: Record<string, boolean>;
  /** key = nodeRefKey;源根用 ROOT_CHILDREN_KEY。 */
  childrenByKey: Record<string, ReferenceSourceNodeChildrenState>;
  mode: ReferenceSourcePickerMode;
  searchQuery: string;
  searchEntries: ReferenceNode[];
  searchNextCursor: string | null;
  isSearchLoading: boolean;
  searchError: Error | null;
}

export interface ReferenceSourcePickerSnapshot {
  isLoadingTabs: boolean;
  tabsError: Error | null;
  tabs: ReferenceSourceTab[];
  activeSourceId: string | null;
  bySource: Record<string, ReferenceSourceTabState>;
  /** 跨 tab 累积的选中文件节点,按选中顺序。 */
  selection: ReferenceNode[];
}

export interface ReferenceSourcePickerController {
  readonly store: ReferenceSourcePickerSnapshot;
  getSnapshot(): ReferenceSourcePickerSnapshot;
  open(): void;
  close(): void;
  reset(): void;
  setActiveSource(sourceId: string): void;
  toggleNode(node: ReferenceNode): void;
  loadMore(node: ReferenceNode | null): void;
  setSearchQuery(query: string): void;
  toggleSelection(node: ReferenceNode): void;
  clearSelection(): void;
  confirm(): SelectedReference[];
}

export interface CreateReferenceSourcePickerControllerInput {
  aggregator: ReferenceSourceAggregator;
  scope: ReferenceScope;
  searchDebounceMs?: number;
}

/** 源根 children 的 key(node===null 时)。 */
export const ROOT_CHILDREN_KEY = nodeRefKey({
  sourceId: "",
  nodeId: SOURCE_ROOT_NODE_ID
});

const defaultSearchDebounceMs = 180;

function emptyTabState(sourceId: string): ReferenceSourceTabState {
  return {
    sourceId,
    expandedKeys: {},
    childrenByKey: {},
    mode: "browse",
    searchQuery: "",
    searchEntries: [],
    searchNextCursor: null,
    isSearchLoading: false,
    searchError: null
  };
}

function emptyChildrenState(): ReferenceSourceNodeChildrenState {
  return {
    entries: [],
    nextCursor: null,
    loaded: false,
    loading: false,
    error: null
  };
}

export function createReferenceSourcePickerController(
  input: CreateReferenceSourcePickerControllerInput
): ReferenceSourcePickerController {
  const { aggregator, scope } = input;
  const searchDebounceMs = input.searchDebounceMs ?? defaultSearchDebounceMs;

  let retained = false;
  let tabsSequence = 0;
  let browseSequence = 0;
  let searchSequence = 0;
  let searchAbortController: AbortController | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let snapshot: ReferenceSourcePickerSnapshot = {
    isLoadingTabs: false,
    tabsError: null,
    tabs: [],
    activeSourceId: null,
    bySource: {},
    selection: []
  };
  const store = proxy(snapshot);

  const setSnapshot = (
    update:
      | Partial<ReferenceSourcePickerSnapshot>
      | ((
          current: ReferenceSourcePickerSnapshot
        ) => ReferenceSourcePickerSnapshot)
  ) => {
    const next =
      typeof update === "function"
        ? update(snapshot)
        : { ...snapshot, ...update };
    if (next === snapshot) {
      return;
    }
    snapshot = next;
    Object.assign(store, next);
  };

  /** 不可变地更新某 tab 的状态。 */
  const updateTab = (
    sourceId: string,
    updater: (tab: ReferenceSourceTabState) => ReferenceSourceTabState
  ) => {
    setSnapshot((current) => {
      const existing = current.bySource[sourceId] ?? emptyTabState(sourceId);
      const nextTab = updater(existing);
      if (nextTab === existing) {
        return current;
      }
      return {
        ...current,
        bySource: { ...current.bySource, [sourceId]: nextTab }
      };
    });
  };

  const childrenKeyForNode = (node: ReferenceNode | null): string =>
    node ? nodeRefKey(node.ref) : ROOT_CHILDREN_KEY;

  const setChildrenState = (
    sourceId: string,
    key: string,
    patch: Partial<ReferenceSourceNodeChildrenState>
  ) => {
    updateTab(sourceId, (tab) => {
      const current = tab.childrenByKey[key] ?? emptyChildrenState();
      return {
        ...tab,
        childrenByKey: {
          ...tab.childrenByKey,
          [key]: { ...current, ...patch }
        }
      };
    });
  };

  const loadChildren = async (
    sourceId: string,
    node: ReferenceNode | null,
    options: { append: boolean }
  ) => {
    if (!retained) {
      return;
    }
    const key = childrenKeyForNode(node);
    const tab = snapshot.bySource[sourceId];
    const existing = tab?.childrenByKey[key];
    const cursor = options.append ? (existing?.nextCursor ?? null) : null;
    if (existing?.loading) {
      return;
    }
    if (options.append && !cursor) {
      return;
    }

    const sequence = ++browseSequence;
    setChildrenState(sourceId, key, { loading: true, error: null });

    try {
      const result = await aggregator.listChildren(
        scope,
        node ? node.ref : { sourceId, nodeId: SOURCE_ROOT_NODE_ID },
        { cursor }
      );
      if (!retained || sequence !== browseSequence) {
        return;
      }
      // append 走 cursor 语义:保序 append + 去重,不重排已得项(不变式 #4)。
      // 首次加载则整体排序(folder 在前、按名)。
      const prior =
        snapshot.bySource[sourceId]?.childrenByKey[key]?.entries ?? [];
      const entries = options.append
        ? appendReferencePage(prior, result.entries)
        : sortReferenceNodes(result.entries);
      setChildrenState(sourceId, key, {
        entries,
        nextCursor: result.nextCursor ?? null,
        loaded: true,
        loading: false,
        error: null
      });
    } catch (error) {
      if (!retained || sequence !== browseSequence) {
        return;
      }
      setChildrenState(sourceId, key, {
        loading: false,
        error: normalizeError(error, "load children failed")
      });
    }
  };

  const ensureRootLoaded = (sourceId: string) => {
    const root = snapshot.bySource[sourceId]?.childrenByKey[ROOT_CHILDREN_KEY];
    if (root?.loaded || root?.loading) {
      return;
    }
    void loadChildren(sourceId, null, { append: false });
  };

  const loadTabs = async () => {
    if (!retained) {
      return;
    }
    const sequence = ++tabsSequence;
    setSnapshot({ isLoadingTabs: true, tabsError: null });
    try {
      const tabs = await aggregator.listSources(scope);
      if (!retained || sequence !== tabsSequence) {
        return;
      }
      const activeSourceId =
        snapshot.activeSourceId &&
        tabs.some((tab) => tab.sourceId === snapshot.activeSourceId)
          ? snapshot.activeSourceId
          : (tabs[0]?.sourceId ?? null);
      setSnapshot((current) => ({
        ...current,
        isLoadingTabs: false,
        tabs,
        activeSourceId,
        bySource: Object.fromEntries(
          tabs.map((tab) => [
            tab.sourceId,
            current.bySource[tab.sourceId] ?? emptyTabState(tab.sourceId)
          ])
        )
      }));
      if (activeSourceId) {
        ensureRootLoaded(activeSourceId);
      }
    } catch (error) {
      if (!retained || sequence !== tabsSequence) {
        return;
      }
      setSnapshot({
        isLoadingTabs: false,
        tabsError: normalizeError(error, "load reference sources failed")
      });
    }
  };

  const clearSearchTimer = () => {
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
  };

  const cancelSearch = () => {
    clearSearchTimer();
    searchSequence += 1;
    searchAbortController?.abort();
    searchAbortController = null;
  };

  const runSearch = async (sourceId: string, query: string) => {
    if (!retained) {
      return;
    }
    const sequence = ++searchSequence;
    searchAbortController?.abort();
    const abortController = new AbortController();
    searchAbortController = abortController;
    updateTab(sourceId, (tab) => ({
      ...tab,
      isSearchLoading: true,
      searchError: null
    }));
    try {
      const result = await aggregator.search(scope, sourceId, {
        query,
        signal: abortController.signal
      });
      if (!retained || sequence !== searchSequence) {
        return;
      }
      updateTab(sourceId, (tab) => ({
        ...tab,
        isSearchLoading: false,
        searchEntries: sortReferenceNodes(result.entries),
        searchNextCursor: result.nextCursor ?? null,
        searchError: null
      }));
    } catch (error) {
      if (isAbortError(error) || !retained || sequence !== searchSequence) {
        return;
      }
      updateTab(sourceId, (tab) => ({
        ...tab,
        isSearchLoading: false,
        searchEntries: [],
        searchError: normalizeError(error, "reference search failed")
      }));
    } finally {
      if (sequence === searchSequence) {
        searchAbortController = null;
      }
    }
  };

  const scheduleSearch = (sourceId: string, query: string) => {
    clearSearchTimer();
    if (!retained || !query) {
      return;
    }
    if (searchDebounceMs <= 0) {
      void runSearch(sourceId, query);
      return;
    }
    searchTimer = setTimeout(() => {
      searchTimer = null;
      void runSearch(sourceId, query);
    }, searchDebounceMs);
  };

  return {
    get store() {
      return store;
    },
    getSnapshot() {
      return snapshot;
    },
    open() {
      if (retained) {
        return;
      }
      retained = true;
      void loadTabs();
    },
    close() {
      retained = false;
      cancelSearch();
      browseSequence += 1;
      tabsSequence += 1;
    },
    reset() {
      cancelSearch();
      browseSequence += 1;
      tabsSequence += 1;
      setSnapshot({
        isLoadingTabs: false,
        tabsError: null,
        tabs: [],
        activeSourceId: null,
        bySource: {},
        selection: []
      });
    },
    setActiveSource(sourceId) {
      if (!snapshot.tabs.some((tab) => tab.sourceId === sourceId)) {
        return;
      }
      cancelSearch();
      setSnapshot({ activeSourceId: sourceId });
      const tab = snapshot.bySource[sourceId];
      if (tab?.mode === "search" && tab.searchQuery.trim()) {
        scheduleSearch(sourceId, tab.searchQuery.trim());
      } else {
        ensureRootLoaded(sourceId);
      }
    },
    toggleNode(node) {
      if (node.kind !== "folder") {
        return;
      }
      const sourceId = node.ref.sourceId;
      const key = nodeRefKey(node.ref);
      const wasExpanded =
        snapshot.bySource[sourceId]?.expandedKeys[key] ?? false;
      const nextExpanded = !wasExpanded;
      updateTab(sourceId, (tab) => ({
        ...tab,
        expandedKeys: { ...tab.expandedKeys, [key]: nextExpanded }
      }));
      const childState = snapshot.bySource[sourceId]?.childrenByKey[key];
      if (nextExpanded && !childState?.loaded && !childState?.loading) {
        void loadChildren(sourceId, node, { append: false });
      }
    },
    loadMore(node) {
      const sourceId = node ? node.ref.sourceId : snapshot.activeSourceId;
      if (!sourceId) {
        return;
      }
      void loadChildren(sourceId, node, { append: true });
    },
    setSearchQuery(query) {
      const sourceId = snapshot.activeSourceId;
      if (!sourceId) {
        return;
      }
      const trimmed = query.trim();
      const nextMode: ReferenceSourcePickerMode = trimmed ? "search" : "browse";
      updateTab(sourceId, (tab) => ({
        ...tab,
        searchQuery: query,
        mode: nextMode,
        ...(nextMode === "browse"
          ? { isSearchLoading: false, searchEntries: [], searchError: null }
          : {})
      }));
      if (nextMode === "search") {
        scheduleSearch(sourceId, trimmed);
      } else {
        cancelSearch();
        ensureRootLoaded(sourceId);
      }
    },
    toggleSelection(node) {
      if (node.kind !== "file") {
        return;
      }
      const key = nodeRefKey(node.ref);
      setSnapshot((current) => {
        const exists = current.selection.some(
          (item) => nodeRefKey(item.ref) === key
        );
        return {
          ...current,
          selection: exists
            ? current.selection.filter((item) => nodeRefKey(item.ref) !== key)
            : [...current.selection, node]
        };
      });
    },
    clearSelection() {
      setSnapshot({ selection: [] });
    },
    confirm() {
      return snapshot.selection.map((node) =>
        aggregator.resolveSelection(node)
      );
    }
  };
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function normalizeError(error: unknown, fallback: string): Error {
  return error instanceof Error ? error : new Error(fallback);
}
