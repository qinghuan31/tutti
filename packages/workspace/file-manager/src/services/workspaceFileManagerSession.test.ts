import assert from "node:assert/strict";
import test from "node:test";
import { createI18nRuntime } from "@tutti-os/ui-i18n-runtime";
import {
  createWorkspaceFileManagerI18nRuntime,
  createWorkspaceFileManagerService,
  workspaceFileManagerI18nResources
} from "./index.ts";
import type {
  WorkspaceFileEntry,
  WorkspaceFileManagerHost,
  WorkspaceFileManagerPersistedState,
  WorkspaceFileSearchResult
} from "./index.ts";

function createTestI18nRuntime() {
  return createWorkspaceFileManagerI18nRuntime(
    createI18nRuntime({
      dictionaries: [workspaceFileManagerI18nResources.en]
    })
  );
}

test("stale preview reads do not overwrite a newer empty selection state", async () => {
  const deferred = createDeferred<Uint8Array>();
  const entry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "notes.txt",
    path: "/Users/demo/project/notes.txt",
    sizeBytes: 5
  };
  const host: WorkspaceFileManagerHost = {
    async listDirectory(input) {
      return {
        directoryPath: input.path,
        entries: [entry],
        root: "/Users/demo/project",
        workspaceID: input.workspaceID
      };
    }
  };
  const session = createWorkspaceFileManagerService().createSession({
    i18n: createTestI18nRuntime(),
    host: {
      ...host,
      async readPreviewFile() {
        return deferred.promise;
      }
    },
    workspaceID: "workspace-1"
  });
  session.store.root = "/Users/demo/project";

  await session.initialize();
  session.select(entry.path);
  await flushMicrotasks();
  assert.equal(previewStatus(session), "loading");

  session.select(null);
  await flushMicrotasks();
  assert.equal(previewStatus(session), "empty");

  deferred.resolve(new TextEncoder().encode("hello"));
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(previewStatus(session), "empty");

  session.dispose();
});

test("preview mode transitions follow selection changes", async () => {
  const deferred = createDeferred<Uint8Array>();
  const directoryEntry: WorkspaceFileEntry = {
    hasChildren: true,
    kind: "directory",
    mtimeMs: null,
    name: "src",
    path: "/Users/demo/project/src",
    sizeBytes: null
  };
  const textEntry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "notes.txt",
    path: "/Users/demo/project/notes.txt",
    sizeBytes: 5
  };
  const session = createWorkspaceFileManagerService().createSession({
    i18n: createTestI18nRuntime(),
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [directoryEntry, textEntry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async readPreviewFile() {
        return deferred.promise;
      }
    },
    workspaceID: "workspace-1"
  });

  await session.initialize();

  session.select(directoryEntry.path);
  await flushMicrotasks();
  assert.equal(previewStatus(session), "directory");

  session.select(textEntry.path);
  await flushMicrotasks();
  assert.equal(previewStatus(session), "loading");
  deferred.resolve(new TextEncoder().encode("hello"));
  await flushMicrotasks();
  assert.equal(previewStatus(session), "text");

  session.dispose();
});

test("preview state is stable across repeated selection and same i18n runtime", async () => {
  let previewReads = 0;
  const entry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "notes.txt",
    path: "/Users/demo/project/notes.txt",
    sizeBytes: 5
  };
  const i18n = createTestI18nRuntime();
  const session = createWorkspaceFileManagerService().createSession({
    i18n,
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [entry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async readPreviewFile() {
        previewReads += 1;
        return new TextEncoder().encode("hello");
      }
    },
    workspaceID: "workspace-1"
  });

  await session.initialize();
  session.select(entry.path);
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(previewStatus(session), "text");
  assert.equal(previewReads, 1);

  session.select(entry.path);
  session.setI18nRuntime(i18n);
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(previewStatus(session), "text");
  assert.equal(previewReads, 1);

  session.dispose();
});

test("openEntry enters directories and records navigation history", async () => {
  const srcEntry: WorkspaceFileEntry = {
    hasChildren: true,
    kind: "directory",
    mtimeMs: null,
    name: "src",
    path: "/Users/demo/project/src",
    sizeBytes: null
  };
  const appEntry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "App.tsx",
    path: "/Users/demo/project/src/App.tsx",
    sizeBytes: 5
  };
  const session = createWorkspaceFileManagerService().createSession({
    i18n: createTestI18nRuntime(),
    host: {
      async listDirectory(input) {
        const directoryPath = input.path || "/Users/demo/project";
        return {
          directoryPath,
          entries:
            directoryPath === "/Users/demo/project" ? [srcEntry] : [appEntry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    workspaceID: "workspace-1"
  });

  await session.initialize();
  session.select(srcEntry.path);
  await session.openEntry(srcEntry);

  assert.equal(session.store.currentDirectoryPath, "/Users/demo/project/src");
  assert.deepEqual(session.store.navigationBackStack, ["/Users/demo/project"]);
  assert.deepEqual(session.store.navigationForwardStack, []);
  assert.equal(session.store.selectedPath, null);
  assert.deepEqual(session.store.entries, [appEntry]);

  session.dispose();
});

test("openEntry can re-enter a directory after navigating back", async () => {
  const srcEntry: WorkspaceFileEntry = {
    hasChildren: true,
    kind: "directory",
    mtimeMs: null,
    name: "src",
    path: "/Users/demo/project/src",
    sizeBytes: null
  };
  const appEntry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "App.tsx",
    path: "/Users/demo/project/src/App.tsx",
    sizeBytes: 5
  };
  const session = createWorkspaceFileManagerService().createSession({
    i18n: createTestI18nRuntime(),
    host: {
      async listDirectory(input) {
        const directoryPath = input.path || "/Users/demo/project";
        return {
          directoryPath,
          entries:
            directoryPath === "/Users/demo/project" ? [srcEntry] : [appEntry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    workspaceID: "workspace-1"
  });

  await session.initialize();
  await session.openEntry(srcEntry);
  await session.goBack();
  await session.openEntry(srcEntry);

  assert.equal(session.store.currentDirectoryPath, "/Users/demo/project/src");
  assert.deepEqual(session.store.navigationBackStack, ["/Users/demo/project"]);
  assert.deepEqual(session.store.navigationForwardStack, []);
  assert.deepEqual(session.store.entries, [appEntry]);

  session.dispose();
});

test("import conflict confirm flow refreshes and clears the dialog", async () => {
  let listCalls = 0;
  let confirmCalls = 0;
  const host: WorkspaceFileManagerHost = {
    async listDirectory(input) {
      listCalls += 1;
      return {
        directoryPath: input.path,
        entries: [],
        root: "/Users/demo/project",
        workspaceID: input.workspaceID
      };
    }
  };
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      ...host,
      async importFiles() {
        return {
          supported: true,
          importConflict: {
            conflicts: [
              {
                conflictKind: "replaceable",
                destinationKind: "file",
                destinationPath: "/Users/demo/project/conflict.txt",
                name: "conflict.txt",
                sourcePath: "/tmp/conflict.txt"
              }
            ],
            onConfirm: async () => {
              confirmCalls += 1;
              return { supported: true };
            }
          }
        };
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  assert.equal(listCalls, 1);

  await session.importFiles("/Users/demo/project");
  assert.equal(session.store.importConflictDialog?.conflicts.length, 1);
  assert.equal(listCalls, 1);

  await session.confirmImportConflict();
  assert.equal(confirmCalls, 1);
  assert.equal(session.store.importConflictDialog, null);
  assert.equal(listCalls, 2);

  session.dispose();
});

test("activation failures surface through the shared unsupported dialog state", async () => {
  const entry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "notes.txt",
    path: "/Users/demo/project/notes.txt",
    sizeBytes: 5
  };
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [entry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async activateFile() {
        throw new Error("Cannot open file");
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  await session.openEntry(entry);

  assert.equal(session.store.unsupportedDialog?.kind, "view");
  assert.equal(session.store.unsupportedDialog?.entryPath, entry.path);
  assert.equal(session.store.unsupportedDialog?.title, "Open failed");
  assert.equal(
    session.store.unsupportedDialog?.message,
    "Something went wrong. Please try again."
  );
  assert.equal(session.store.unsupportedDialog?.actions?.[0]?.label, "Retry");

  session.dispose();
});

test("fallback activation action failures surface through shared unsupported state", async () => {
  const entry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "notes.txt",
    path: "/Users/demo/project/notes.txt",
    sizeBytes: 5
  };
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [entry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async activateFile() {
        return {
          actions: [
            {
              kind: "open" as const,
              onSelect: async () => {
                throw new Error("Cannot open fallback action");
              }
            }
          ],
          disposition: "fallback" as const
        };
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  await session.openEntry(entry);

  assert.equal(session.store.unsupportedDialog?.kind, "view");
  assert.equal(
    session.store.unsupportedDialog?.title,
    "Can't preview this file"
  );
  assert.equal(
    session.store.unsupportedDialog?.message,
    "Open notes.txt in your local app instead."
  );

  const action = session.store.unsupportedDialog?.actions?.[0];
  assert.ok(action);
  await session.handleActivationFallbackAction(action);

  assert.equal(session.store.unsupportedDialog?.kind, "view");
  assert.equal(session.store.unsupportedDialog?.entryPath, entry.path);
  assert.equal(session.store.unsupportedDialog?.title, "Open failed");
  assert.equal(
    session.store.unsupportedDialog?.message,
    "Something went wrong. Please try again."
  );
  assert.equal(session.store.unsupportedDialog?.actions?.[0]?.label, "Retry");

  session.dispose();
});

test("mutations refresh the current directory after success", async () => {
  let listCalls = 0;
  const host: WorkspaceFileManagerHost = {
    async createFile() {
      return {
        hasChildren: false,
        kind: "file",
        mtimeMs: null,
        name: "new-file.txt",
        path: "/Users/demo/project/new-file.txt",
        sizeBytes: 0
      };
    },
    async listDirectory(input) {
      listCalls += 1;
      return {
        directoryPath: input.path,
        entries:
          listCalls >= 2
            ? [
                {
                  hasChildren: false,
                  kind: "file",
                  mtimeMs: null,
                  name: "new-file.txt",
                  path: "/Users/demo/project/new-file.txt",
                  sizeBytes: 0
                }
              ]
            : [],
        root: "/Users/demo/project",
        workspaceID: input.workspaceID
      };
    }
  };
  const session = createWorkspaceFileManagerService().createSession({
    host,
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  await session.createFile("/Users/demo/project/new-file.txt");

  assert.equal(listCalls, 2);
  assert.equal(
    session.store.entries[0]?.path,
    "/Users/demo/project/new-file.txt"
  );

  session.dispose();
});

test("stale search results do not overwrite newer query results", async () => {
  const firstSearch = createDeferred<WorkspaceFileSearchResult>();
  const secondSearch = createDeferred<WorkspaceFileSearchResult>();
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async search(input) {
        return input.query === "first"
          ? firstSearch.promise
          : secondSearch.promise;
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  const firstPromise = session.search("first");
  await flushMicrotasks();
  const secondPromise = session.search("second");
  await flushMicrotasks();

  secondSearch.resolve({
    entries: [
      {
        directoryPath: "/Users/demo/project",
        kind: "file",
        matchIndices: [0],
        matchTarget: "basename",
        name: "second.txt",
        path: "/Users/demo/project/second.txt",
        score: 1
      }
    ],
    root: "/Users/demo/project",
    workspaceID: "workspace-1"
  });
  await secondPromise;

  firstSearch.resolve({
    entries: [
      {
        directoryPath: "/Users/demo/project",
        kind: "file",
        matchIndices: [0],
        matchTarget: "basename",
        name: "first.txt",
        path: "/Users/demo/project/first.txt",
        score: 1
      }
    ],
    root: "/Users/demo/project",
    workspaceID: "workspace-1"
  });
  await firstPromise;

  assert.equal(session.store.searchQuery, "second");
  assert.deepEqual(
    session.store.searchEntries.map((entry) => entry.path),
    ["/Users/demo/project/second.txt"]
  );
  assert.equal(session.store.isSearching, false);

  session.dispose();
});

test("host action result messages are emitted through the session callback", async () => {
  const messages: string[] = [];
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async importFiles() {
        return {
          completedMessage: "Import complete",
          startedMessage: "Import started",
          supported: true
        };
      }
    },
    i18n: createTestI18nRuntime(),
    onHostActionMessage(message) {
      messages.push(
        `${message.actionKind}:${message.status}:${message.message}`
      );
    },
    workspaceID: "workspace-1"
  });

  await session.initialize();
  await session.importFiles("/Users/demo/project");

  assert.deepEqual(messages, ["import:completed:Import complete"]);

  session.dispose();
});

test("host action result emits started only when no terminal message is present", async () => {
  const messages: string[] = [];
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async importFiles() {
        return {
          startedMessage: "Import queued",
          supported: true
        };
      }
    },
    i18n: createTestI18nRuntime(),
    onHostActionMessage(message) {
      messages.push(
        `${message.actionKind}:${message.status}:${message.message}`
      );
    },
    workspaceID: "workspace-1"
  });

  await session.initialize();
  await session.importFiles("/Users/demo/project");

  assert.deepEqual(messages, ["import:started:Import queued"]);

  session.dispose();
});

test("pending search results do not mutate disposed sessions", async () => {
  const deferredSearch = createDeferred<WorkspaceFileSearchResult>();
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async search() {
        return deferredSearch.promise;
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  const searchPromise = session.search("notes");
  await flushMicrotasks();
  assert.equal(session.store.isSearching, true);

  session.dispose();
  assert.equal(session.store.isSearching, false);
  deferredSearch.resolve({
    entries: [
      {
        directoryPath: "/Users/demo/project",
        kind: "file",
        matchIndices: [0],
        matchTarget: "basename",
        name: "notes.txt",
        path: "/Users/demo/project/notes.txt",
        score: 1
      }
    ],
    root: "/Users/demo/project",
    workspaceID: "workspace-1"
  });
  await searchPromise;

  assert.deepEqual(session.store.searchEntries, []);
});

test("initialize is idempotent across repeated UI attachments", async () => {
  let listCalls = 0;
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        listCalls += 1;
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  session.setActive(true);
  await session.initialize();
  session.setActive(false);
  session.setActive(true);
  await session.initialize();

  assert.equal(listCalls, 1);

  session.dispose();
});

test("opening the context menu does not change the selected preview target", async () => {
  const fileEntry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "notes.txt",
    path: "/Users/demo/project/notes.txt",
    sizeBytes: 5
  };
  const otherFileEntry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "readme.md",
    path: "/Users/demo/project/readme.md",
    sizeBytes: 12
  };
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [fileEntry, otherFileEntry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  await session.initialize();
  session.select(fileEntry.path);
  await flushMicrotasks();
  const previewStatusBeforeContextMenu = session.store.previewState.status;
  assert.equal(session.store.selectedPath, fileEntry.path);
  assert.notEqual(previewStatusBeforeContextMenu, "empty");

  session.openContextMenu({
    entryPath: otherFileEntry.path,
    x: 24,
    y: 48
  });

  assert.equal(session.store.selectedPath, fileEntry.path);
  assert.equal(session.store.contextMenuEntryPath, otherFileEntry.path);
  assert.equal(session.store.contextMenu?.entryPath, otherFileEntry.path);
  assert.equal(
    session.store.previewState.status,
    previewStatusBeforeContextMenu
  );

  session.closeContextMenu();
  assert.equal(session.store.contextMenuEntryPath, null);

  session.dispose();
});

test("picker-only import capability does not claim drag-and-drop support", () => {
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async importFiles() {
        return { supported: true };
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  assert.equal(session.store.capabilities.canImportFromPicker, true);
  assert.equal(session.store.capabilities.canImportFromDrop, false);

  session.dispose();
});

test("persisted state restores navigation state and excludes transient selection", async () => {
  const fileEntry: WorkspaceFileEntry = {
    hasChildren: false,
    kind: "file",
    mtimeMs: null,
    name: "spec.md",
    path: "/Users/demo/project/docs/spec.md",
    sizeBytes: 5
  };
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [fileEntry],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    persistedState: {
      currentDirectoryPath: "/Users/demo/project/docs",
      navigationBackStack: ["/Users/demo/project"],
      navigationForwardStack: ["/Users/demo/project/archive"],
      schemaVersion: 2,
      selectedPath: fileEntry.path
    } as WorkspaceFileManagerPersistedState & { selectedPath: string },
    workspaceID: "workspace-1"
  });

  assert.equal(session.store.selectedPath, null);
  assert.deepEqual(session.getPersistedState(), {
    currentDirectoryPath: "/Users/demo/project/docs",
    navigationBackStack: ["/Users/demo/project"],
    navigationForwardStack: ["/Users/demo/project/archive"],
    schemaVersion: 2
  });

  await session.applyRevealIntent({
    path: "/Users/demo/project/revealed.txt",
    requestID: "reveal-1"
  });
  assert.equal(
    Object.hasOwn(session.getPersistedState(), "revealIntent"),
    false
  );
  session.dispose();
});

test("applyRevealIntent opens target directories directly when requested", async () => {
  const listedPaths: string[] = [];
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        listedPaths.push(input.path);
        assert.equal(input.path, "/Users/demo/project/src");
        return {
          directoryPath: input.path,
          entries: [
            {
              hasChildren: false,
              kind: "file",
              mtimeMs: null,
              name: "index.ts",
              path: "/Users/demo/project/src/index.ts",
              sizeBytes: 42
            }
          ],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    persistedState: {
      currentDirectoryPath: "/Users/demo/project",
      navigationBackStack: [],
      navigationForwardStack: [],
      schemaVersion: 2
    },
    workspaceID: "workspace-1"
  });

  await session.applyRevealIntent({
    mode: "open-directory",
    path: "/Users/demo/project/src",
    requestID: "open-directory-1"
  });

  assert.deepEqual(listedPaths, ["/Users/demo/project/src"]);
  assert.equal(session.store.currentDirectoryPath, "/Users/demo/project/src");
  assert.equal(session.store.selectedPath, null);
  session.dispose();
});

test("initialize preserves directory state already loaded by a reveal intent", async () => {
  const listedPaths: string[] = [];
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        listedPaths.push(input.path);
        assert.equal(input.path, "/Users/demo/project/src");
        return {
          directoryPath: input.path,
          entries: [
            {
              hasChildren: false,
              kind: "file",
              mtimeMs: null,
              name: "App.tsx",
              path: "/Users/demo/project/src/App.tsx",
              sizeBytes: 42
            }
          ],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    initialDirectoryPath: "/Users/demo/project",
    workspaceID: "workspace-1"
  });
  session.store.root = "/Users/demo/project";

  await session.applyRevealIntent({
    path: "/Users/demo/project/src/App.tsx",
    requestID: "reveal-before-initialize"
  });
  await session.initialize();

  assert.deepEqual(listedPaths, ["/Users/demo/project/src"]);
  assert.equal(session.store.currentDirectoryPath, "/Users/demo/project/src");
  assert.equal(session.store.selectedPath, "/Users/demo/project/src/App.tsx");

  session.dispose();
});

test("invalid persisted state is ignored", () => {
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    persistedState: {
      currentDirectoryPath: 123,
      navigationBackStack: ["/Users/demo/project/docs"],
      navigationForwardStack: [false],
      schemaVersion: 2
    } as unknown as WorkspaceFileManagerPersistedState,
    workspaceID: "workspace-1"
  });
  session.store.root = "/Users/demo/project";

  assert.deepEqual(session.getPersistedState(), {
    currentDirectoryPath: "/",
    navigationBackStack: [],
    navigationForwardStack: [],
    schemaVersion: 2
  });

  session.dispose();
});

test("legacy persisted workspace root state is ignored", () => {
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      }
    },
    i18n: createTestI18nRuntime(),
    persistedState: {
      currentDirectoryPath: "/workspace/docs",
      navigationBackStack: ["/workspace"],
      navigationForwardStack: ["/workspace/archive"],
      schemaVersion: 1
    } as unknown as WorkspaceFileManagerPersistedState,
    workspaceID: "workspace-1"
  });

  assert.deepEqual(session.getPersistedState(), {
    currentDirectoryPath: "/",
    navigationBackStack: [],
    navigationForwardStack: [],
    schemaVersion: 2
  });

  session.dispose();
});

test("listOpenWithApplications caches handlers by file extension", async () => {
  let loadCount = 0;
  const session = createWorkspaceFileManagerService().createSession({
    host: {
      async listDirectory(input) {
        return {
          directoryPath: input.path,
          entries: [],
          root: "/Users/demo/project",
          workspaceID: input.workspaceID
        };
      },
      async listOpenWithApplications() {
        loadCount += 1;
        return [
          {
            applicationPath: "/Applications/Visual Studio Code.app",
            iconDataUrl: null,
            name: "Visual Studio Code"
          }
        ];
      }
    },
    i18n: createTestI18nRuntime(),
    workspaceID: "workspace-1"
  });

  const entry = {
    hasChildren: false,
    kind: "file" as const,
    mtimeMs: null,
    name: "config.json",
    path: "/workspace/config.json",
    sizeBytes: 12
  };
  const otherEntry = {
    ...entry,
    name: "settings.json",
    path: "/workspace/settings.json"
  };

  await session.listOpenWithApplications(entry);
  await session.listOpenWithApplications(otherEntry);
  assert.equal(loadCount, 1);
  assert.deepEqual(session.getCachedOpenWithApplications(otherEntry), [
    {
      applicationPath: "/Applications/Visual Studio Code.app",
      iconDataUrl: null,
      name: "Visual Studio Code"
    }
  ]);

  session.dispose();
});

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
}

function previewStatus(session: {
  store: {
    previewState: {
      status: string;
    };
  };
}): string {
  return session.store.previewState.status;
}
