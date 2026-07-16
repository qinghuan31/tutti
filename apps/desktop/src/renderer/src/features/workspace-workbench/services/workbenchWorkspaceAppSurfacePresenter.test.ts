import assert from "node:assert/strict";
import test from "node:test";
import type {
  WorkbenchHostHandle,
  WorkbenchState
} from "@tutti-os/workbench-surface";
import {
  workspaceAppWebviewInstanceId,
  workspaceAppWebviewTypeID
} from "../../workspace-app-center/services/workspaceAppCenterLaunchIds.ts";
import { createWorkbenchWorkspaceAppSurfacePresenter } from "./workbenchWorkspaceAppSurfacePresenter.ts";

test("workbench app presenter launches a prepared app as a workbench node", async () => {
  const launches: unknown[] = [];
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    host: createHost({ launches }),
    workspaceId: "workspace-1"
  });

  const opened = await presenter.presentPrepared({
    appId: "ai-slide",
    attempt: {
      appId: "ai-slide",
      attemptId: 1,
      workspaceId: "workspace-1"
    },
    prepared: true,
    prevStatus: "idle",
    workspaceId: "workspace-1"
  });

  assert.equal(opened, true);
  assert.deepEqual(launches, [
    {
      payload: {
        appId: "ai-slide",
        prepared: true,
        prevStatus: "idle"
      },
      reason: "host",
      typeId: workspaceAppWebviewTypeID
    }
  ]);
});

test("workbench app presenter preserves route intent and onboarding launch source", async () => {
  const launches: unknown[] = [];
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    host: createHost({ launches }),
    workspaceId: "workspace-1"
  });
  const intent = {
    kind: "open-route" as const,
    params: { step: "welcome" },
    route: "/start"
  };

  await presenter.presentPrepared({
    appId: "tutti-onboarding",
    attempt: {
      appId: "tutti-onboarding",
      attemptId: 1,
      workspaceId: "workspace-1"
    },
    intent,
    prepared: true,
    prevStatus: "running",
    workspaceId: "workspace-1"
  });

  assert.deepEqual(launches, [
    {
      launchSource: "onboarding-auto",
      payload: {
        appId: "tutti-onboarding",
        intent,
        prepared: true,
        prevStatus: "running"
      },
      reason: "host",
      typeId: workspaceAppWebviewTypeID
    }
  ]);
});

test("workbench app presenter closes and detects matching app nodes", () => {
  const closed: string[] = [];
  const node = {
    data: {
      instanceId: workspaceAppWebviewInstanceId("ai-doc"),
      typeId: workspaceAppWebviewTypeID
    },
    id: "app-node"
  };
  const presenter = createWorkbenchWorkspaceAppSurfacePresenter({
    host: createHost({ closed, nodes: [node] }),
    workspaceId: "workspace-1"
  });

  assert.equal(
    presenter.isOpen({ appId: "ai-doc", workspaceId: "workspace-1" }),
    true
  );
  presenter.close({ appId: "ai-doc", workspaceId: "workspace-1" });
  assert.deepEqual(closed, ["app-node"]);
});

function createHost(input: {
  closed?: string[];
  launches?: unknown[];
  nodes?: unknown[];
}): WorkbenchHostHandle {
  return {
    closeNode: (nodeId) => input.closed?.push(nodeId),
    getSnapshot: () =>
      ({ nodes: input.nodes ?? [] }) as unknown as WorkbenchState,
    launchNode: async (request) => {
      input.launches?.push(request);
      return "app-node";
    }
  } as WorkbenchHostHandle;
}
