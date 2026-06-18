import assert from "node:assert/strict";
import test from "node:test";
import { resolveWorkspaceAgentChatProvider } from "./workspaceOpenFeatureRequest.ts";

test("workspace agent chat uses the requested provider before the workspace default", () => {
  assert.equal(
    resolveWorkspaceAgentChatProvider({
      defaultProvider: "codex",
      requestedProvider: "claude-code"
    }),
    "claude-code"
  );
});

test("workspace agent chat falls back to the workspace default provider", () => {
  assert.equal(
    resolveWorkspaceAgentChatProvider({
      defaultProvider: "gemini"
    }),
    "gemini"
  );
});
