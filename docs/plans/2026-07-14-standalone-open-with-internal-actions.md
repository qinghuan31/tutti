# Standalone Open-With Internal Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide the file-viewer and Tutti in-app-browser entries from the standalone Agent window's Open With submenu without changing the OS workspace mode.

**Architecture:** Add a default-on presentation flag to the reusable workspace file manager and pass it through the desktop file-manager pane. The standalone sidebar opts out explicitly, while the OS workspace node keeps the default-on behavior and all action handlers remain unchanged.

**Tech Stack:** React 19, TypeScript, Node test runner, Electron/Vite desktop renderer.

---

### Task 1: Lock the standalone-only behavior

**Files:**

- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolWorkbench.test.ts`
- Verify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/WorkspaceFilesNodeBody.tsx`

**Step 1: Write the failing source-contract test**

Require the standalone `WorkspaceFileManagerPane` call to pass
`showInternalOpenWithActions={false}`. Require the pane implementation to
default the flag to `true` so callers in the OS workspace remain unchanged.

**Step 2: Run the focused test and verify it fails**

Run:

```sh
pnpm --filter @tutti-os/desktop test -- src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolWorkbench.test.ts
```

Expected: the new standalone opt-out assertion fails before implementation.

### Task 2: Thread the presentation flag through the shared surface

**Files:**

- Modify: `packages/workspace/file-manager/src/ui/WorkspaceFileManager.tsx`
- Modify: `packages/workspace/file-manager/src/ui/WorkspaceFileManagerContextMenuContainer.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-file-manager/ui/WorkspaceFileManagerPane.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentToolSidebarPanel.tsx`

**Step 1: Add the default-on shared prop**

Add `showInternalOpenWithActions?: boolean` to `WorkspaceFileManager`, default
it to `true`, and pass it into the context-menu container. Gate only
`showOpenInFileViewerAction` and `showOpenInAppBrowserAction`; do not change
system application, default-browser, or Other actions.

**Step 2: Expose the same default-on prop from the desktop pane**

Thread the value unchanged into the shared file manager.

**Step 3: Opt out only in the standalone sidebar**

Pass `showInternalOpenWithActions={false}` on the standalone files panel. Do
not add the opt-out to `WorkspaceFilesNodeBody`, so OS workspace behavior uses
the default-on value.

### Task 3: Verify behavior and repository boundaries

**Files:**

- Test: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolWorkbench.test.ts`
- Test: `packages/workspace/file-manager/src/**/*.test.ts`

**Step 1: Run focused tests and type checks**

```sh
pnpm --filter @tutti-os/desktop test -- src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolWorkbench.test.ts
pnpm --filter @tutti-os/workspace-file-manager test
pnpm --filter @tutti-os/workspace-file-manager typecheck
pnpm --filter @tutti-os/desktop typecheck
```

Expected: all commands pass.

**Step 2: Run desktop integration checks**

```sh
pnpm check:renderer-boundaries
pnpm --filter @tutti-os/desktop build
pnpm check:changed --tail-lines 80
```

Expected: all commands pass. No commit is created because this work continues
inside the user's existing dirty task chain.
