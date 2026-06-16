/**
 * 应用产物源的 nodeId 编码/解码。nodeId 对 picker 不透明,仅本源解释。
 * 设计见 docs/architecture/agent-reference-source-services.md §4.6。
 *
 *   app 节点  : "app:" + appId
 *   group 节点: "app:" + appId + "|grp:" + base64url(opaque groupId)
 *   file 节点 : "app:" + appId + "|ref:" + base64url(resolvedPath)
 */

export type AppArtifactNode =
  | { type: "app"; appId: string }
  | { type: "group"; appId: string; groupId: string }
  | { type: "file"; appId: string; path: string };

const APP_PREFIX = "app:";
const GROUP_MARKER = "|grp:";
const REF_MARKER = "|ref:";

export function encodeAppNode(appId: string): string {
  return `${APP_PREFIX}${appId}`;
}

export function encodeGroupNode(appId: string, groupId: string): string {
  return `${APP_PREFIX}${appId}${GROUP_MARKER}${base64UrlEncode(groupId)}`;
}

export function encodeFileNode(appId: string, path: string): string {
  return `${APP_PREFIX}${appId}${REF_MARKER}${base64UrlEncode(path)}`;
}

export function decodeAppArtifactNodeId(nodeId: string): AppArtifactNode {
  if (!nodeId.startsWith(APP_PREFIX)) {
    throw new Error(`invalid app-artifact nodeId: ${nodeId}`);
  }
  const body = nodeId.slice(APP_PREFIX.length);

  const refIndex = body.indexOf(REF_MARKER);
  if (refIndex >= 0) {
    return {
      type: "file",
      appId: body.slice(0, refIndex),
      path: base64UrlDecode(body.slice(refIndex + REF_MARKER.length))
    };
  }

  const grpIndex = body.indexOf(GROUP_MARKER);
  if (grpIndex >= 0) {
    return {
      type: "group",
      appId: body.slice(0, grpIndex),
      groupId: base64UrlDecode(body.slice(grpIndex + GROUP_MARKER.length))
    };
  }

  return { type: "app", appId: body };
}

/** UTF-8 安全的 base64url(浏览器/Node 通用,不依赖 Buffer)。 */
export function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
