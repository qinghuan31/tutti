# Open With Submenu Placement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep the file manager's Open With submenu fully usable at every window width by opening right, flipping left, or replacing the parent menu in constrained viewports.

**Architecture:** Keep placement policy in the file-manager package as a pure function and render through the existing `ViewportMenuSurface`. The menu uses the viewport as its collision boundary, preserves the existing flyout interaction when either side fits, and uses an in-place overlay with a back action only when two columns cannot fit.

**Tech Stack:** React 19, TypeScript, `@tutti-os/ui-system`, Node test runner, Tailwind utilities.

---

### Task 1: Model adaptive submenu placement

**Files:**

- Modify: `packages/workspace/file-manager/src/ui/contextMenuPlacement.ts`
- Test: `packages/workspace/file-manager/src/ui/contextMenuPlacement.test.ts`

**Step 1: Write failing placement tests**

Cover these exact cases:

- enough right-side room returns `mode: "right"` beside the trigger;
- insufficient right room with enough left room returns `mode: "left"`;
- insufficient room on both sides returns `mode: "overlay"` at the parent menu position;
- vertical position and effective width stay inside the configured viewport padding.

**Step 2: Run the focused test and verify it fails**

Run:

```bash
pnpm --filter @tutti-os/workspace-file-manager test
```

Expected: the new placement symbol or assertions fail before implementation.

**Step 3: Implement the pure placement resolver**

Add a resolver that accepts trigger bounds, parent-menu bounds, submenu dimensions, viewport dimensions, gap, and padding. Prefer right, then left, then overlay. Clamp the returned position and shrink the effective submenu width only when the viewport is narrower than the normal 220-pixel surface.

**Step 4: Run the focused test and verify it passes**

Run the same package test command and expect all placement tests to pass.

### Task 2: Render the responsive submenu modes

**Files:**

- Modify: `packages/workspace/file-manager/src/ui/WorkspaceFileManagerContextMenu.tsx`
- Test: `packages/workspace/file-manager/src/ui/contextMenuPlacement.test.ts`

**Step 1: Integrate the resolver**

Measure the trigger and parent menu when the submenu opens or its estimated height changes. Recalculate on window resize. Keep `ViewportMenuSurface` boundary constraints enabled and expose the resolved mode as a data attribute for inspection.

**Step 2: Add the constrained-width overlay interaction**

When the resolver returns `overlay`, render the submenu over the parent menu and prepend a back row using the shared `ArrowLeftIcon` and existing localized Open With label. Keep the submenu scrollable with a viewport-safe maximum height and width.

**Step 3: Add keyboard behavior**

Open with ArrowRight, focus the first submenu action for keyboard entry, and close back to the trigger with ArrowLeft or Escape. Do not steal focus for pointer-hover opening.

**Step 4: Run package and desktop checks**

Run:

```bash
pnpm --filter @tutti-os/workspace-file-manager test
pnpm --filter @tutti-os/workspace-file-manager typecheck
pnpm check:ui-boundaries
pnpm --filter @tutti-os/desktop build
pnpm check:changed --tail-lines 80
```

Expected: all commands pass; the submenu is visible in right, left, overlay, and tall-content cases.

### Task 3: Documentation impact check

**Files:**

- Review: `packages/workspace/file-manager/README.md`
- Review: `docs/conventions/desktop-visual-language.md`

Confirm whether this collision behavior introduces a durable public contract. If not, keep the implementation plan as the design record and report that no additional durable documentation update is required.
