# Agent GUI Node Architecture

Status: durable target architecture

Applies to:

- `services/tuttid` agent APIs, workflows, and durable state
- `packages/agent/daemon` provider runtimes and provider registry
- `packages/agent/activity-core` workspace agent engine
- `packages/agent/gui` Agent GUI presentation
- `apps/desktop` Agent GUI host integration

This document defines ownership and dependency direction. It does not track
refactor completion; implementation status belongs in the active refactor plan
and review handoff.

## System Shape

```text
provider runtime
  -> tuttid command/event boundary
  -> daemon entities + workflow saga/outbox
  -> workspace AgentSessionEngine
  -> selectors and commands
  -> Agent GUI vertical modules
  -> view components
```

Desktop supplies host capabilities and embeds the GUI. It is not a second agent
business core. Agent GUI renders engine projections and emits commands. It does
not reconstruct durable session or turn truth from panels, transcript rows, or
provider-specific payloads.

## Daemon Ownership

`services/tuttid` owns durable agent entities and workflows:

- session identity, metadata, settings, and resumability
- turn lifecycle, outcome, and exact-turn cancellation
- interactions, approvals, and interactive prompt responses
- prompt submission identity and idempotency
- goal state and long-running workflow state
- durable event ordering and recovery

Session and turn are separate entities. A session may exist without a running
turn and may contain many settled turns. Running, waiting, completed, failed,
and canceled are turn lifecycle states; they must not be copied onto the
session as a competing lifecycle field.

Commands that cross process or persistence boundaries use a saga/outbox flow:

```text
validated command
  -> persist intent and outbox record atomically
  -> dispatch to provider runtime
  -> ingest correlated provider events
  -> reduce entity state
  -> mark or retry outbox work
```

Each command carries stable correlation identity. Submit uses a client submit
ID; turn commands identify the exact turn. Retries must be idempotent. Recovery
must resume persisted work rather than infer intent from UI state or the latest
transcript row.

OpenAPI contracts change before daemon HTTP request or response code. Generated
clients and event contracts are projections of that schema, not independent
models.

## Workspace Engine Ownership

One `AgentSessionEngine` instance owns agent state for one workspace and runtime
origin. It is the only frontend owner of canonical sessions, turns,
interactions, pending intents, prompt queue state, and workflow operation state.

```text
daemon snapshot/events -> engine reducers -> canonical entity indexes
GUI command             -> engine command -> runtime adapter -> daemon
engine selectors        -> stable GUI projections
```

Consumers must not create parallel stores for canonical agent data. They must
not read reducer maps directly or derive lifecycle from transcript messages.
All reads go through exported selectors; all writes go through engine commands.
The engine reconciles optimistic intent with authoritative events by correlation
ID.

The engine identity is explicit. A consumer resolves the injected engine for
its workspace and runtime origin; module-global runtime slots and hidden origin
registries are forbidden.

UI-local state may include draft text, selected panel, rail layout, open menus,
scroll position, and temporary presentation focus. UI-local state must not own
session lifecycle, turn lifecycle, queue delivery, or durable workflow status.

## Agent GUI Module Shape

Agent GUI is organized by vertical behavior rather than one controller with
horizontal helper piles. A vertical module owns its projection, commands,
UI-local state, and focused tests. Typical modules include:

- conversation navigation and session selection
- composer and prompt queue
- transcript and turn presentation
- approval and interactive prompt handling
- provider target selection and readiness presentation
- goal presentation and control
- files, mentions, and turn summaries

The node shell composes modules. It does not orchestrate their workflows.
Controller code may bind selectors and commands, but it must not become a
second state machine or a registry of panel-specific effects. When a controller
grows across multiple behaviors, extract a complete vertical module instead of
moving lines into generic `helpers`, `shared`, or `utils` files.

Business-code files stay at or below the repository line limit. After a
refactor, remove superseded stores, adapters, effects, and compatibility paths;
do not leave two active ownership models.

## Public Node Contract

`AgentGUINodeProps` exposes semantic responsibility objects only:

| Object             | Responsibility                                                    |
| ------------------ | ----------------------------------------------------------------- |
| `identity`         | node, workspace, user, and title identity                         |
| `workspace`        | workspace path, references, project selection, and agent settings |
| `frame`            | position, size, activation, embedding, and preview layout         |
| `state`            | persisted Agent GUI node data                                     |
| `runtimeRequests`  | focus, launch, prefill, and provider probe requests               |
| `hostCapabilities` | host-projected catalogs, readiness, menus, and icons              |
| `hostActions`      | host mutations and workbench/window actions                       |
| `renderSlots`      | narrow host presentation slots                                    |

These groups are required even when a group has no optional values. Do not add
flat compatibility props. Add a field to the object that owns its meaning, or
create a new responsibility object only when it represents a genuinely separate
boundary.

Render slots receive narrow neutral context. Product authorization, transport,
or workflow behavior must not be hidden inside a render slot.

## Provider Architecture

The daemon `providerregistry` is the source of truth for provider identity and
behavior descriptors. A descriptor declares typed strategies and capabilities
for runtime, status/auth, composer behavior, events, sidecars, external import,
desktop integration, and CLI integration.

Cross-provider consumers follow this shape:

```text
provider ID
  -> providerregistry descriptor
  -> typed strategy/capability selector
  -> provider-neutral consumer behavior
```

Consumers must not branch on Codex, Claude Code, Cursor, Hermes, Nexight,
OpenClaw, OpenCode, or Tutti Agent identity to select behavior. Provider-owned
wire adapters may translate their own protocol, but shared policy belongs in a
typed descriptor or selector. Unknown providers produce an explicit unsupported
result; they do not silently inherit another provider's behavior.

Generated GUI identity data is presentation metadata only. A provider target
is host-supplied launch authority with a real provider identity and opaque target
reference. Agent GUI displays and selects targets but does not invent runnable
targets when the host catalog is absent.

Standard ACP adapters normalize provider wire events before persistence. A tool
call keeps one stable canonical identity, such as `Bash`, `Edit`, `Read`, or
`TodoWrite`, from start through terminal updates even when the provider changes
its human-readable title to a command, path, or result summary. Provider
envelopes such as `rawInput`, `rawOutput`, and output metadata are projected into
the canonical tool payload consumed by shared renderers. Agent GUI may normalize
historical persisted envelopes for display compatibility, but it must not add
provider-specific rendering branches.

Conversation file links use the selected project root when one exists. For a
no-project session, the durable session cwd is the file-resolution root. This
keeps link navigation attached to session identity instead of requiring project
selection state.

## Desktop Host Boundary

`apps/desktop` owns Electron/workbench integration and concrete host
capabilities:

- workspace window and node lifecycle
- provider status and login actions
- file/reference adapters and project selection
- desktop preferences, notifications, and app icons
- construction and injection of the workspace activity runtime

Desktop passes grouped Agent GUI props and runtime interfaces. It must not
mirror engine entities, implement provider policy switches, or derive session
truth to make a panel render correctly.

Opening a conversation activates a durable session through the engine. Opening
it in another panel creates workbench presentation state around the same durable
session; it does not clone the session. Provider handoff starts a new session
with an explicit target and prompt reference rather than mutating the running
session's provider.

## No Panel Orchestration

Panels and components are presentation boundaries. They may:

- render selector output
- hold ephemeral interaction state
- dispatch typed actions
- report narrow layout or focus events

They may not:

- subscribe directly to daemon event streams
- own timers that advance durable workflows
- coordinate create/activate/send/cancel sequences
- reconcile optimistic and authoritative entity state
- inspect provider identity to select business behavior
- read another panel's internal store to decide workflow state

Multi-step behavior belongs in daemon workflows or engine commands. If a panel
needs several durable mutations, expose one semantic command rather than
sequencing transport calls in React effects.

## Submit And Startup Transactions

`clientSubmitId` is the daemon-owned idempotency key, not merely a diagnostic
field. Before invoking a provider, the daemon persists a submit claim scoped by
workspace, session, and client submit ID. A duplicate accepted claim returns
the existing turn; a prepared claim reports delivery as unknown/confirming and
must never invoke the provider again.

Creating a session with initial content is one transaction. Provider startup
may create provisional runtime state, but the Session is not published or
persisted until the first Turn is accepted. Validation or execution failure
rolls the provisional runtime and its pending command/config snapshots back;
it must not leave a turnless Session or a synthetic message without a Turn.

The session engine owns activation deadlines. It passes one cancellation signal
through the desktop command port and HTTP adapter. Adapters must not race the
engine with an independent timeout budget; command timeout, cancellation, and
uncertain-delivery reconciliation are one engine workflow.

## Validation

Use focused tests while iterating, then the repository checks for the changed
surface:

```sh
pnpm check:agent-activity-runtime-boundaries
pnpm check:agent-provider-strategy-boundaries
pnpm check:agent-gui-degradation
pnpm check:renderer-boundaries
pnpm lint:ts
pnpm typecheck
pnpm --filter @tutti-os/agent-gui test
pnpm --filter @tutti-os/desktop build
pnpm check:changed
```

Contract tests should lock:

- session and turn entity separation
- command correlation and idempotent replay
- selector behavior for running and settled turns
- grouped public props without flat regressions
- provider descriptor coverage for every registered provider
- render budgets for common GUI interactions

## Diagnostics

Diagnostics follow one command or event across boundaries using stable IDs:

- `workspaceId`
- `agentSessionId`
- `turnId`
- `clientSubmitId` or command ID
- provider ID and provider session ID when available

Submit correlation and submit diagnostics are separate typed contracts.
`clientSubmitId` remains a top-level idempotency identity; optional timing and
content-shape evidence travels as `submitDiagnostics` with the same field names
as the OpenAPI request schema. Generic metadata bags must not cross the engine
or daemon command seam because conditional object spreads can otherwise hide
request-contract drift from TypeScript.

For one investigated problem, every diagnostic log uses the same prefix and
serializes its payload with `JSON.stringify`. Investigation logs remain enabled
until the root cause is established. Unknown state requires more boundary
evidence before behavior changes.

Debug in ownership order:

1. Verify daemon command acceptance, persisted intent, and correlated events.
2. Verify engine reduction and selector output for the same IDs.
3. Verify the vertical GUI module receives that selector output.
4. Verify the view renders it without adding workflow interpretation.

If evidence ends at a boundary, add diagnostics at both sides of that boundary.
Fix the first broken ownership transition.

## Documentation Impact

Update this document when ownership, entity flow, public node responsibilities,
provider strategy dispatch, validation, or diagnostic conventions change.
User-visible interaction details belong in product documentation; recurring
symptom playbooks belong in `docs/conventions/troubleshooting.md`.
