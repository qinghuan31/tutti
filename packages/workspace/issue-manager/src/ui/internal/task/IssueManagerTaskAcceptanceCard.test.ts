import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskAcceptanceCardSource = readFileSync(
  new URL("./IssueManagerTaskAcceptanceCard.tsx", import.meta.url),
  "utf8"
);

test("task acceptance card uses tutti purple surface colors", () => {
  assert.match(taskAcceptanceCardSource, /--tutti-purple-bg/);
  assert.match(taskAcceptanceCardSource, /--tutti-purple-border/);
  assert.doesNotMatch(taskAcceptanceCardSource, /--transparency-block/);
});
