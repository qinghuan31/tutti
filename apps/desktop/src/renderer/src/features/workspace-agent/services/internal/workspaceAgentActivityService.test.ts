import assert from "node:assert/strict";
import test from "node:test";
import type { TuttidClient } from "@tutti-os/client-tuttid-ts";
import { WorkspaceAgentActivityService } from "./workspaceAgentActivityService.ts";

function createService(): WorkspaceAgentActivityService {
  return new WorkspaceAgentActivityService({
    tuttidClient: {} as TuttidClient,
    runtimeApi: {
      logTerminalDiagnostic: async () => {}
    }
  });
}

test("WorkspaceAgentActivityService.sendInput keeps activity snapshot working when send response is still ready", async () => {
  const readySession = workspaceAgentSession({ status: "ready" });
  const service = new WorkspaceAgentActivityService({
    tuttidClient: {
      listWorkspaceAgentSessions: async () => ({ sessions: [readySession] }),
      sendWorkspaceAgentSessionInput: async () => readySession
    } as unknown as TuttidClient,
    runtimeApi: {
      logTerminalDiagnostic: async () => {}
    }
  });

  await service.load("ws-1");

  const result = await service.sendInput({
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    content: [{ type: "text", text: "continue" }]
  });
  const snapshotSession = service
    .getSnapshot("ws-1")
    .sessions.find((session) => session.agentSessionId === "session-1");

  assert.equal(result.status, "working");
  assert.equal(result.currentPhase, "working");
  assert.equal(snapshotSession?.status, "working");
  assert.equal(snapshotSession?.currentPhase, "working");
});

test("WorkspaceAgentActivityService.submitPlanDecision runs planMode-off then sendInput for a codex implement decision", async () => {
  const service = createService();

  const updateSettingsCalls: unknown[] = [];
  const sendInputCalls: unknown[] = [];
  const submitInteractiveCalls: unknown[] = [];

  service.updateSessionSettings = async (input) => {
    updateSettingsCalls.push(input);
    return { agentSessionId: input.agentSessionId, settings: {} };
  };
  service.sendInput = async (input) => {
    sendInputCalls.push(input);
    return {} as never;
  };
  service.submitInteractive = async (input) => {
    submitInteractiveCalls.push(input);
    return undefined;
  };

  await service.submitPlanDecision({
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    promptKind: "plan-implementation",
    action: "implement",
    requestId: "turn-1"
  });

  assert.equal(updateSettingsCalls.length, 1);
  assert.deepEqual(updateSettingsCalls[0], {
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    settings: { planMode: false }
  });

  assert.equal(sendInputCalls.length, 1);
  assert.deepEqual(sendInputCalls[0], {
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    content: [{ type: "text", text: "Implement the plan." }]
  });

  assert.equal(submitInteractiveCalls.length, 0);
});

test("WorkspaceAgentActivityService.submitPlanDecision routes a claude exit-plan decision through submitInteractive", async () => {
  const service = createService();

  const submitInteractiveCalls: unknown[] = [];

  service.updateSessionSettings = async () => {
    throw new Error("updateSessionSettings should not be called");
  };
  service.sendInput = async () => {
    throw new Error("sendInput should not be called");
  };
  service.submitInteractive = async (input) => {
    submitInteractiveCalls.push(input);
    return undefined;
  };

  await service.submitPlanDecision({
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    promptKind: "exit-plan",
    action: "allow",
    optionId: "acceptEdits",
    requestId: "req-1"
  });

  assert.equal(submitInteractiveCalls.length, 1);
  assert.deepEqual(submitInteractiveCalls[0], {
    workspaceId: "ws-1",
    agentSessionId: "session-1",
    requestId: "req-1",
    action: "allow",
    optionId: "acceptEdits"
  });
});

function workspaceAgentSession(overrides: {
  status: string;
}): Record<string, unknown> {
  return {
    id: "session-1",
    provider: "codex",
    cwd: "/workspace",
    title: "Session 1",
    status: overrides.status,
    visible: true,
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z"
  };
}
