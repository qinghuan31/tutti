import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "WorkspaceAppCenterPane.tsx"
  ),
  "utf8"
);

test("workspace app center delegates app opening to the shell-aware service command", () => {
  assert.match(
    source,
    /openApp: async \(appId\) => \{\s*await service\.openApp\(\{ appId, workspaceId \}\);\s*\}/
  );
  assert.doesNotMatch(source, /openWorkspaceAppInline/);
});
