import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  ListChildrenResult,
  NodeRef,
  ReferenceNode,
  SearchResult,
  SelectedReference
} from "../../../contracts/referenceSource.ts";
import type {
  ReferenceSourceAggregator,
  ReferenceSourceTab
} from "../../../core/referenceSourceAggregator.ts";
import { SOURCE_ROOT_NODE_ID } from "../../../core/referenceSourceAggregator.ts";
import { nodeRefKey } from "../../../core/referenceSourceUtils.ts";
import {
  ROOT_CHILDREN_KEY,
  createReferenceSourcePickerController
} from "./referenceSourcePickerController.ts";

const scope = { workspaceId: "ws-1" };
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function folder(
  sourceId: string,
  nodeId: string,
  name = nodeId
): ReferenceNode {
  return { ref: { sourceId, nodeId }, kind: "folder", displayName: name };
}
function file(sourceId: string, nodeId: string, name = nodeId): ReferenceNode {
  return { ref: { sourceId, nodeId }, kind: "file", displayName: name };
}

interface FakeOptions {
  tabs: ReferenceSourceTab[];
  children: Record<string, ListChildrenResult>; // key = `${sourceId}:${nodeId}`
  search?: Record<string, SearchResult>; // key = `${sourceId}:${query}`
}

function fakeAggregator(options: FakeOptions): ReferenceSourceAggregator {
  return {
    listSources: async () => options.tabs,
    listRoot: async () => [],
    async listChildren(_scope, ref: NodeRef): Promise<ListChildrenResult> {
      return (
        options.children[`${ref.sourceId}:${ref.nodeId}`] ?? {
          entries: [],
          nextCursor: null
        }
      );
    },
    async search(_scope, sourceId, input): Promise<SearchResult> {
      return (
        options.search?.[`${sourceId}:${input.query}`] ?? {
          entries: [],
          nextCursor: null
        }
      );
    },
    open: async () => {},
    readPreview: async () => null,
    resolveSelection(node): SelectedReference {
      return { path: node.ref.nodeId, kind: node.kind };
    },
    getLoadedSource: () => undefined
  };
}

const tabsTwo: ReferenceSourceTab[] = [
  {
    sourceId: "workspace-file",
    label: "本地文件",
    capabilities: { searchable: true, previewable: true, paginated: false }
  },
  {
    sourceId: "app-artifact",
    label: "应用文件",
    capabilities: { searchable: false, previewable: true, paginated: true }
  }
];

test("open 加载 tabs、默认选中首个并加载其根", async () => {
  const controller = createReferenceSourcePickerController({
    aggregator: fakeAggregator({
      tabs: tabsTwo,
      children: {
        [`workspace-file:${SOURCE_ROOT_NODE_ID}`]: {
          entries: [
            folder("workspace-file", "/a"),
            file("workspace-file", "/x.md")
          ],
          nextCursor: null
        }
      }
    }),
    scope,
    searchDebounceMs: 0
  });
  controller.open();
  await flush();
  const snap = controller.getSnapshot();
  assert.equal(snap.activeSourceId, "workspace-file");
  assert.deepEqual(
    snap.tabs.map((t) => t.sourceId),
    ["workspace-file", "app-artifact"]
  );
  const root =
    snap.bySource["workspace-file"]?.childrenByKey[ROOT_CHILDREN_KEY];
  assert.equal(root?.loaded, true);
  // folder 在前
  assert.deepEqual(
    root?.entries.map((n) => n.ref.nodeId),
    ["/a", "/x.md"]
  );
});

test("toggleNode 展开 folder 并懒加载子节点", async () => {
  const controller = createReferenceSourcePickerController({
    aggregator: fakeAggregator({
      tabs: tabsTwo,
      children: {
        [`workspace-file:${SOURCE_ROOT_NODE_ID}`]: {
          entries: [folder("workspace-file", "/a")],
          nextCursor: null
        },
        "workspace-file:/a": {
          entries: [file("workspace-file", "/a/1.md")],
          nextCursor: null
        }
      }
    }),
    scope,
    searchDebounceMs: 0
  });
  controller.open();
  await flush();
  controller.toggleNode(folder("workspace-file", "/a"));
  await flush();
  const tab = controller.getSnapshot().bySource["workspace-file"];
  const key = nodeRefKey({ sourceId: "workspace-file", nodeId: "/a" });
  assert.equal(tab?.expandedKeys[key], true);
  assert.deepEqual(
    tab?.childrenByKey[key]?.entries.map((n) => n.ref.nodeId),
    ["/a/1.md"]
  );
});

test("loadMore 按 cursor 累积分页(保序不重排)", async () => {
  const children: Record<string, ListChildrenResult> = {
    [`app-artifact:${SOURCE_ROOT_NODE_ID}`]: {
      entries: [file("app-artifact", "p1a"), file("app-artifact", "p1b")],
      nextCursor: "c1"
    }
  };
  const controller = createReferenceSourcePickerController({
    aggregator: {
      ...fakeAggregator({ tabs: tabsTwo, children }),
      // 第二页:cursor=c1 时返回下一页
      async listChildren(_scope, ref, input) {
        if (ref.nodeId === SOURCE_ROOT_NODE_ID && input?.cursor === "c1") {
          return {
            entries: [file("app-artifact", "p2a"), file("app-artifact", "p1b")],
            nextCursor: null
          };
        }
        return (
          children[`${ref.sourceId}:${ref.nodeId}`] ?? {
            entries: [],
            nextCursor: null
          }
        );
      }
    },
    scope,
    searchDebounceMs: 0
  });
  controller.open();
  await flush();
  controller.setActiveSource("app-artifact");
  await flush();
  let root =
    controller.getSnapshot().bySource["app-artifact"]?.childrenByKey[
      ROOT_CHILDREN_KEY
    ];
  assert.equal(root?.nextCursor, "c1");
  controller.loadMore(null);
  await flush();
  root =
    controller.getSnapshot().bySource["app-artifact"]?.childrenByKey[
      ROOT_CHILDREN_KEY
    ];
  // append + 去重(p1b 不重复),保序
  assert.deepEqual(
    root?.entries.map((n) => n.ref.nodeId),
    ["p1a", "p1b", "p2a"]
  );
  assert.equal(root?.nextCursor, null);
});

test("search 在当前 tab 生效", async () => {
  const controller = createReferenceSourcePickerController({
    aggregator: fakeAggregator({
      tabs: tabsTwo,
      children: {
        [`workspace-file:${SOURCE_ROOT_NODE_ID}`]: {
          entries: [],
          nextCursor: null
        }
      },
      search: {
        "workspace-file:report": {
          entries: [file("workspace-file", "/report.md", "report.md")],
          nextCursor: null
        }
      }
    }),
    scope,
    searchDebounceMs: 0
  });
  controller.open();
  await flush();
  controller.setSearchQuery("report");
  await flush();
  const tab = controller.getSnapshot().bySource["workspace-file"];
  assert.equal(tab?.mode, "search");
  assert.deepEqual(
    tab?.searchEntries.map((n) => n.ref.nodeId),
    ["/report.md"]
  );
  // 清空回 browse
  controller.setSearchQuery("");
  await flush();
  assert.equal(
    controller.getSnapshot().bySource["workspace-file"]?.mode,
    "browse"
  );
});

test("跨 tab 选中累积,confirm 归一为 SelectedReference[]", async () => {
  const controller = createReferenceSourcePickerController({
    aggregator: fakeAggregator({ tabs: tabsTwo, children: {} }),
    scope,
    searchDebounceMs: 0
  });
  controller.open();
  await flush();
  controller.toggleSelection(file("workspace-file", "/a.md"));
  controller.toggleSelection(file("app-artifact", "app:x|ref:enc"));
  // folder 不可选
  controller.toggleSelection(folder("workspace-file", "/dir"));
  const selected = controller.confirm();
  assert.deepEqual(selected, [
    { path: "/a.md", kind: "file" },
    { path: "app:x|ref:enc", kind: "file" }
  ]);
  // 再次 toggle 取消
  controller.toggleSelection(file("workspace-file", "/a.md"));
  assert.equal(controller.confirm().length, 1);
});

test("close 后丢弃迟到的浏览结果", async () => {
  let resolveChildren!: (value: ListChildrenResult) => void;
  const pending = new Promise<ListChildrenResult>((resolve) => {
    resolveChildren = resolve;
  });
  const controller = createReferenceSourcePickerController({
    aggregator: {
      ...fakeAggregator({ tabs: tabsTwo, children: {} }),
      listChildren: () => pending
    },
    scope,
    searchDebounceMs: 0
  });
  controller.open();
  await flush();
  controller.close();
  resolveChildren({
    entries: [file("workspace-file", "/late.md")],
    nextCursor: null
  });
  await flush();
  const root =
    controller.getSnapshot().bySource["workspace-file"]?.childrenByKey[
      ROOT_CHILDREN_KEY
    ];
  assert.notEqual(
    root?.entries.some((n) => n.ref.nodeId === "/late.md"),
    true
  );
});
