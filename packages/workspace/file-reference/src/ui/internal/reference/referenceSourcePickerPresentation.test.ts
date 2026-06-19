import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReferenceNode } from "../../../contracts/referenceSource.ts";
import { formatHierarchyTitle } from "./referenceSourcePickerPresentation.ts";

function folder(nodeId: string, displayName: string): ReferenceNode {
  return {
    displayName,
    kind: "folder",
    ref: { sourceId: "workspace-file", nodeId }
  };
}

test("formatHierarchyTitle exposes the complete hierarchy path", () => {
  const title = formatHierarchyTitle([
    folder("Documents", "文稿"),
    folder("Documents/tutti", "tutti"),
    folder("Documents/tutti/tutti_research", "tutti_research"),
    folder("Documents/tutti/tutti_research/user-interviews", "用户访谈记录文档")
  ]);

  assert.equal(title, "文稿 / tutti / tutti_research / 用户访谈记录文档");
});

test("formatHierarchyTitle omits empty hierarchy paths", () => {
  assert.equal(formatHierarchyTitle([]), null);
});
