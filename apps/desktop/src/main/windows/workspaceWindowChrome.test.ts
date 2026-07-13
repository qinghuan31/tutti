import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspaceWindowFrame } from "./workspaceWindowChrome.ts";

test("Windows agent window uses custom traffic-light controls", () => {
  assert.equal(resolveWorkspaceWindowFrame("win32", "agent"), false);
});

test("macOS agent window uses custom frameless controls", () => {
  assert.equal(resolveWorkspaceWindowFrame("darwin", "agent"), false);
});

test("Windows workspace window uses custom traffic-light controls", () => {
  assert.equal(resolveWorkspaceWindowFrame("win32", "workspace"), false);
});

test("macOS workspace window keeps its native traffic-light behavior", () => {
  assert.equal(resolveWorkspaceWindowFrame("darwin", "workspace"), undefined);
});
