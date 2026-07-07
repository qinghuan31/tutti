import assert from "node:assert/strict";
import test from "node:test";
import { selectExistingLintFiles } from "./run-check-changed.mjs";

test("selectExistingLintFiles drops deleted lint targets", () => {
  const changedFiles = [
    "packages/foo/src/live.ts",
    "packages/foo/src/deleted.ts",
    "packages/foo/README.md"
  ];

  const lintFiles = selectExistingLintFiles(
    changedFiles,
    (file) => file !== "packages/foo/src/deleted.ts"
  );

  assert.deepEqual(lintFiles, ["packages/foo/src/live.ts"]);
});

test("selectExistingLintFiles keeps existing lintable paths", () => {
  const changedFiles = [
    "apps/desktop/src/main/index.ts",
    "packages/foo/src/helper.mjs"
  ];

  const lintFiles = selectExistingLintFiles(changedFiles, () => true);

  assert.deepEqual(lintFiles, changedFiles);
});
