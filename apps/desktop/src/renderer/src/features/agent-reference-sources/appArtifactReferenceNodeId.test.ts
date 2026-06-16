import assert from "node:assert/strict";
import { test } from "node:test";

import {
  decodeAppArtifactNodeId,
  encodeAppNode,
  encodeFileNode,
  encodeGroupNode
} from "./appArtifactReferenceNodeId.ts";

test("app 节点编解码", () => {
  const nodeId = encodeAppNode("app_x");
  assert.equal(nodeId, "app:app_x");
  assert.deepEqual(decodeAppArtifactNodeId(nodeId), {
    type: "app",
    appId: "app_x"
  });
});

test("group 节点编解码:不透明 id 含特殊字符也安全", () => {
  const groupId = "项目/A|grp:fake#?=";
  const nodeId = encodeGroupNode("app_x", groupId);
  const decoded = decodeAppArtifactNodeId(nodeId);
  assert.deepEqual(decoded, { type: "group", appId: "app_x", groupId });
});

test("file 节点编解码:保留解析绝对路径", () => {
  const path = "/Users/u/.tutti/apps/workspaces/ws/app_x/data/报告.md";
  const nodeId = encodeFileNode("app_x", path);
  const decoded = decodeAppArtifactNodeId(nodeId);
  assert.deepEqual(decoded, { type: "file", appId: "app_x", path });
});

test("group 与 file 标记不互相误判", () => {
  // 路径里即便出现 |grp: 字样,也应识别为 file(优先匹配 |ref:)
  const path = "/x/|grp:tricky/报告.md";
  const decoded = decodeAppArtifactNodeId(encodeFileNode("app_x", path));
  assert.equal(decoded.type, "file");
});

test("非法 nodeId 抛错", () => {
  assert.throws(() => decodeAppArtifactNodeId("not-an-app-node"));
});
