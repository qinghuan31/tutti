import type {
  ListChildrenInput,
  ListChildrenResult,
  ReferenceNode,
  ReferencePreview,
  ReferenceScope,
  ReferenceSourceService,
  SearchInput,
  SearchResult,
  SelectedReference,
  WorkspaceFileReference,
  WorkspaceFileReferenceAdapter
} from "@tutti-os/workspace-file-reference/contracts";
import { normalizeReferenceNodeKind } from "@tutti-os/workspace-file-reference/core";

export const WORKSPACE_FILE_SOURCE_ID = "workspace-file";

/**
 * 本地文件源:1:1 包装现有 WorkspaceFileReferenceAdapter。
 * nodeId === path。回归防护:取数/打开/预览/插入产物与现状逐字段一致。
 * 设计见 docs/architecture/agent-reference-source-services.md §2.3 / §4。
 */
export function createWorkspaceFileReferenceSource(input: {
  adapter: WorkspaceFileReferenceAdapter;
  label: string;
  order?: number;
}): ReferenceSourceService {
  const { adapter, label } = input;

  function referenceToNode(ref: WorkspaceFileReference): ReferenceNode {
    const kind = normalizeReferenceNodeKind(ref.kind);
    return {
      ref: { sourceId: WORKSPACE_FILE_SOURCE_ID, nodeId: ref.path },
      kind,
      displayName: ref.displayName?.trim() || basename(ref.path),
      ...(kind === "folder" ? { hasChildren: true } : {}),
      ...(ref.sizeBytes == null ? {} : { sizeBytes: ref.sizeBytes }),
      ...(ref.mtimeMs == null ? {} : { mtimeMs: ref.mtimeMs })
    };
  }

  function nodeToReference(node: ReferenceNode): WorkspaceFileReference {
    return { path: node.ref.nodeId, kind: node.kind };
  }

  return {
    metadata: { id: WORKSPACE_FILE_SOURCE_ID, label, order: input.order ?? 0 },
    capabilities: { searchable: true, previewable: true, paginated: false },

    isAvailable: () => Boolean(adapter.listDirectory),

    async listChildren(
      scope: ReferenceScope,
      { node }: ListChildrenInput
    ): Promise<ListChildrenResult> {
      if (!adapter.listDirectory) {
        return { entries: [], nextCursor: null };
      }
      const listing = await adapter.listDirectory({
        workspaceId: scope.workspaceId,
        path: node ? node.nodeId : null
      });
      return {
        entries: listing.entries.map(referenceToNode),
        nextCursor: null
      };
    },

    async search(
      scope: ReferenceScope,
      { query, limit, signal }: SearchInput
    ): Promise<SearchResult> {
      if (!adapter.searchReferences) {
        return { entries: [], nextCursor: null };
      }
      const refs = await adapter.searchReferences({
        workspaceId: scope.workspaceId,
        query,
        ...(limit === undefined ? {} : { limit }),
        ...(signal ? { signal } : {})
      });
      return { entries: refs.map(referenceToNode), nextCursor: null };
    },

    async open(_scope: ReferenceScope, node: ReferenceNode): Promise<void> {
      await adapter.openReference?.(nodeToReference(node));
    },

    async readPreview(
      scope: ReferenceScope,
      node: ReferenceNode
    ): Promise<ReferencePreview | null> {
      if (!adapter.readReferencePreview) {
        return null;
      }
      return adapter.readReferencePreview({
        workspaceId: scope.workspaceId,
        reference: nodeToReference(node)
      });
    },

    resolveSelection(node: ReferenceNode): SelectedReference {
      return {
        path: node.ref.nodeId,
        kind: node.kind,
        ...(node.displayName ? { displayName: node.displayName } : {})
      };
    }
  };
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
