import assert from "node:assert/strict";
import test from "node:test";
import { createStandaloneAgentIssueManagerOpenRequest } from "./standaloneAgentIssueManagerLaunch.ts";

test("standalone Agent issue launches preserve the complete open activation", () => {
  assert.deepEqual(
    createStandaloneAgentIssueManagerOpenRequest(
      {
        issueId: " issue-1 ",
        mode: "execute",
        outputDir: "/workspace/output",
        runId: "run-1",
        taskId: "task-1",
        topicId: "topic-1",
        workspaceId: "workspace-1"
      },
      3
    ),
    {
      activation: {
        payload: {
          issueId: "issue-1",
          mode: "execute",
          outputDir: "/workspace/output",
          runId: "run-1",
          taskId: "task-1",
          topicId: "topic-1"
        },
        sequence: 3,
        type: "open-workspace-issue"
      },
      requestID: "standalone-agent-issue-3"
    }
  );
});

test("standalone Agent issue launches can open the Tasks panel without selecting an issue", () => {
  assert.deepEqual(
    createStandaloneAgentIssueManagerOpenRequest(
      { workspaceId: "workspace-1" },
      4
    ),
    {
      activation: null,
      requestID: "standalone-agent-issue-4"
    }
  );
});
