import assert from "node:assert/strict";
import test from "node:test";
import type {
  TuttidClient,
  PermissionModeSemantic,
  WorkspaceAgentSession,
  WorkspaceAgentSessionMessage
} from "@tutti-os/client-tuttid-ts";
import { createDesktopAgentActivityAdapter } from "./desktopAgentActivityAdapter.ts";

const workspaceId = "workspace-1";

test("desktop agent activity adapter maps tuttid sessions and messages", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async listWorkspaceAgentSessions(requestWorkspaceId: string) {
        calls.push({
          args: [requestWorkspaceId],
          method: "listSessions"
        });
        return {
          sessions: [
            createSession({
              cwd: "/repo",
              endedAt: "2026-01-01T00:02:00.000Z",
              id: "agent-session-1",
              lastError: "needs input",
              status: "waiting",
              title: "Review"
            })
          ],
          workspaceId: requestWorkspaceId
        };
      },
      async listWorkspaceAgentSessionMessages(
        requestWorkspaceId: string,
        agentSessionId: string,
        request?: { afterVersion?: number; limit?: number }
      ) {
        calls.push({
          args: [requestWorkspaceId, agentSessionId, request],
          method: "listMessages"
        });
        return {
          agentSessionId,
          hasMore: false,
          latestVersion: 5,
          messages: [
            createMessage({
              agentSessionId,
              completedAtUnixMs: 1717200003000,
              id: 5,
              kind: "text",
              messageId: "message-5",
              occurredAtUnixMs: 1717200001000,
              payload: { text: "hello" },
              role: "assistant",
              startedAtUnixMs: 1717200002000,
              status: "completed",
              turnId: "turn-1",
              version: 5
            })
          ]
        };
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const sessions = await adapter.listSessions({ workspaceId });
  const messages = await adapter.listSessionMessages({
    afterVersion: 3,
    agentSessionId: "agent-session-1",
    limit: 10,
    workspaceId
  });

  assert.deepEqual(calls, [
    {
      args: [workspaceId],
      method: "listSessions"
    },
    {
      args: [
        workspaceId,
        "agent-session-1",
        {
          afterVersion: 3,
          beforeVersion: undefined,
          limit: 10,
          order: undefined
        }
      ],
      method: "listMessages"
    }
  ]);
  assert.deepEqual(sessions.sessions, [
    {
      agentSessionId: "agent-session-1",
      createdAtUnixMs: Date.parse("2026-01-01T00:00:00.000Z"),
      cwd: "/repo",
      endedAtUnixMs: Date.parse("2026-01-01T00:02:00.000Z"),
      lastError: "needs input",
      lastEventUnixMs: Date.parse("2026-01-01T00:01:00.000Z"),
      pinnedAtUnixMs: null,
      provider: "codex",
      providerSessionId: "agent-session-1",
      resumable: false,
      startedAtUnixMs: Date.parse("2026-01-01T00:00:00.000Z"),
      status: "waiting",
      title: "Review",
      updatedAtUnixMs: Date.parse("2026-01-01T00:01:00.000Z"),
      visible: true,
      workspaceId
    }
  ]);
  assert.deepEqual(messages, {
    hasMore: false,
    latestVersion: 5,
    messages: [
      {
        agentSessionId: "agent-session-1",
        completedAtUnixMs: 1717200003000,
        id: 5,
        kind: "text",
        messageId: "message-5",
        occurredAtUnixMs: 1717200001000,
        payload: { text: "hello" },
        role: "assistant",
        startedAtUnixMs: 1717200002000,
        status: "completed",
        turnId: "turn-1",
        version: 5,
        workspaceId
      }
    ]
  });
});

test("desktop agent activity adapter returns cancel result metadata", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async cancelWorkspaceAgentSessionWithResult(
        requestWorkspaceId: string,
        agentSessionId: string
      ) {
        calls.push({
          args: [requestWorkspaceId, agentSessionId],
          method: "cancelWithResult"
        });
        return {
          cancel: {
            canceled: false,
            reason: "no_active_turn"
          },
          session: createSession({
            id: agentSessionId,
            status: "created"
          })
        };
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const result = await adapter.cancelSession({
    workspaceId,
    agentSessionId: "agent-session-1"
  });

  assert.deepEqual(calls, [
    {
      args: [workspaceId, "agent-session-1"],
      method: "cancelWithResult"
    }
  ]);
  assert.equal(result.canceled, false);
  assert.equal(result.reason, "no_active_turn");
  assert.equal(result.session.agentSessionId, "agent-session-1");
  assert.equal(result.session.status, "created");
});

test("desktop agent activity adapter requires an injected session event subscription", async () => {
  const diagnostics: unknown[] = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient(),
    runtimeApi: createRuntimeApi(diagnostics)
  });

  await assert.rejects(
    adapter.subscribeSessionEvents({
      agentSessionId: "agent-session-1",
      onEvent: () => {},
      signal: new AbortController().signal,
      workspaceId
    }),
    /subscription is unavailable/
  );

  assert.deepEqual(diagnostics, [
    {
      details: {
        error: "workspace agent session event subscription is unavailable"
      },
      event: "agent.gui.session_event.subscribe.unavailable",
      level: "warn",
      workspaceId
    }
  ]);
});

test("desktop agent activity adapter submits interactive responses through tuttid", async () => {
  const calls: unknown[] = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async submitWorkspaceAgentInteractive(
        requestWorkspaceId,
        agentSessionId,
        requestId,
        request
      ) {
        calls.push([requestWorkspaceId, agentSessionId, requestId, request]);
        return createSession({ id: agentSessionId, status: "waiting" });
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  await adapter.submitInteractive({
    agentSessionId: "agent-session-1",
    optionId: "acceptEdits",
    payload: { path: "/Users/example/demo/src/styles.css" },
    requestId: "interactive-1",
    workspaceId
  });

  assert.deepEqual(calls, [
    [
      workspaceId,
      "agent-session-1",
      "interactive-1",
      {
        action: null,
        optionId: "acceptEdits",
        payload: { path: "/Users/example/demo/src/styles.css" }
      }
    ]
  ]);
});

test("desktop agent activity adapter normalizes provider composer options", async () => {
  const calls: unknown[] = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async getAgentProviderComposerOptions(provider, request) {
        calls.push([provider, request]);
        return {
          provider,
          effectiveSettings: {},
          modelConfig: {
            configurable: true,
            currentValue: "gpt-5.4",
            options: [
              { id: "gpt-5.5", value: "gpt-5.5", label: "GPT-5.5" },
              { id: "gpt-5.4", value: "gpt-5.4", label: "GPT-5.4" }
            ]
          },
          reasoningConfig: {
            configurable: true,
            currentValue: "high",
            options: [
              { id: "medium", value: "medium", label: "中" },
              { id: "high", value: "high", label: "高" }
            ]
          },
          permissionConfig: {
            configurable: true,
            defaultValue: "auto",
            modes: [
              {
                id: "custom-safe",
                label: "Custom safe",
                semantic: unknownPermissionModeSemantic("custom")
              },
              {
                id: "full-access",
                label: "完全访问",
                semantic: "full-access"
              }
            ]
          },
          runtimeContext: {
            configOptions: [],
            promptCapabilities: { image: true },
            skills: [
              {
                name: "Create App",
                trigger: "create-app",
                sourceKind: "bundled"
              }
            ]
          },
          skills: []
        };
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const options = await adapter.loadComposerOptions({
    workspaceId,
    provider: "codex",
    cwd: "/repo",
    settings: { model: "gpt-5.4" }
  });

  assert.deepEqual(calls, [
    [
      "codex",
      {
        cwd: "/repo",
        settings: { model: "gpt-5.4" }
      }
    ]
  ]);
  assert.equal(options.provider, "codex");
  assert.deepEqual(options.models, [
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.4", label: "GPT-5.4" }
  ]);
  assert.deepEqual(options.reasoningEfforts, [
    { value: "medium", label: "中" },
    { value: "high", label: "高" }
  ]);
  assert.deepEqual(options.permissionConfig, {
    configurable: true,
    defaultValue: "auto",
    modes: [
      {
        id: "custom-safe",
        label: "Custom safe",
        semantic: "custom"
      },
      {
        id: "full-access",
        label: "完全访问",
        semantic: "full-access"
      }
    ]
  });
  assert.deepEqual(options.runtimeContext?.promptCapabilities, {
    image: true
  });
  assert.deepEqual(options.skills, [
    {
      name: "Create App",
      trigger: "create-app",
      sourceKind: "bundled"
    }
  ]);
});

test("desktop agent activity adapter sends plan mode when creating sessions", async () => {
  const calls: unknown[] = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async createWorkspaceAgentSession(requestWorkspaceId, request) {
        calls.push([requestWorkspaceId, request]);
        return createSession({
          id: request.agentSessionId,
          status: "created"
        });
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const session = await adapter.createSession({
    agentSessionId: "22222222-2222-4222-8222-222222222222",
    cwd: "/workspace",
    initialContent: [{ type: "text", text: "hello" }],
    model: "gpt-5.5-codex-spark",
    permissionModeId: "read-only",
    planMode: true,
    provider: "codex",
    reasoningEffort: "high",
    speed: null,
    title: "Plan",
    workspaceId
  });

  assert.equal(session.agentSessionId, "22222222-2222-4222-8222-222222222222");
  assert.deepEqual(calls, [
    [
      workspaceId,
      {
        agentSessionId: "22222222-2222-4222-8222-222222222222",
        cwd: "/workspace",
        initialContent: [{ type: "text", text: "hello" }],
        initialDisplayPrompt: null,
        model: "gpt-5.5-codex-spark",
        permissionModeId: "read-only",
        planMode: true,
        provider: "codex",
        reasoningEffort: "high",
        speed: null,
        title: "Plan",
        visible: null
      }
    ]
  ]);
});

test("desktop agent activity adapter normalizes legacy runtime config options", async () => {
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async getAgentProviderComposerOptions(provider) {
        return {
          provider,
          effectiveSettings: {},
          modelConfig: {
            configurable: true,
            options: []
          },
          permissionConfig: {
            configurable: false,
            modes: []
          },
          reasoningConfig: {
            configurable: true,
            options: []
          },
          runtimeContext: {
            configOptions: [
              {
                id: "model",
                currentValue: "gpt-5.4",
                options: [{ value: "gpt-5.5", name: "GPT-5.5" }]
              },
              {
                id: "reasoning_effort",
                currentValue: "high",
                options: [{ value: "medium", name: "中" }]
              }
            ]
          },
          skills: []
        };
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const options = await adapter.loadComposerOptions({
    workspaceId,
    provider: "codex"
  });

  assert.deepEqual(options.models, [
    { value: "gpt-5.5", label: "GPT-5.5" },
    { value: "gpt-5.4", label: "gpt-5.4" }
  ]);
  assert.deepEqual(options.reasoningEfforts, [
    { value: "medium", label: "中" },
    { value: "high", label: "high" }
  ]);
});

test("desktop agent activity adapter uses Claude draft live model list", async () => {
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async createWorkspaceAgentSession(_workspaceId, request) {
        return createSession({
          id: request.agentSessionId,
          provider: "claude-code",
          runtimeContext: {
            configOptions: [
              {
                id: "model",
                currentValue: "default",
                options: [
                  {
                    value: "default",
                    name: "Default",
                    description: "Opus 4.8 with 1M context"
                  },
                  {
                    value: "claude-opus-4-6",
                    name: "Opus 4.6",
                    description: "Most capable for complex work"
                  }
                ]
              }
            ]
          },
          visible: false
        });
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const options = await adapter.loadComposerOptions({
    workspaceId,
    provider: "claude-code"
  });

  assert.deepEqual(options.models, [
    {
      value: "default",
      label: "Default",
      description: "Opus 4.8 with 1M context"
    },
    {
      value: "claude-opus-4-6",
      label: "Opus 4.6",
      description: "Most capable for complex work"
    }
  ]);
});

test("desktop agent activity adapter flattens grouped runtime config options", async () => {
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async createWorkspaceAgentSession(_workspaceId, request) {
        return createSession({
          id: request.agentSessionId,
          provider: "claude-code",
          runtimeContext: {
            configOptions: [
              {
                id: "model",
                currentValue: "sonnet",
                options: [
                  {
                    group: "claude",
                    name: "Claude",
                    options: [
                      {
                        value: "sonnet",
                        name: "Sonnet",
                        description: "Best for everyday tasks"
                      }
                    ]
                  }
                ]
              }
            ]
          },
          visible: false
        });
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const options = await adapter.loadComposerOptions({
    workspaceId,
    provider: "claude-code"
  });

  assert.deepEqual(options.models, [
    {
      value: "sonnet",
      label: "Sonnet",
      description: "Best for everyday tasks"
    }
  ]);
});

test("desktop agent activity adapter loads Claude models from draft session", async () => {
  const createCalls: unknown[] = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async createWorkspaceAgentSession(requestWorkspaceId, request) {
        createCalls.push({ request, workspaceId: requestWorkspaceId });
        return createSession({
          id: request.agentSessionId,
          provider: "claude-code",
          runtimeContext: {
            configOptions: [
              {
                id: "model",
                currentValue: "default",
                options: [
                  {
                    value: "default",
                    name: "Default",
                    description: "Opus 4.8 with 1M context"
                  },
                  {
                    value: "opus",
                    name: "Opus",
                    description: "Most capable"
                  }
                ]
              }
            ]
          },
          visible: false
        });
      }
    }),
    runtimeApi: createRuntimeApi()
  });

  const options = await adapter.loadComposerOptions({
    cwd: "/repo",
    provider: "claude-code",
    workspaceId
  });

  assert.equal(createCalls.length, 1);
  assert.deepEqual(
    (
      createCalls[0] as {
        request: { initialContent: unknown[]; visible: boolean };
      }
    ).request.initialContent,
    []
  );
  assert.equal(
    (createCalls[0] as { request: { visible: boolean } }).request.visible,
    false
  );
  assert.equal(options.modelConfigurable, true);
  assert.deepEqual(options.models, [
    {
      value: "default",
      label: "Default",
      description: "Opus 4.8 with 1M context"
    },
    { value: "opus", label: "Opus", description: "Most capable" }
  ]);
  assert.equal(typeof options.runtimeContext?.draftAgentSessionId, "string");
});

test("desktop agent activity adapter promotes Claude draft on first prompt", async () => {
  const calls: string[] = [];
  const adapter = createDesktopAgentActivityAdapter({
    tuttidClient: createTuttidClient({
      async createWorkspaceAgentSession(_workspaceId, request) {
        calls.push(
          `create:${request.visible === false ? "hidden" : "visible"}`
        );
        return createSession({
          id: request.agentSessionId,
          provider: "claude-code",
          runtimeContext: {
            configOptions: [
              {
                id: "model",
                currentValue: "opus",
                options: [{ value: "opus", name: "Opus" }]
              }
            ]
          },
          visible: false
        });
      },
      async updateWorkspaceAgentSessionVisibility(
        _workspaceId,
        agentSessionId,
        request
      ) {
        calls.push(`visibility:${agentSessionId}:${request.visible}`);
        return createSession({
          id: agentSessionId,
          provider: "claude-code",
          visible: request.visible
        });
      },
      async sendWorkspaceAgentSessionInput(
        _workspaceId,
        agentSessionId,
        request
      ) {
        calls.push(`send:${agentSessionId}:${request.content[0]?.text}`);
        return createSession({
          id: agentSessionId,
          provider: "claude-code",
          status: "running",
          visible: true
        });
      }
    }),
    runtimeApi: createRuntimeApi()
  });
  const options = await adapter.loadComposerOptions({
    provider: "claude-code",
    workspaceId
  });
  const draftAgentSessionId = String(
    options.runtimeContext?.draftAgentSessionId
  );

  const session = await adapter.createSession({
    agentSessionId: draftAgentSessionId,
    initialContent: [{ type: "text", text: "hello" }],
    provider: "claude-code",
    workspaceId
  });

  assert.deepEqual(calls, [
    "create:hidden",
    `visibility:${draftAgentSessionId}:true`,
    `send:${draftAgentSessionId}:hello`
  ]);
  assert.equal(session.agentSessionId, draftAgentSessionId);
  assert.equal(session.status, "running");
  assert.equal(session.visible, true);
});

function createTuttidClient(
  overrides: Partial<TuttidClient> = {}
): TuttidClient {
  return {
    async cancelWorkspaceAgentSession() {
      return createSession({ status: "canceled" });
    },
    async cancelWorkspaceAgentSessionWithResult() {
      return {
        cancel: {
          canceled: true,
          reason: "active_turn_canceled"
        },
        session: createSession({ status: "canceled" })
      };
    },
    async createWorkspaceAgentSession() {
      return createSession();
    },
    async deleteWorkspaceAgentSession() {
      return { removed: true };
    },
    async listWorkspaceAgentSessionMessages() {
      return {
        agentSessionId: "agent-session-1",
        hasMore: false,
        latestVersion: 0,
        messages: []
      };
    },
    async listWorkspaceAgentSessions() {
      return { sessions: [createSession()], workspaceId };
    },
    async getAgentProviderComposerOptions() {
      return {
        provider: "codex",
        effectiveSettings: {},
        modelConfig: {
          configurable: true,
          options: []
        },
        permissionConfig: {
          configurable: false,
          modes: []
        },
        reasoningConfig: {
          configurable: true,
          options: []
        },
        runtimeContext: {},
        skills: []
      };
    },
    async submitWorkspaceAgentInteractive() {
      return createSession();
    },
    async sendWorkspaceAgentSessionInput() {
      return createSession({ status: "running" });
    },
    async updateWorkspaceAgentSessionVisibility(
      _workspaceId: string,
      agentSessionId: string,
      request: { visible: boolean }
    ) {
      return createSession({ id: agentSessionId, visible: request.visible });
    },
    ...overrides
  } as unknown as TuttidClient;
}

function createRuntimeApi(diagnostics: unknown[] = []) {
  return {
    logTerminalDiagnostic(payload: unknown) {
      diagnostics.push(payload);
      return Promise.resolve();
    }
  };
}

function unknownPermissionModeSemantic(value: string): PermissionModeSemantic {
  return value as unknown as PermissionModeSemantic;
}

function createSession(
  overrides: Partial<WorkspaceAgentSession> = {}
): WorkspaceAgentSession {
  return {
    createdAt: "2026-01-01T00:00:00.000Z",
    cwd: "/",
    id: "agent-session-1",
    provider: "codex",
    status: "running",
    title: "Agent session",
    updatedAt: "2026-01-01T00:01:00.000Z",
    visible: true,
    ...overrides
  };
}

function createMessage(
  overrides: Partial<WorkspaceAgentSessionMessage> = {}
): WorkspaceAgentSessionMessage {
  return {
    agentSessionId: "agent-session-1",
    id: 1,
    kind: "text",
    messageId: "message-1",
    payload: {},
    role: "assistant",
    version: 1,
    ...overrides
  };
}
