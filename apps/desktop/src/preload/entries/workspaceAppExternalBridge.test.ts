import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkspaceAppExternalBridge,
  requireUserActivation,
  workspaceAppExternalChannels
} from "./workspaceAppExternalBridge.ts";
import type { DesktopWorkspaceAppContext } from "../../shared/contracts/ipc.ts";

function unexpectedSend(): void {
  throw new Error("unexpected send");
}

test("workspace app external bridge proxies app context", async () => {
  const context: DesktopWorkspaceAppContext = {
    appId: "automation",
    locale: "en",
    workspaceId: "workspace-1"
  };
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return context;
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.equal(await bridge.app.getContext(), context);
});

test("workspace app external bridge subscribes to app context", () => {
  const context: DesktopWorkspaceAppContext = {
    appId: "automation",
    locale: "zh-CN",
    workspaceId: "workspace-1"
  };
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        throw new Error("unexpected get");
      },
      subscribe(listener) {
        listener(context);
        return () => undefined;
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });
  const contexts: unknown[] = [];
  const unsubscribe = bridge.app.subscribe((nextContext) => {
    contexts.push(nextContext);
  });

  unsubscribe();
  assert.deepEqual(contexts, [context]);
});

test("workspace app external bridge invokes at query without user activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return [
        {
          providerId: "file",
          itemId: "README.md",
          label: "README.md",
          insert: {
            kind: "markdown-link",
            label: "README.md",
            href: "README.md"
          }
        }
      ] as TResult;
    }
  });

  assert.deepEqual(await bridge.at.query({ keyword: "readme" }), [
    {
      providerId: "file",
      itemId: "README.md",
      label: "README.md",
      insert: {
        kind: "markdown-link",
        label: "README.md",
        href: "README.md"
      }
    }
  ]);
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.atQuery,
      payload: { keyword: "readme" }
    }
  ]);
});

test("workspace app external bridge invokes workspace feature open", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return undefined as TResult;
    }
  });

  await bridge.workspace.openFeature({ feature: "message-center" });

  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.workspaceFeatureOpen,
      payload: { feature: "message-center" }
    }
  ]);
});

test("workspace app external bridge sends browser open URL requests", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
    },
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  await bridge.browser.openUrl({ url: "https://example.com/design" });

  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.browserOpenUrl,
      payload: { url: "https://example.com/design" }
    }
  ]);
});

test("workspace app external bridge requires activation for browser open URL", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.browser.openUrl({ url: "https://example.com/design" }),
    /browser\.openUrl requires a user action/
  );
});

test("workspace app external bridge requires activation for workspace feature open", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.workspace.openFeature({ feature: "message-center" }),
    /workspace\.openFeature requires a user action/
  );
});

test("workspace app external bridge requires activation for file select", async () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.files.select({ multiple: true }),
    /files\.select requires a user action/
  );
});

test("workspace app external bridge requires activation for file open", async () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.files.open({ path: "README.md" }),
    /files\.open requires a user action/
  );
});

test("workspace app external bridge invokes file select with activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return [
        {
          kind: "file",
          path: "README.md"
        }
      ] as TResult;
    }
  });

  assert.deepEqual(await bridge.files.select({ multiple: true }), [
    {
      kind: "file",
      path: "README.md"
    }
  ]);
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.filesSelect,
      payload: { multiple: true }
    }
  ]);
});

test("workspace app external bridge invokes file open with activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return undefined as TResult;
    }
  });

  await bridge.files.open({
    mode: "auto",
    name: "README.md",
    path: "README.md"
  });
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.filesOpen,
      payload: {
        mode: "auto",
        name: "README.md",
        path: "README.md"
      }
    }
  ]);
});

test("workspace app external bridge invokes PDF print with activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return { bytes: new Uint8Array([37, 80, 68, 70]) } as TResult;
    }
  });

  assert.deepEqual(
    await bridge.pdf.printHtmlToPdf({ html: "<h1>Hello</h1>" }),
    {
      bytes: new Uint8Array([37, 80, 68, 70])
    }
  );
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.pdfPrintHtml,
      payload: { html: "<h1>Hello</h1>" }
    }
  ]);
});

test("workspace app external bridge requires activation for PDF print", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.pdf.printHtmlToPdf({ html: "<h1>Hello</h1>" }),
    /pdf\.printHtmlToPdf requires a user action/
  );
});

test("workspace app external bridge requires activation for permission request", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () =>
      bridge.permissions.request({
        nonce: "nonce-1",
        permission: "managed-ai-models",
        scopes: ["model:invoke"],
        state: "state-1"
      }),
    /permissions\.request requires a user action/
  );
});

test("workspace app external bridge invokes permission request with activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return {
        code: "grant-code-1",
        contextToken: "context-token-1"
      } as TResult;
    }
  });

  assert.deepEqual(
    await bridge.permissions.request({
      nonce: "nonce-1",
      permission: "managed-ai-models",
      providers: ["openai"],
      scopes: ["model:invoke"],
      state: "state-1"
    }),
    { code: "grant-code-1", contextToken: "context-token-1" }
  );
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.permissionsRequest,
      payload: {
        nonce: "nonce-1",
        permission: "managed-ai-models",
        providers: ["openai"],
        scopes: ["model:invoke"],
        state: "state-1"
      }
    }
  ]);
});

test("workspace app external bridge requires activation for settings open", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.settings.open({ tab: "models" }),
    /settings\.open requires a user action/
  );
});

test("workspace app external bridge invokes settings open with activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => true,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return undefined as TResult;
    }
  });

  await bridge.settings.open({ provider: "openai", tab: "models" });
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.settingsOpen,
      payload: { provider: "openai", tab: "models" }
    }
  ]);
});

test("workspace app external bridge invokes user project list without activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return {
        projects: [{ id: "repo", label: "repo", path: "/workspace/repo" }]
      } as TResult;
    }
  });

  assert.deepEqual(await bridge.userProjects.list(), {
    projects: [{ id: "repo", label: "repo", path: "/workspace/repo" }]
  });
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.userProjectsList,
      payload: undefined
    }
  ]);
});

test("workspace app external bridge invokes user project snapshot reads without activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const snapshot = {
    error: null,
    initialized: true,
    isLoading: false,
    projects: [{ id: "repo", label: "repo", path: "/workspace/repo" }],
    revision: 3
  };
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return snapshot as TResult;
    }
  });

  assert.deepEqual(await bridge.userProjects.getSnapshot(), snapshot);
  assert.deepEqual(await bridge.userProjects.refresh(), snapshot);
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.userProjectsGetSnapshot,
      payload: undefined
    },
    {
      channel: workspaceAppExternalChannels.userProjectsRefresh,
      payload: undefined
    }
  ]);
});

test("workspace app external bridge subscribes to user project snapshots", () => {
  const snapshot = {
    error: null,
    initialized: true,
    isLoading: false,
    projects: [{ id: "repo", label: "repo", path: "/workspace/repo" }],
    revision: 3
  };
  const snapshots: unknown[] = [];
  let didUnsubscribe = false;
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected app subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    subscribeToUserProjects(listener) {
      listener(snapshot);
      return () => {
        didUnsubscribe = true;
      };
    },
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  const unsubscribe = bridge.userProjects.subscribe((nextSnapshot) => {
    snapshots.push(nextSnapshot);
  });
  unsubscribe();

  assert.deepEqual(snapshots, [snapshot]);
  assert.equal(didUnsubscribe, true);
});

test("workspace app external bridge invokes user project use without activation", async () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke<TResult>(channel: string, payload?: unknown) {
      calls.push({ channel, payload });
      return { id: "repo", label: "repo", path: "/workspace/repo" } as TResult;
    }
  });

  assert.deepEqual(await bridge.userProjects.use({ path: "/workspace/repo" }), {
    id: "repo",
    label: "repo",
    path: "/workspace/repo"
  });
  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.userProjectsUse,
      payload: { path: "/workspace/repo" }
    }
  ]);
});

test("workspace app external bridge requires activation for user project create", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.userProjects.create({ name: "repo" }),
    /userProjects\.create requires a user action/
  );
});

test("workspace app external bridge requires activation for user project directory select", () => {
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send: unexpectedSend,
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.throws(
    () => bridge.userProjects.selectDirectory(),
    /userProjects\.selectDirectory requires a user action/
  );
});

test("workspace app external bridge sends logs without user activation", () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send(channel, payload) {
      calls.push({ channel, payload });
    },
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  bridge.logs.write({
    event: "page.loaded",
    level: "info",
    details: { route: "/home" }
  });

  assert.deepEqual(calls, [
    {
      channel: workspaceAppExternalChannels.logsWrite,
      payload: {
        event: "page.loaded",
        level: "info",
        details: { route: "/home" }
      }
    }
  ]);
});

test("workspace app external bridge ignores invalid log payloads", () => {
  const calls: Array<{ channel: string; payload?: unknown }> = [];
  const bridge = createWorkspaceAppExternalBridge({
    appContext: {
      async get() {
        return { locale: "en" };
      },
      subscribe() {
        throw new Error("unexpected subscribe");
      }
    },
    isUserActivationActive: () => false,
    send(channel, payload) {
      calls.push({ channel, payload });
    },
    async invoke() {
      throw new Error("unexpected invoke");
    }
  });

  assert.doesNotThrow(() => bridge.logs.write({ event: "" } as never));
  assert.deepEqual(calls, []);
});

test("requireUserActivation throws only when inactive", () => {
  assert.doesNotThrow(() => requireUserActivation(true, "files.select"));
  assert.throws(
    () => requireUserActivation(false, "files.select"),
    /files\.select requires a user action/
  );
});
