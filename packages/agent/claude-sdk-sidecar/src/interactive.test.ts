import assert from "node:assert/strict";
import test from "node:test";
import { InteractiveCoordinator } from "./interactive.ts";
import type { ClaudeSDKSidecarEvent } from "./protocol.ts";

test("interactive coordinator resolves approval on its originating turn", async () => {
  const events: Array<Omit<ClaudeSDKSidecarEvent, "version">> = [];
  const coordinator = createCoordinator(events);
  const resultPromise = coordinator.handleToolPermission(
    "Bash",
    { command: "pwd" },
    {
      signal: new AbortController().signal,
      toolUseID: "tool-1"
    }
  );
  const request = events[0];
  const requestId = String(request?.payload?.requestId);

  const submitted = coordinator.submit(
    "turn-1",
    requestId,
    "approved",
    "allow",
    {}
  );

  assert.deepEqual(await resultPromise, {
    behavior: "allow",
    updatedInput: { command: "pwd" }
  });
  assert.equal(request?.type, "approval_requested");
  assert.equal(request?.payload?.turnId, "turn-1");
  assert.equal(events[1]?.type, "approval_resolved");
  assert.equal(events[1]?.payload?.turnId, "turn-1");
  assert.deepEqual(submitted, { disposition: "answered", replayed: false });
  assert.deepEqual(coordinator.disposition("turn-1", requestId), {
    disposition: "answered",
    replayed: true
  });
});

test("interactive coordinator replays identical submissions and rejects conflicts", async () => {
  const events: Array<Omit<ClaudeSDKSidecarEvent, "version">> = [];
  const coordinator = createCoordinator(events);
  const resultPromise = coordinator.handleToolPermission(
    "Bash",
    { command: "pwd" },
    { signal: new AbortController().signal }
  );
  const requestId = String(events[0]?.payload?.requestId);
  const payload = { reason: "approved" };

  assert.deepEqual(
    coordinator.submit("turn-1", requestId, "approved", "allow", payload),
    { disposition: "answered", replayed: false }
  );
  assert.deepEqual(
    coordinator.submit("turn-1", requestId, "approved", "allow", payload),
    { disposition: "answered", replayed: true }
  );
  assert.deepEqual(
    coordinator.submit("turn-1", requestId, "approved", "deny", payload),
    { disposition: "conflict" }
  );
  assert.deepEqual(
    coordinator.disposition("turn-1", requestId, {
      action: "approved",
      optionId: "deny",
      payload
    }),
    { disposition: "conflict" }
  );

  await resultPromise;
  assert.equal(
    events.filter((event) => event.type === "approval_resolved").length,
    1
  );
});

test("interactive coordinator rejects all live requests on shutdown", async () => {
  const events: Array<Omit<ClaudeSDKSidecarEvent, "version">> = [];
  const coordinator = createCoordinator(events);
  const resultPromise = coordinator.handleToolPermission(
    "Bash",
    { command: "pwd" },
    { signal: new AbortController().signal }
  );

  coordinator.rejectAll(new Error("session closed"));

  await assert.rejects(resultPromise, /session closed/u);
  const requestId = String(events[0]?.payload?.requestId);
  assert.deepEqual(coordinator.disposition("turn-1", requestId), {
    disposition: "superseded",
    replayed: true
  });
});

function createCoordinator(
  events: Array<Omit<ClaudeSDKSidecarEvent, "version">>
): InteractiveCoordinator {
  return new InteractiveCoordinator({
    settings: {
      model: "",
      permissionModeId: "default",
      planMode: false,
      effort: "",
      speed: "standard"
    },
    resolveTurnId: () => "turn-1",
    activateSyntheticTurn: () => "synthetic-1",
    emit: (event) => events.push(event)
  });
}
