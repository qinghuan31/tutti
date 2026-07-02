# ADR 0003 — Step 3: thread registry + sub-agent event routing (identity-preserving)

- Date: 2026-07-02
- Status: Accepted (grilling session)
- Context: Step 3 (state machine B) replaces #602's foreign-thread drop-filter
  (`appServerNotificationThreadMismatch`). Decided by comparing three real
  consumers: t3code, and traycer's `subagent-nesting.ts` GUI protocol.

## Decision: identity-preserving routing (design "option 丙"), NOT suppression

The daemon routes sub-agent (child-thread) events **preserving child identity**,
rather than dropping them (rejected option 1) or flat-re-tagging them into the
parent turn (t3code's re-tag path, rejected — see Concurrency).

### Mechanism (daemon reducer, single-owner)

1. **Child→parent linkage from the parent item, not `parentThreadId`.** Seed a
   `map[childThreadID]parent` from the parent `collabAgentToolCall` item's
   **`receiverThreadIds`** (required, present already on `item/started`
   status=inProgress). Confirmed by t3code (`rememberCollabReceiverTurns`).
   `Thread.parentThreadId` exists in the schema but is NOT needed.
2. **Suppress child lifecycle/turn noise** (thread/\*, turn/started, turn/completed,
   turn/plan, item/plan/delta, tokenUsage…) — cf. traycer `SUBAGENT_SUPPRESSED_EVENTS`
   and t3code `shouldSuppressChildConversationNotification`.
3. **Re-home the remaining substantive child events** (item/started, item/completed,
   deltas, reasoning) onto the parent session stream, **stamped with a new
   `OwnerThreadID`** = the child thread id (cf. traycer `parentBlockId` /
   agent-runtime "owner of this event for nested rendering").
4. **Summary card unchanged:** the parent `collabAgentToolCall` item still drives
   the collab card's final status/output (`appServerCollabAgentRawOutput`); Step 0
   `TestAppServerCollabAgentCompletedCarriesResultOutput` stays green untouched.
5. **Unknown/foreign threads** (not in the child map, e.g. grandchildren — nested
   spawns are suppressed so we never learn their mapping) fall through to the
   ADR-0002 unknown-fallback (log + drop), same net effect as today's mismatch.

### Data-model change (seam into Step 4)

- Add optional **`OwnerThreadID string`** to `activityshared.Event`
  (`packages/agent/daemon/activity/events/activity_types.go`). Empty = top-level
  main agent; non-empty = produced by that sub-agent child thread. Plain string —
  agent-agnostic, no codex-wire type (honors D7). `AgentSessionID`/`ProviderSessionID`
  stay = the PARENT session so the event belongs to the parent conversation.

### Wiring scope this refactor vs deferred

- **Wired now:** the summary collab card (as today). `OwnerThreadID`-tagged child
  events are emitted-but-unrendered (additive) — same philosophy as Step 1.
- **Deferred (Step 9 / desktop):** traycer-style named, collapsible, per-sub-agent
  live-progress cards, fed by data ALREADY in the stream via `OwnerThreadID`.
  This is what makes D10's "nested visualization made cheap by the registry"
  actually true — suppression (option 1) would have destroyed the data and broken
  that promise.

## Why not the alternatives

- **Option 1 (drop all child events):** minimal, but destroys child identity at the
  daemon → the deferred nested view would NOT be cheap (contradicts D10) and the
  traycer-quality UX is foreclosed.
- **t3code re-tag-to-parent-turn (flat):** concurrent sub-agents + parent all share
  one turnId; the UI appends by turnId with no collab-awareness → **garbled
  interleaved output**. Loses child identity.

## Corrections to the design

- **D8:** no per-thread reducer. A single reducer + `map[childThreadID]parent` +
  a suppress-set + an `OwnerThreadID` stamp. Lighter than "route each notification
  to its own per-thread reducer".
- **D10:** linkage is `receiverThreadIds` (parent declares children), not
  `parentThreadId`; "made cheap by the registry" REQUIRES identity preservation
  (`OwnerThreadID`), which this ADR guarantees.

## Concurrency semantics (verified)

- **Multiple sub-agents:** N spawns → N distinct `collabAgentToolCall` items
  (distinct itemId) → N cards; or one spawn with `receiverThreadIds:[t1..tN]` +
  plural `agentsStates` → one card, N lanes. Each child thread is its own
  `OwnerThreadID` lane → future UI renders separate cards, no garble.
- **Parent + child simultaneous:** parent deltas flow on the parent stream;
  child deltas carry `OwnerThreadID` → never corrupt the parent's text.
- **Ordering:** mapping is known at child announce time (`receiverThreadIds`
  required on item/started). Early child event before the announce → unknown-fallback
  (log+drop), validate against real logs. Registry map is owned by the single
  sequential reducer (or mutex-guarded).
