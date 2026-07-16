# Standalone Browser Element Context Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let users select a DOM element in the standalone Agent window's browser tool and append a structured snapshot attachment to the current Agent composer draft.

**Architecture:** A desktop-local `browser-element-context` feature owns selection, sanitization, snapshot serialization, and prompt-asset archiving. The feature is loaded with `React.lazy` only after the standalone browser tool mounts. AgentGUI receives a host-neutral sequenced append request that merges the archived file into the currently active draft scope without replacing prompt text or submitting it.

**Tech Stack:** React 19, Electron `<webview>.executeJavaScript`, TypeScript, Vitest, Tutti AgentGUI draft model, desktop prompt-asset archive IPC.

---

### Task 1: Add a host-neutral composer append request

**Files:**

- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINode.types.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/AgentGUINode.tsx`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUINodeController.ts`
- Create: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUIComposerAppendRequest.ts`
- Test: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUIComposerAppendRequest.spec.ts`

1. Define a sequenced request containing already-landed file attachments.
2. Write tests proving append preserves text and existing attachments, deduplicates file ids, and ignores an already-handled sequence.
3. Apply the request to the active session or home draft scope through the canonical draft writer.
4. Run the focused AgentGUI test.

### Task 2: Build the lazy standalone browser element module

**Files:**

- Create: `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/browserElementSnapshot.ts`
- Create: `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/browserElementSelectorScript.ts`
- Create: `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/BrowserElementContextAction.tsx`
- Test: `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/browserElementSnapshot.test.ts`

1. Generate a self-contained guest-page selector script with hover outline, click selection, Escape cancellation, and cleanup.
2. Capture selector, semantic attributes, bounded text/HTML, geometry, viewport, key computed styles, page title, and sanitized URLs.
3. Strip executable content, sensitive attributes, form values, and secret-looking URL parameters before returning the snapshot.
4. Archive the JSON through `archiveAgentPromptFile` and return a landed file attachment.
5. Render an i18n-backed selector button using UI System components and tokens.

### Task 3: Wire only the standalone Agent window

**Files:**

- Modify: `packages/browser/workbench-node/src/react/BrowserNode.tsx`
- Modify: `packages/browser/workbench-node/src/react/BrowserNodeChrome.tsx`
- Modify: `packages/browser/workbench-node/src/react/webviewTag.ts`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentBrowserToolPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentToolSidebarPanel.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentToolSidebar.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentWindow.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-agent/ui/DesktopAgentGUIWorkbenchBody.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-agent/ui/desktopAgentGUIWorkbenchModel.ts`

1. Add a neutral navigation-action slot and typed `executeJavaScript` support to BrowserNode.
2. Lazy-load `BrowserElementContextAction` from the standalone browser panel only.
3. Archive selections with the standalone window's existing host-files API.
4. Forward the resulting sequenced append request into AgentGUI and focus the composer.
5. Do not wire the workspace/OS browser contribution.

### Task 4: Localize, document, and verify

**Files:**

- Modify: `apps/desktop/src/shared/i18n/locales/en.ts`
- Modify: `apps/desktop/src/shared/i18n/locales/zh-CN.ts`
- Modify: `docs/architecture/agent-gui-node.md`

1. Add English and Chinese labels for selecting, cancelling, archiving, success, and failure.
2. Document standalone ownership, lazy loading, snapshot privacy limits, and current-draft insertion.
3. Run `pnpm --filter @tutti-os/agent-gui test`.
4. Run focused desktop tests, `pnpm check:i18n`, `pnpm check:agent-activity-runtime-boundaries`, `pnpm --filter @tutti-os/desktop typecheck`, and `pnpm --filter @tutti-os/desktop build`.
