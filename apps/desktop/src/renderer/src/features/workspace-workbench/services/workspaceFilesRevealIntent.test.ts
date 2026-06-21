import assert from "node:assert/strict";
import test from "node:test";
import {
  registerWorkspaceFilesLaunchHandler,
  requestWorkspaceFilesLaunch
} from "./workspaceFilesLaunchCoordinator.ts";
import { toWorkspaceFilesRevealIntent } from "./workspaceFilesRevealIntent.ts";

test("toWorkspaceFilesRevealIntent maps file activations to pane reveal intents", () => {
  assert.deepEqual(
    toWorkspaceFilesRevealIntent({
      payload: {
        path: "/Users/example/demo/docs/spec.md"
      },
      sequence: 7,
      type: "reveal-file"
    }),
    {
      path: "/Users/example/demo/docs/spec.md",
      requestID: "7"
    }
  );
});

test("toWorkspaceFilesRevealIntent preserves directory open mode", () => {
  assert.deepEqual(
    toWorkspaceFilesRevealIntent({
      payload: {
        mode: "open-directory",
        path: "/Users/example/demo"
      },
      sequence: 9,
      type: "reveal-file"
    }),
    {
      mode: "open-directory",
      path: "/Users/example/demo",
      requestID: "9"
    }
  );
});

test("toWorkspaceFilesRevealIntent returns null without activation payload", () => {
  assert.equal(toWorkspaceFilesRevealIntent(null), null);
  assert.equal(
    toWorkspaceFilesRevealIntent({
      sequence: 8,
      type: "reveal-file"
    }),
    null
  );
});

test("workspace files launch coordinator dispatches normalized workspace requests", async () => {
  const requests: Array<{ path: string; workspaceId: string }> = [];
  const dispose = registerWorkspaceFilesLaunchHandler(
    " workspace-1 ",
    (request) => {
      requests.push(request);
      return true;
    }
  );

  assert.equal(
    await requestWorkspaceFilesLaunch({
      path: " docs/spec.md ",
      workspaceId: " workspace-1 "
    }),
    true
  );
  dispose();
  assert.equal(
    await requestWorkspaceFilesLaunch({
      path: "docs/spec.md",
      workspaceId: "workspace-1"
    }),
    false
  );
  assert.deepEqual(requests, [
    {
      path: "docs/spec.md",
      workspaceId: "workspace-1"
    }
  ]);
});

test("workspace files launch coordinator preserves open directory mode", async () => {
  const requests: Array<{
    mode?: "reveal" | "open-directory";
    path: string;
    workspaceId: string;
  }> = [];
  const dispose = registerWorkspaceFilesLaunchHandler(
    "workspace-directory",
    (request) => {
      requests.push(request);
      return true;
    }
  );

  assert.equal(
    await requestWorkspaceFilesLaunch({
      homeDirectory: "/Users/example",
      mode: "open-directory",
      path: "/Users/example/demo",
      workspaceId: "workspace-directory"
    }),
    true
  );
  dispose();
  assert.deepEqual(requests, [
    {
      mode: "open-directory",
      path: "/Users/example/demo",
      workspaceId: "workspace-directory"
    }
  ]);
});

test("workspace files launch coordinator rejects /workspace as an unsupported absolute path", async () => {
  const dispose = registerWorkspaceFilesLaunchHandler(
    "workspace-legacy",
    () => {
      throw new Error("legacy /workspace path should not launch");
    }
  );

  assert.equal(
    await requestWorkspaceFilesLaunch({
      homeDirectory: "/Users/example",
      path: "/workspace/docs/spec.md",
      workspaceId: "workspace-legacy"
    }),
    false
  );
  dispose();
});

test("workspace files launch coordinator preserves home absolute paths and rejects unsupported absolute paths", async () => {
  const requests: Array<{ path: string; workspaceId: string }> = [];
  const dispose = registerWorkspaceFilesLaunchHandler(
    "workspace-absolute",
    (request) => {
      requests.push(request);
      return true;
    }
  );

  assert.equal(
    await requestWorkspaceFilesLaunch({
      homeDirectory: "/Users/example",
      path: "/Users/example/demo/README.md",
      workspaceId: "workspace-absolute"
    }),
    true
  );
  assert.equal(
    await requestWorkspaceFilesLaunch({
      homeDirectory: "/Users/example",
      path: "/Users/other/demo/README.md",
      workspaceId: "workspace-absolute"
    }),
    false
  );
  assert.equal(
    await requestWorkspaceFilesLaunch({
      homeDirectory: "/Users/example",
      path: "/tmp/README.md",
      workspaceId: "workspace-absolute"
    }),
    false
  );
  dispose();
  assert.deepEqual(requests, [
    {
      path: "/Users/example/demo/README.md",
      workspaceId: "workspace-absolute"
    }
  ]);
});

test("workspace files launch coordinator preserves hidden internal state paths under home", async () => {
  const requests: Array<{ path: string; workspaceId: string }> = [];
  const dispose = registerWorkspaceFilesLaunchHandler(
    "workspace-hidden",
    (request) => {
      requests.push(request);
      return true;
    }
  );

  assert.equal(
    await requestWorkspaceFilesLaunch({
      homeDirectory: "/Users/example",
      path: "/Users/example/.tutti-dev/agent/runs/run-1/session-1/codex-home/generated_images/imagegen/ig_123.png",
      workspaceId: "workspace-hidden"
    }),
    true
  );
  dispose();
  assert.deepEqual(requests, [
    {
      path: "/Users/example/.tutti-dev/agent/runs/run-1/session-1/codex-home/generated_images/imagegen/ig_123.png",
      workspaceId: "workspace-hidden"
    }
  ]);
});

test("workspace files launch coordinator preserves fallback when handler declines", async () => {
  const dispose = registerWorkspaceFilesLaunchHandler(
    "workspace-declined",
    () => false
  );

  assert.equal(
    await requestWorkspaceFilesLaunch({
      path: "docs/spec.md",
      workspaceId: "workspace-declined"
    }),
    false
  );
  dispose();
});
