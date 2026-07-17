# Agent Sidebar Management Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a configuration-menu entry that opens a local Agent sidebar manager with ordering and visibility controls.

**Architecture:** Keep ordering and visibility as UI-local AgentGUI chrome state in one device-global `localStorage` record. The provider rail and management dialog share that model; hiding the selected target returns the rail filter to All, and same-page preference events keep multiple AgentGUI instances synchronized.

**Tech Stack:** React, TypeScript, Vitest, `@tutti-os/ui-system`, browser `localStorage`.

---

### Task 1: Define and test the local preference model

**Files:**

- Modify: `packages/agent/gui/agent-gui/agentGuiNode/model/agentGuiProviderRailOrder.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/model/agentGuiProviderRailOrder.spec.ts`

**Steps:**

1. Add failing tests for a device-global storage key, versioned order/hidden serialization, malformed-input sanitization, visibility projection, and reorder behavior.
2. Run the focused model test and confirm it fails.
3. Implement the typed preference parser, serializer, visibility helper, and global key.
4. Run the focused model test and confirm it passes.

### Task 2: Add the management entry and dialog

**Files:**

- Create: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIProviderManagerDialog.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIAccountConfig.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIProviderRail.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINodeView.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUINodeView.types.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINode.labels.ts`
- Modify: `packages/agent/gui/app/renderer/i18n/locales/en.ts`
- Modify: `packages/agent/gui/app/renderer/i18n/locales/zh-CN.ts`

**Steps:**

1. Add failing layout tests for the menu entry, dialog, reorder control, hidden tiles, and selected-target fallback to All.
2. Run the focused layout test and confirm it fails.
3. Add localized labels and a UI System dialog with draggable rows, accessible move controls, and visibility switches.
4. Store preferences under one global key and broadcast changes to mounted AgentGUI instances.
5. Filter only provider tiles; keep the All tile fixed and preserve real Agent target data.
6. Run the focused layout tests and confirm they pass.

### Task 3: Verify package boundaries and documentation

**Files:**

- Modify: `docs/architecture/agent-gui-node.md`

**Steps:**

1. Update the durable AgentGUI architecture note from workspace-scoped ordering to device-local ordering and visibility.
2. Run `pnpm --filter @tutti-os/agent-gui test`.
3. Run `pnpm check:agent-activity-runtime-boundaries`.
4. Run `pnpm check:i18n`.
5. Run `pnpm check:changed` and inspect any focused failure logs.

### Task 4: Present Agent management as an editable grid

**Files:**

- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIProviderManagerDialog.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUINodeView.types.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/agentGUIProviderManagerLabels.ts`
- Modify: `packages/agent/gui/app/renderer/i18n/locales/en.agentGuiProviderIdentity.ts`
- Modify: `packages/agent/gui/app/renderer/i18n/locales/zh-CN.agentGuiProviderIdentity.ts`
- Modify: `packages/agent/gui/app/renderer/agentactivity.css`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINodeView.layout.spec.tsx`
- Modify: `docs/architecture/agent-gui-node.md`

**Steps:**

1. Replace the row/switch assertions with failing tests for separate available and disabled grids, long-press edit mode, remove/add actions, and active-only ordering.
2. Run the focused layout test and confirm the new expectations fail.
3. Render a five-column, icon-led grid using the existing Agent artwork and UI System dialog primitives.
4. Enter global edit mode after a long press, show semantic destructive remove controls, and apply a reduced-motion-safe wiggle animation to available tiles.
5. Keep drag sorting in the available grid; move removed targets into the disabled grid and restore added targets to the end of the available order.
6. Add localized section, instruction, remove, add, and empty-state labels.
7. Update the durable architecture note with the edit-mode and active-only ordering rules.
8. Run the focused test, package tests, i18n check, UI boundary check, Agent activity boundary check, and desktop build.

### Task 5: Enforce one available Agent and support cross-grid drag

**Files:**

- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIProviderManagerDialog.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIProviderRail.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUINodeView.types.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/agentGUIProviderManagerLabels.ts`
- Modify: `packages/agent/gui/app/renderer/i18n/locales/en.agentGuiProviderIdentity.ts`
- Modify: `packages/agent/gui/app/renderer/i18n/locales/zh-CN.agentGuiProviderIdentity.ts`
- Modify: `packages/agent/gui/app/renderer/agentactivity.css`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINodeView.layout.spec.tsx`
- Modify: `docs/architecture/agent-gui-node.md`

**Steps:**

1. Add failing tests that the final available Agent cannot be removed by its action or by a drop into the disabled grid.
2. Add failing tests for dragging an available Agent into the disabled grid and a disabled Agent into a specific position in the available grid.
3. Replace the dialog's single-list drag state with source-aware drag state and accessible drop-zone presentation.
4. Make both grids accept drops; same-grid drops reorder, while cross-grid drops update order and visibility atomically.
5. Enforce the minimum-one invariant again in the preference update handler so it cannot be bypassed by UI events.
6. Add localized copy for the final-Agent restriction and semantic drop-zone states.
7. Update the durable AgentGUI interaction rule and rerun focused tests, package tests, degradation checks, i18n checks, boundary checks, and the desktop build.
