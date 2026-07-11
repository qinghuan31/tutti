import assert from "node:assert/strict";
import test from "node:test";
import { formatSlowestLanes } from "./run-validation-lanes.mjs";

test("formatSlowestLanes reports the longest lanes first", () => {
  const summary = formatSlowestLanes([
    { durationMs: 1200, label: "medium" },
    { durationMs: 250, label: "fast" },
    { durationMs: 2500, label: "slow" },
    { durationMs: 900, label: "also-fast" }
  ]);

  assert.equal(summary, "slow 2.5s, medium 1.2s, also-fast 0.9s");
});

test("formatSlowestLanes respects an explicit limit", () => {
  assert.equal(
    formatSlowestLanes(
      [
        { durationMs: 3000, label: "one" },
        { durationMs: 2000, label: "two" },
        { durationMs: 1000, label: "three" }
      ],
      2
    ),
    "one 3.0s, two 2.0s"
  );
});

test("formatSlowestLanes ignores missing durations", () => {
  assert.equal(
    formatSlowestLanes([
      { label: "not-started" },
      { durationMs: 500, label: "completed" }
    ]),
    "completed 0.5s"
  );
});
