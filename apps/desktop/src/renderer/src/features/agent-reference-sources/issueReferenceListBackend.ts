import type { TuttidClient } from "@tutti-os/client-tuttid-ts";
import type { IssueManagerIssueDetailResponse } from "@tutti-os/client-tuttid-ts";
import type {
  ReferenceListBackend,
  ReferenceListItem,
  ReferenceListResult
} from "@tutti-os/workspace-file-reference/core";
import {
  base64UrlDecode,
  base64UrlEncode
} from "@tutti-os/workspace-file-reference/core";
import type { ReferenceScope } from "@tutti-os/workspace-file-reference/contracts";

/**
 * 议题产出文件的引用列表 backend(遵循统一协议)。
 * 层级:topic → issue → 产出文件(latestOutputs)。逐层调 issue API,getDetail 按 issueId 缓存。
 *   t:{topicId}  i:{issueId}
 */

const ISSUE_PAGE_SIZE = 50;

type DecodedGroup =
  | { kind: "topic"; topicId: string }
  | { kind: "issue"; issueId: string };

export function createIssueReferenceListBackend(
  tuttidClient: TuttidClient
): ReferenceListBackend {
  const detailCache = new Map<
    string,
    Promise<IssueManagerIssueDetailResponse>
  >();
  const getDetail = (workspaceId: string, issueId: string) => {
    let pending = detailCache.get(issueId);
    if (!pending) {
      pending = tuttidClient.getWorkspaceIssueDetail(workspaceId, issueId);
      detailCache.set(issueId, pending);
    }
    return pending;
  };

  return {
    async list(
      scope: ReferenceScope,
      { parentGroupId, cursor, filter }
    ): Promise<ReferenceListResult> {
      const workspaceId = scope.workspaceId;

      // 根层级:topics。
      if (!parentGroupId) {
        const response =
          await tuttidClient.listWorkspaceIssueTopics(workspaceId);
        return {
          items: response.topics.map((topic) => ({
            type: "group",
            id: encodeGroup("t", topic.topicId),
            displayName: topic.title?.trim() || topic.topicId
          })),
          nextCursor: null
        };
      }

      const decoded = decodeGroup(parentGroupId);

      // topic → issues(分页)。
      if (decoded.kind === "topic") {
        const response = await tuttidClient.listWorkspaceIssues(workspaceId, {
          topicId: decoded.topicId,
          pageSize: ISSUE_PAGE_SIZE,
          ...(cursor ? { pageToken: cursor } : {}),
          ...(filter ? { searchQuery: filter } : {})
        });
        return {
          items: response.issues.map((issue) => ({
            type: "group",
            id: encodeGroup("i", issue.issueId),
            displayName: issue.title?.trim() || issue.issueId
          })),
          nextCursor: response.nextPageToken ?? null
        };
      }

      // issue → 直接列产出文件(latestOutputs)。
      const detail = await getDetail(workspaceId, decoded.issueId);
      // 归属标签 = 所属议题标题(搜索结果副标题用)。
      const issueLabel = detail.issue?.title?.trim() || decoded.issueId;
      const items: ReferenceListItem[] = detail.latestOutputs.map((output) => ({
        type: "reference",
        reference: {
          path: output.path,
          displayName: output.displayName,
          parentLabel: issueLabel,
          sizeBytes: output.sizeBytes,
          mimeType: output.mediaType || null,
          mtimeMs: unixSecondsToMs(output.createdAtUnix)
        }
      }));
      return { items, nextCursor: null };
    },

    // 定位:层级 topic → issue → 产出。带 topicId 时给出完整路径(展开 topic 再进入事项);
    // 缺 topicId 时直接定位到事项分组(backend.list 对 `i:` 直接列产出,内容仍正确)。
    locate(_scope, params): Promise<string[] | null> {
      const issueId = params.issueId?.trim();
      if (!issueId) {
        return Promise.resolve(null);
      }
      const topicId = params.topicId?.trim();
      const issuePath = encodeGroup("i", issueId);
      return Promise.resolve(
        topicId ? [encodeGroup("t", topicId), issuePath] : [issuePath]
      );
    }
  };
}

function encodeGroup(prefix: "t" | "i", id: string): string {
  return `${prefix}:${base64UrlEncode(id)}`;
}

function decodeGroup(parentGroupId: string): DecodedGroup {
  const markerIndex = parentGroupId.indexOf(":");
  const prefix = parentGroupId.slice(0, markerIndex);
  const id = base64UrlDecode(parentGroupId.slice(markerIndex + 1));
  switch (prefix) {
    case "t":
      return { kind: "topic", topicId: id };
    case "i":
      return { kind: "issue", issueId: id };
    default:
      throw new Error(`invalid issue parentGroupId: ${parentGroupId}`);
  }
}

function unixSecondsToMs(
  unixSeconds: number | null | undefined
): number | null {
  return unixSeconds == null ? null : unixSeconds * 1000;
}
