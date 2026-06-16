import type { TuttidClient } from "@tutti-os/client-tuttid-ts";
import type {
  ListChildrenInput,
  ListChildrenResult,
  ReferenceNode,
  ReferencePreview,
  ReferenceScope,
  ReferenceSourceService,
  SelectedReference,
  WorkspaceFileReference,
  WorkspaceFileReferenceAdapter
} from "@tutti-os/workspace-file-reference/contracts";
import {
  decodeAppArtifactNodeId,
  encodeAppNode,
  encodeFileNode,
  encodeGroupNode
} from "./appArtifactReferenceNodeId.ts";

export const APP_ARTIFACT_SOURCE_ID = "app-artifact";

const APP_REFERENCE_PAGE_LIMIT = 50;

type AppReferenceListItem = Awaited<
  ReturnType<TuttidClient["listWorkspaceAppReferences"]>
>["items"][number];

/**
 * 应用产物源:经 listWorkspaceAppReferences 浏览 app → group(项目)→ 文件。
 * open/preview 复用本地文件同一条 host 链路(解析绝对路径在 ~/.tutti 内,过 homedir 校验)。
 * 设计见 docs/architecture/agent-reference-source-services.md §2.3 / §3.6 / §4.6。
 */
export function createAppArtifactReferenceSource(input: {
  tuttidClient: TuttidClient;
  adapter: WorkspaceFileReferenceAdapter;
  label: string;
  order?: number;
}): ReferenceSourceService {
  const { tuttidClient, adapter, label } = input;

  async function listReferenceSupportingApps(workspaceId: string) {
    const response = await tuttidClient.listWorkspaceApps(workspaceId);
    return response.apps.filter(
      (app) => app.references.listSupported && app.installed && app.enabled
    );
  }

  function fileReferenceFromNode(node: ReferenceNode): WorkspaceFileReference {
    const decoded = decodeAppArtifactNodeId(node.ref.nodeId);
    if (decoded.type !== "file") {
      throw new Error(`app-artifact node is not a file: ${node.ref.nodeId}`);
    }
    return { path: decoded.path, kind: "file" };
  }

  return {
    metadata: { id: APP_ARTIFACT_SOURCE_ID, label, order: input.order ?? 1 },
    capabilities: { searchable: false, previewable: true, paginated: true },

    async isAvailable(scope: ReferenceScope): Promise<boolean> {
      try {
        const apps = await listReferenceSupportingApps(scope.workspaceId);
        return apps.length > 0;
      } catch {
        return false;
      }
    },

    async listChildren(
      scope: ReferenceScope,
      { node, cursor, filter }: ListChildrenInput
    ): Promise<ListChildrenResult> {
      // 源根:列出支持 references 的 app。
      if (!node) {
        const apps = await listReferenceSupportingApps(scope.workspaceId);
        return {
          entries: apps.map((app) => ({
            ref: {
              sourceId: APP_ARTIFACT_SOURCE_ID,
              nodeId: encodeAppNode(app.appId)
            },
            kind: "folder",
            displayName: app.displayName?.trim() || app.appId,
            hasChildren: true
          })),
          nextCursor: null
        };
      }

      const decoded = decodeAppArtifactNodeId(node.nodeId);
      if (decoded.type === "file") {
        return { entries: [], nextCursor: null };
      }
      const appId = decoded.appId;
      const parentGroupId = decoded.type === "group" ? decoded.groupId : null;

      const response = await tuttidClient.listWorkspaceAppReferences(
        scope.workspaceId,
        appId,
        {
          parentGroupId,
          filterText: filter ?? null,
          cursor: cursor ?? null,
          limit: APP_REFERENCE_PAGE_LIMIT,
          kinds: ["file"]
        }
      );

      return {
        entries: response.items.map((item) =>
          appReferenceItemToNode(appId, item)
        ),
        nextCursor: response.nextCursor ?? null
      };
    },

    async open(_scope: ReferenceScope, node: ReferenceNode): Promise<void> {
      await adapter.openReference?.(fileReferenceFromNode(node));
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
        reference: fileReferenceFromNode(node)
      });
    },

    resolveSelection(node: ReferenceNode): SelectedReference {
      const decoded = decodeAppArtifactNodeId(node.ref.nodeId);
      if (decoded.type !== "file") {
        throw new Error(
          `app-artifact selection is not a file: ${node.ref.nodeId}`
        );
      }
      return {
        path: decoded.path,
        kind: "file",
        ...(node.displayName ? { displayName: node.displayName } : {})
      };
    }
  };
}

function appReferenceItemToNode(
  appId: string,
  item: AppReferenceListItem
): ReferenceNode {
  if (item.type === "group") {
    return {
      ref: {
        sourceId: APP_ARTIFACT_SOURCE_ID,
        nodeId: encodeGroupNode(appId, item.id)
      },
      kind: "folder",
      displayName: item.displayName,
      hasChildren: true,
      childCount: item.referenceCount
    };
  }

  const reference = item.reference;
  return {
    ref: {
      sourceId: APP_ARTIFACT_SOURCE_ID,
      nodeId: encodeFileNode(appId, reference.path)
    },
    kind: "file",
    displayName: reference.displayName?.trim() || basename(reference.path),
    ...(reference.sizeBytes == null ? {} : { sizeBytes: reference.sizeBytes }),
    ...(reference.mtimeMs == null ? {} : { mtimeMs: reference.mtimeMs }),
    ...(reference.mimeType ? { mimeType: reference.mimeType } : {})
  };
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}
