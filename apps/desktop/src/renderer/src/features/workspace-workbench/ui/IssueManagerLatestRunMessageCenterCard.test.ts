import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "IssueManagerLatestRunMessageCenterCard.tsx"
  ),
  "utf8"
);

test("issue manager card routes deck submit through submitPlanDecision", () => {
  // A synthesized Codex plan-implementation prompt must take the planMode-off +
  // literal-send path (submitPlanDecision), not a raw interactive submission.
  assert.match(source, /workspaceAgentActivityService\.submitPlanDecision\(/);
  assert.match(source, /promptKind: item\.pendingPrompt\?\.kind/);
});

test("issue manager card does not submit the deck prompt interactively", () => {
  // The deck submit handler must no longer call submitInteractive directly,
  // which would mis-handle a plan-implementation decision.
  assert.doesNotMatch(
    source,
    /workspaceAgentActivityService\.submitInteractive\(/
  );
});

test("issue manager card projects latest runs through message center snapshot", () => {
  assert.match(source, /issueManagerLatestRunMessageCenterSnapshot/);
  assert.match(
    source,
    /buildWorkspaceAgentMessageCenterModel\(messageCenterSnapshot,/
  );
  assert.match(source, /findWorkspaceAgentSession\(messageCenterSnapshot,/);
});
