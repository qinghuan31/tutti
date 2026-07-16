# Workspace App Background State Implementation Plan

> **For Codex:** Use the `executing-plans` workflow to implement this plan task-by-task in the current workspace. Do not delegate without explicit user approval.

**Goal:** Keep every workspace app page and its in-page Agent alive when the user returns to the Apps catalog, then restore the same live page when that app is reopened.

**Architecture:** The shared App Center body will own a renderer-lifetime set of opened app ids. It will keep one `BrowserNode` mounted per opened app, give each browser a stable app-specific node id, and switch both DOM visibility and the Browser Node `hidden` input instead of conditionally unmounting the active app. Once a ready App Center snapshot confirms an app no longer exists, its retained browser is released.

**Tech Stack:** React, TypeScript, Electron `<webview>`, `@tutti-os/browser-node`, Node test runner.

---

### Task 1: Specify retained app instance behavior

**Files:**

- Create: `apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineAppRetention.ts`
- Create: `apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineAppRetention.test.ts`
- Modify: `apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineAppBody.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterLaunchRequest.ts`
- Modify: `apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterContribution.test.ts`

**Step 1: Write failing tests**

Cover these pure state transitions:

- opening the first app retains it;
- returning to the catalog keeps retained apps;
- opening a second app retains both instances without duplication;
- a confirmed available-app list removes an uninstalled app;
- the inline browser node id is stable and unique per app.

**Step 2: Run the focused test and confirm it fails**

Run:

```sh
cd apps/desktop
node --import ./test/register-asset-stub.mjs --test --experimental-strip-types \
  src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineAppRetention.test.ts \
  src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterContribution.test.ts
```

Expected: failure because the retention and node-id helpers do not exist yet.

**Step 3: Add the minimal pure helpers**

Add a helper that appends a non-empty active app id, preserves insertion order, removes duplicates, and prunes only when the caller supplies a confirmed available-app set. Add a stable inline node id using the existing `workspace-app:` namespace so workspace-app Browser events continue to route through the existing host feature.

**Step 4: Run the focused test and confirm it passes**

Run the same command. Expected: all focused tests pass.

### Task 2: Preserve all opened app Browser Nodes

**Files:**

- Modify: `apps/desktop/src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineAppBody.tsx`

**Step 1: Keep catalog and app layers mounted**

Replace the mutually exclusive catalog/app return branches with one stacked container. Keep `WorkspaceAppCenterPane` mounted and keep one keyed `WorkspaceAppCenterInlineBrowser` per retained app id.

**Step 2: Coordinate Electron guest visibility**

For every inactive app layer, apply non-interactive/invisible container styles and pass `hidden={true}` into `BrowserNode`. For the active app, pass through the Workbench minimized state. This prevents hidden Electron guest surfaces from covering the catalog while preserving their renderer state.

**Step 3: Release unavailable apps safely**

Prune retained ids only when App Center is `ready` for the current workspace. Loading and reconnection snapshots must not destroy live pages.

**Step 4: Run feature tests**

Run:

```sh
cd apps/desktop
node --import ./test/register-asset-stub.mjs --test --experimental-strip-types \
  src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineAppRetention.test.ts \
  src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterContribution.test.ts \
  src/renderer/src/features/workspace-app-center/services/internal/workspaceAppCenterInlineOpen.test.ts \
  src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolWorkbench.test.ts
```

Expected: all tests pass.

### Task 3: Record the durable lifecycle rule

**Files:**

- Modify: `docs/architecture/desktop-windows.md`
- Modify: `docs/conventions/troubleshooting/toolchain-browser-terminal.md`

**Step 1: Update architecture**

Document that both OS Workbench Apps and Agent-only Apps panels retain all opened inline app Browser Nodes, use `openAppId` only for visibility, and release instances only after confirmed app removal or host teardown.

**Step 2: Improve the existing webview troubleshooting note**

Add App Center catalog/app switching as a canonical case: ancestor hiding is insufficient; every inactive Browser Node must receive `hidden={true}` and remain mounted when state preservation is required.

### Task 4: Verify desktop integration

**Files:**

- No additional files expected.

**Step 1: Run changed-aware and boundary checks**

```sh
pnpm check:changed
pnpm check:renderer-boundaries
```

Expected: pass.

**Step 2: Run Desktop typecheck and build**

```sh
pnpm --filter @tutti-os/desktop typecheck
pnpm --filter @tutti-os/desktop build
```

Expected: pass.

**Step 3: Visual verification**

Open an app with a running Agent, return to Apps, reopen it, and confirm the same page state and Agent progress remain. Repeat with two different apps to verify both instances survive catalog round trips. If no live desktop session is available, report visual verification as unavailable rather than claiming it passed.

No commits are included in this execution because the user requested the behavior change, not repository history mutation.
