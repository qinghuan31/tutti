import assert from "node:assert/strict";
import test from "node:test";
import { WorkspaceAppSurfaceHost } from "./workspaceAppSurfaceHost.ts";
import type { WorkspaceAppSurfacePresenter } from "../workspaceAppSurfaceHost.interface.ts";

test("workspace app surface host routes an open attempt through the active presenter", async () => {
  const calls: string[] = [];
  const host = new WorkspaceAppSurfaceHost();
  host.registerPresenter(
    createPresenter({
      beginOpen: ({ appId }) => calls.push(`begin:${appId}`),
      presentPrepared: ({ appId }) => {
        calls.push(`present:${appId}`);
        return true;
      }
    })
  );

  const attempt = host.beginOpen({
    appId: "ai-slide",
    workspaceId: "workspace-1"
  });
  const presented = await host.presentPrepared({
    attempt,
    appId: "ai-slide",
    prepared: true,
    workspaceId: "workspace-1"
  });

  assert.equal(presented, true);
  assert.deepEqual(calls, ["begin:ai-slide", "present:ai-slide"]);
});

test("workspace app surface host replaces a presenter without letting stale disposal affect the replacement", async () => {
  const rollbacks: string[] = [];
  const host = new WorkspaceAppSurfaceHost();
  const disposeFirst = host.registerPresenter(
    createPresenter({
      presentPrepared: () => false,
      rollbackOpen: ({ appId }) => rollbacks.push(appId)
    })
  );
  host.beginOpen({ appId: "ai-slide", workspaceId: "workspace-1" });
  host.registerPresenter(createPresenter({ presentPrepared: () => true }));

  disposeFirst();

  const attempt = host.beginOpen({
    appId: "ai-doc",
    workspaceId: "workspace-1"
  });
  assert.equal(
    await host.presentPrepared({
      attempt,
      appId: "ai-doc",
      prepared: true,
      workspaceId: "workspace-1"
    }),
    true
  );
  assert.deepEqual(rollbacks, ["ai-slide"]);
});

test("workspace app surface host distinguishes repeated registrations of the same presenter", async () => {
  const host = new WorkspaceAppSurfaceHost();
  const presenter = createPresenter({ presentPrepared: () => true });
  const disposeFirst = host.registerPresenter(presenter);
  host.registerPresenter(presenter);

  disposeFirst();

  const attempt = host.beginOpen({
    appId: "ai-doc",
    workspaceId: "workspace-1"
  });
  assert.equal(
    await host.presentPrepared({
      attempt,
      appId: "ai-doc",
      prepared: true,
      workspaceId: "workspace-1"
    }),
    true
  );
});

test("workspace app surface host rolls back pending attempts when their presenter is disposed", () => {
  const calls: string[] = [];
  const host = new WorkspaceAppSurfaceHost();
  const dispose = host.registerPresenter(
    createPresenter({ rollbackOpen: ({ appId }) => calls.push(appId) })
  );
  const attempt = host.beginOpen({
    appId: "ai-slide",
    workspaceId: "workspace-1"
  });

  dispose();
  host.rollbackOpen(attempt);

  assert.deepEqual(calls, ["ai-slide"]);
});

function createPresenter(
  overrides: Partial<WorkspaceAppSurfacePresenter> = {}
): WorkspaceAppSurfacePresenter {
  return {
    beginOpen() {},
    close() {},
    isOpen: () => false,
    presentPrepared: () => false,
    rollbackOpen() {},
    ...overrides
  };
}
