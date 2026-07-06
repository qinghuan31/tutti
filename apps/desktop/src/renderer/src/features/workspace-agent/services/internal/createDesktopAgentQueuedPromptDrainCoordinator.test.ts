import assert from "node:assert/strict";
import test from "node:test";
import type { AgentActivityRuntime } from "@tutti-os/agent-gui";
import { createAgentQueuedPromptRuntime } from "@tutti-os/agent-gui/queued-prompt-runtime";
import type {
  AgentActivitySendInput,
  AgentActivitySession
} from "@tutti-os/agent-activity-core";
import { createDesktopAgentQueuedPromptDrainCoordinator } from "./createDesktopAgentQueuedPromptDrainCoordinator.ts";

const WORKSPACE_ID = "workspace-1";
const AGENT_SESSION_ID = "agent-session-1";

function activitySession(
  overrides: Partial<AgentActivitySession>
): AgentActivitySession {
  return {
    workspaceId: WORKSPACE_ID,
    agentSessionId: AGENT_SESSION_ID,
    provider: "codex",
    status: "active",
    updatedAtUnixMs: 1000,
    ...overrides
  } as AgentActivitySession;
}

function activityRuntimeFake(session: AgentActivitySession): {
  runtime: AgentActivityRuntime;
  sendCalls: AgentActivitySendInput[];
} {
  const sendCalls: AgentActivitySendInput[] = [];
  const runtime = {
    subscribe: () => () => {},
    getSnapshot: () => ({
      workspaceId: WORKSPACE_ID,
      sessions: [session],
      presences: [],
      sessionMessagesById: {}
    }),
    sendInput: async (input: AgentActivitySendInput) => {
      sendCalls.push(input);
      return {};
    },
    cancelSession: async () => ({ canceled: false })
  } as unknown as AgentActivityRuntime;
  return { runtime, sendCalls };
}

function enqueuePrompt(
  agentQueuedPromptRuntime: ReturnType<typeof createAgentQueuedPromptRuntime>
): void {
  agentQueuedPromptRuntime.enqueue({
    workspaceId: WORKSPACE_ID,
    agentSessionId: AGENT_SESSION_ID,
    prompt: {
      id: "prompt-1",
      content: [{ type: "text", text: "queued prompt" }],
      createdAtUnixMs: 1
    }
  });
}

async function waitForDrainTick(): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("drains a queued prompt when a settled session keeps a stale active-turn submit block", async () => {
  const agentQueuedPromptRuntime = createAgentQueuedPromptRuntime();
  const { runtime, sendCalls } = activityRuntimeFake(
    activitySession({
      turnLifecycle: {
        activeTurnId: null,
        phase: "settled",
        outcome: "completed"
      },
      submitAvailability: { state: "blocked", reason: "active_turn" }
    })
  );
  enqueuePrompt(agentQueuedPromptRuntime);

  const dispose = createDesktopAgentQueuedPromptDrainCoordinator({
    agentActivityRuntime: runtime,
    agentQueuedPromptRuntime,
    workspaceId: WORKSPACE_ID
  });
  await waitForDrainTick();
  dispose();

  assert.equal(sendCalls.length, 1);
  assert.equal(sendCalls[0]?.agentSessionId, AGENT_SESSION_ID);
  const queue = agentQueuedPromptRuntime.getSessionSnapshot({
    workspaceId: WORKSPACE_ID,
    agentSessionId: AGENT_SESSION_ID
  });
  assert.equal(queue.prompts.length, 0);
});

test("keeps the queue while the turn lifecycle still holds a live turn", async () => {
  const agentQueuedPromptRuntime = createAgentQueuedPromptRuntime();
  const { runtime, sendCalls } = activityRuntimeFake(
    activitySession({
      turnLifecycle: { activeTurnId: "turn-1", phase: "running" },
      submitAvailability: { state: "blocked", reason: "active_turn" }
    })
  );
  enqueuePrompt(agentQueuedPromptRuntime);

  const dispose = createDesktopAgentQueuedPromptDrainCoordinator({
    agentActivityRuntime: runtime,
    agentQueuedPromptRuntime,
    workspaceId: WORKSPACE_ID
  });
  await waitForDrainTick();
  dispose();

  assert.equal(sendCalls.length, 0);
  const queue = agentQueuedPromptRuntime.getSessionSnapshot({
    workspaceId: WORKSPACE_ID,
    agentSessionId: AGENT_SESSION_ID
  });
  assert.equal(queue.prompts.length, 1);
});

test("keeps the queue when a settled session is blocked for a non-turn reason", async () => {
  const agentQueuedPromptRuntime = createAgentQueuedPromptRuntime();
  const { runtime, sendCalls } = activityRuntimeFake(
    activitySession({
      turnLifecycle: {
        activeTurnId: null,
        phase: "settled",
        outcome: "completed"
      },
      submitAvailability: { state: "blocked", reason: "background_agent" }
    })
  );
  enqueuePrompt(agentQueuedPromptRuntime);

  const dispose = createDesktopAgentQueuedPromptDrainCoordinator({
    agentActivityRuntime: runtime,
    agentQueuedPromptRuntime,
    workspaceId: WORKSPACE_ID
  });
  await waitForDrainTick();
  dispose();

  assert.equal(sendCalls.length, 0);
  const queue = agentQueuedPromptRuntime.getSessionSnapshot({
    workspaceId: WORKSPACE_ID,
    agentSessionId: AGENT_SESSION_ID
  });
  assert.equal(queue.prompts.length, 1);
});

test("drains once the session reports an available submit state", async () => {
  const agentQueuedPromptRuntime = createAgentQueuedPromptRuntime();
  const { runtime, sendCalls } = activityRuntimeFake(
    activitySession({
      turnLifecycle: {
        activeTurnId: null,
        phase: "settled",
        outcome: "completed"
      },
      submitAvailability: { state: "available" }
    })
  );
  enqueuePrompt(agentQueuedPromptRuntime);

  const dispose = createDesktopAgentQueuedPromptDrainCoordinator({
    agentActivityRuntime: runtime,
    agentQueuedPromptRuntime,
    workspaceId: WORKSPACE_ID
  });
  await waitForDrainTick();
  dispose();

  assert.equal(sendCalls.length, 1);
});
