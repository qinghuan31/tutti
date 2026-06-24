import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { shouldIgnoreIssueManagerTaskDrawerBackdropEcho } from "./IssueManagerTaskDrawerEcho.ts";

const issueManagerShellSource = readFileSync(
  new URL("./IssueManagerShell.tsx", import.meta.url),
  "utf8"
);

test("task drawer backdrop echo guard ignores near repeated clicks after opening", () => {
  assert.deepEqual(
    shouldIgnoreIssueManagerTaskDrawerBackdropEcho({
      clickClientX: 544,
      clickClientY: 340,
      nowMs: 1_640,
      openPointer: {
        clientX: 571,
        clientY: 322,
        timeMs: 1_000
      }
    }).ignore,
    true
  );
});

test("task drawer close does not leave a transparent interaction blocker", () => {
  assert.doesNotMatch(issueManagerShellSource, /TaskDrawerCloseBlocker/);
  assert.doesNotMatch(
    issueManagerShellSource,
    /issueManagerTaskDrawerCloseBlocker/
  );
  assert.doesNotMatch(
    issueManagerShellSource,
    /bg-transparent"[\s\S]*onPointerDown/
  );
});

test("task drawer backdrop echo guard allows delayed or distant backdrop clicks", () => {
  assert.equal(
    shouldIgnoreIssueManagerTaskDrawerBackdropEcho({
      clickClientX: 544,
      clickClientY: 340,
      nowMs: 2_200,
      openPointer: {
        clientX: 571,
        clientY: 322,
        timeMs: 1_000
      }
    }).ignore,
    false
  );
  assert.equal(
    shouldIgnoreIssueManagerTaskDrawerBackdropEcho({
      clickClientX: 120,
      clickClientY: 120,
      nowMs: 1_300,
      openPointer: {
        clientX: 571,
        clientY: 322,
        timeMs: 1_000
      }
    }).ignore,
    false
  );
});
