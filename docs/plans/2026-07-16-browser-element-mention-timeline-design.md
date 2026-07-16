# Browser Element Mention Timeline Implementation Plan

> **For Codex:** Use the Code workflow to implement and verify each task in this plan.

**Goal:** Show standalone Browser element references as compact DOM-tag chips while sending their bounded DOM context to the Agent as ordinary prompt text.

**Architecture:** Keep the `browser-element` reference as one canonical rich-text mention in the display prompt. Its scope carries the sanitized `DOM Path`, `Position`, and `HTML Element` text. The desktop registration renders the compact chip and provides the prompt materializer; AgentGUI expands registered custom mentions immediately before runtime dispatch while retaining the canonical mention in `displayPrompt`. The daemon and runtime protocols receive only ordinary text blocks.

**Tech Stack:** React, TypeScript, Tiptap, Vitest, Go agent runtime tests where the durable prompt payload boundary is involved.

---

### Task 1: Reproduce the sent-message regression

**Files:**

- Modify: `packages/agent/gui/shared/AgentRichTextReadonly.spec.tsx`
- Modify: `packages/agent/gui/shared/agentConversation/projection/workspaceAgentMessageProjection.spec.ts`

**Steps:**

1. Add a readonly-render regression test for a registered `browser-element` custom mention followed by ordinary prompt text.
2. Add a durable-message projection test whose canonical content contains multiple browser-element mentions and a concrete prompt.
3. Run the focused tests and confirm the current failure identifies the layer that drops the mention URI or chip.

### Task 2: Preserve canonical browser-element presentation

**Files:**

- Modify only the smallest owning AgentGUI rich-text/projection file identified by Task 1.
- Preserve the existing desktop registration in `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/registerDesktopBrowserElementMention.tsx`.

**Steps:**

1. Make the canonical rich-text prompt win over lossy provider-visible text when structured user prompt content is available.
2. Ensure readonly custom mentions use the registered host chip renderer and retain adjacent prompt text.
3. Keep attachments/images as independent message content; do not convert browser-element references back into attachment cards.

### Task 3: Preserve the rich prompt in the active detail header

**Files:**

- Modify: `packages/agent/gui/workbench/conversationIdentity.ts`
- Modify: `packages/agent/gui/workbench/header.ts`
- Modify: `packages/agent/gui/workbench/AgentGuiWorkbenchReactiveHeader.tsx`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/ui/StandaloneAgentWindowHeader.tsx`

**Steps:**

1. Derive a presentation-only rich title from the pending activation or first canonical user message.
2. Apply it only while the normalized, capped prompt still matches the session's automatic title; an explicit rename or clear disables it.
3. Render the readonly rich title on demand in the expanded detail header while keeping collapsed and cross-surface identities plain.

### Task 4: Verify the end-to-end contract

**Files:**

- Modify: `docs/architecture/agent-gui-node.md` only if the implementation reveals a missing durable invariant.

**Steps:**

1. Run the focused AgentGUI rich-text, projection, and browser-element context tests.
2. Run `pnpm check:agent-activity-runtime-boundaries` and the focused package typecheck/test lane.
3. Build the desktop renderer and verify the header path compiles in the production bundle.
4. Perform the documentation-impact decision (`discard`, `improve`, `merge`, or `create`) and record any durable ownership rule if needed.

### Task 5: Materialize execution text without changing runtime protocols

**Files:**

- Modify: `packages/agent/gui/shared/agentCustomMentionKinds.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/agentRichText/agentMentionMarkdown.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/agentGuiController.draftMessageHelpers.ts`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/browserElementMention.ts`
- Modify: `apps/desktop/src/renderer/src/features/workspace-workbench/browser-element-context/registerDesktopBrowserElementMention.tsx`

**Steps:**

1. Let a registered custom mention optionally materialize provider-visible prompt text.
2. Preserve the canonical mention as `displayPrompt`, but expand it in `runtimeContent` immediately before dispatch.
3. Carry the bounded browser snapshot text in the browser mention scope and remove the temporary prompt-file archive.
4. Preserve the published `files` append behavior for external AgentGUI consumers; browser selection uses the additive text append path only.

### Task 6: Narrow conversation-title mention projection

**Files:**

- Modify: `packages/agent/gui/shared/agentConversationTitleProjection.ts`
- Create: `packages/agent/gui/shared/agentConversationTitlePromptSelector.ts`
- Modify: `packages/agent/gui/contexts/workspace/presentation/renderer/agentGuiConversationList/useAgentGuiConversationList.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/controller/useAgentGUIConversationRailQuery.ts`
- Modify: `packages/agent/gui/agent-gui/agentGuiNode/view/AgentGUIConversationRailItem.tsx`

**Steps:**

1. Add failing tests for task, session, app, file, and Agent title markers, plus explicit browser-element exclusion.
2. Project only the first user display prompt per session through a stable selector; assistant streaming must retain the same selector result identity.
3. Replace full `messagesBySessionId` subscriptions and per-session message sorting with the narrow prompt projection.
4. Keep browser-element mentions as registered cards in composer, timeline, and detail/workbench-header title presentation; remove them only from the conversation rail so it shows the remaining conversation text, and preserve the stored canonical title and explicit renames.
5. Run the focused title/list/Rail tests, package typecheck, runtime/renderer boundary checks, and `pnpm check:changed`.
