# Standalone Agent Tool Sidebar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a host-owned, mutually exclusive right tool sidebar to the standalone Agent window without adding tool concepts or state to AgentGUI. The sidebar always reserves adjacent layout space and never covers the message flow.

**Architecture:** `apps/desktop` owns the tool identifiers, open/close reducer, reminder badges, toolbar, panel shell, and content renderers. `StandaloneAgentWindow` composes the toolbar beside the existing Agent workbench header and the panel beside `DesktopAgentGUIWorkbenchBody`; `@tutti-os/agent-gui` receives no new tool state, commands, or durable data. Browser and Terminal share one dropdown trigger while retaining distinct panel identities.

**Tech Stack:** React 19, TypeScript, Node test runner, `@tutti-os/ui-system`, desktop i18n, existing workspace file manager and app center panes.

---

### Task 1: Define the sidebar interaction model

**Files:**

- Create: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolSidebarModel.ts`
- Test: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolSidebarModel.test.ts`

**Step 1: Write failing tests**

Cover these transitions:

- clicking a closed top-level entry opens it
- clicking the active entry closes it
- selecting another entry swaps the single open panel
- Browser and Terminal share one launcher; clicking the whole control opens a menu and selecting an item opens that tool
- switching panels preserves per-panel mounted state in the view layer
- reminder values normalize to compact non-negative counts

**Step 2: Run the focused test and confirm failure**

Run:

```sh
pnpm --filter @tutti-os/desktop exec node --import ./test/register-asset-stub.mjs --test --experimental-strip-types ./src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolSidebarModel.test.ts
```

Expected: fail because the model module does not exist.

**Step 3: Implement the reducer and selectors**

Keep the model pure. It owns only the active and mounted panel state plus deterministic toggle/select transitions. It must not import AgentGUI, daemon clients, Electron APIs, or React.

**Step 4: Run the focused test and confirm pass**

Run the same command and expect all model tests to pass.

### Task 2: Build the host-owned toolbar and panel shell

**Files:**

- Create: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentToolSidebar.tsx`

**Step 1: Implement the component**

Use UI-system `Button`, `DropdownMenu`, `Tooltip`, and semantic icons/tokens. Keep the toolbar, reminders, lazy panel mounting, existing Files and Apps panes, and neutral host-adapter placeholders encapsulated in the desktop component.

**Step 2: Verify through the pure model test and desktop typecheck**

Run:

```sh
pnpm --filter @tutti-os/desktop exec node --import ./test/register-asset-stub.mjs --test --experimental-strip-types ./src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolSidebarModel.test.ts
pnpm --filter @tutti-os/desktop typecheck
```

Expected: the state model tests and all desktop types pass. The desktop package's
Node test lane does not execute TSX component tests, so interaction behavior is
kept in the tested pure model while the component is covered by typecheck and
the desktop build.

### Task 3: Compose the sidebar around the standalone Agent window

**Files:**

- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentWindow.tsx`
- Modify: `apps/desktop/src/shared/i18n/locales/en.ts`
- Modify: `apps/desktop/src/shared/i18n/locales/zh-CN.ts`

**Step 1: Add localized host labels**

Add desktop-owned labels for File, Tool, Browser, Terminal, Apps, Messages, Close, and reminder accessibility copy. Use `Apps` / `应用`; do not introduce `App Center` / `应用中心` in the new shell.

**Step 2: Inject the toolbar without changing AgentGUI internals**

Render the host toolbar as a sibling overlay in the standalone header. Do not add tool props to `AgentGUI`, `AgentGUINode`, its controller, or its view model.

**Step 3: Wrap the body with the sidebar shell**

Keep `DesktopAgentGUIWorkbenchBody` as the flexible main child. Mount existing
File and Apps panes through render slots. Browser and Terminal reuse their real
desktop workbench contributions in ephemeral panel-local hosts, while Messages
retains a neutral slot until its host adapter is attached. The sidebar shell
owns only visibility and layout.

The full resolved sidebar width participates in the body flex layout even when
the native window cannot grow by that amount. Conversation file links and
reference preview requests open Files with a reveal intent; shared App Center
open state activates Apps. Screen constraints narrow the main Agent surface
instead of turning the tool panel into an overlay.

Panel activation is optimistic UI-local state: dispatch it before native resize
IPC, schedule that IPC for the next animation frame, and reveal the shell with
a clipped width transition. Delay expensive first-use panel bodies until the
shell transition completes, retain them after mounting, and honor the system
reduced-motion preference. On macOS, animate the Electron content bounds in
parallel with the renderer transition.

**Step 4: Derive reminder state at the host boundary**

Subscribe to the shared workspace Agent Activity snapshot and derive the Messages reminder count with the existing attention selector. Pass only the resulting number into the toolbar.

### Task 4: Record the durable boundary

**Files:**

- Modify: `docs/architecture/agent-gui-node.md`

Document that standalone-window tool drawers are desktop host chrome. AgentGUI may receive neutral rendered header actions, but tool identity, badges, panel visibility, mutual exclusion, widths, and tool content must stay outside AgentGUI runtime/controller state.

### Task 5: Verify the change

**Step 1: Run focused tests**

```sh
pnpm --filter @tutti-os/desktop exec node --import ./test/register-asset-stub.mjs --test --experimental-strip-types ./src/renderer/src/features/workspace-workbench/ui/standaloneAgentToolSidebarModel.test.ts
```

**Step 2: Run boundary and i18n checks**

```sh
pnpm check:i18n
pnpm check:renderer-boundaries
pnpm check:agent-activity-runtime-boundaries
```

**Step 3: Run desktop typecheck and changed-aware validation**

```sh
pnpm --filter @tutti-os/desktop typecheck
pnpm check:changed
```

**Step 4: Perform a documentation impact check**

Expected decision: `improve` the existing AgentGuiNode architecture document with the host-owned tool-sidebar invariant.
