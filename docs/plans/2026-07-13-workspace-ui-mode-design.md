# Workspace UI Mode Design

## Goal

Keep the original Tutti OS workspace available while allowing users to select
the focused standalone Agent experience as their normal workspace interface.

## Interaction

The General settings page exposes two radio-card choices:

- Agent mode renders AgentGUI as the primary workspace surface and opens host
  tools through the new right sidebar.
- OS mode renders the existing desktop, windows, dock, launchpad, and workspace
  chrome without removing or rewriting that code path.

The preference is saved immediately and applies whenever main next creates a
window for startup or workspace opening. It does not morph an already-created
OS window into an Agent window. Explicit `view=agent` windows always remain
standalone Agent windows.

## Ownership and persistence

The mode belongs to the desktop host, not AgentGUI. It is encoded through the
existing durable desktop feature-preference map under
`workspace.standaloneAgentMode`; an absent flag resolves to OS mode. A manual
selection is always durable: `true` preserves Agent mode and `false` preserves
OS mode. The mode helper preserves unrelated flags when it changes this value.

Electron main resolves the preference before window creation. Agent mode uses
`windowKind: "agent"` plus `view=agent`; OS mode uses the original workspace
window plus `view=workspace`. Renderer routing remains explicit and AgentGUI
receives no mode state, so the OS workbench remains intact.

## Verification

- pure tests cover preference mapping and native launch-window selection
- settings-service tests cover persistence without clobbering other flags
- settings source tests cover the General-page control wiring
- desktop typecheck, i18n, renderer boundaries, build, and changed-aware checks
  cover integration
