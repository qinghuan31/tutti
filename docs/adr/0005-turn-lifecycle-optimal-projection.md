# ADR 0005 — Turn lifecycle: full optimal (reconciled projection + non-blocking command/observe), risk-controlled

> **Terminology (reconcile with ADR 0004):** "projection" here means an **in-memory,
> snapshot-reconciled** projection (folded from live events, reconciled against the
> Step-4 snapshot, replay-rebuilt per load). It is NOT a durable append-only event
> log — that remains **out of scope / future direction** per ADR 0004. The t3code/
> traycer "single event log" is the _shape_ we borrow (one reconciled state for
> turns+messages+approvals), not a commitment to persist an event log.

- Date: 2026-07-02
- Status: Accepted (grilling session) — **commit to the optimal target, no compromise; de-risked by sequencing + strangler shim + shadow-compare**
- Context: Step 5 (Cluster C) and its interaction with Step 4 (A) and Step 7 (D).
  Both reference consumers (t3code, traycer) converge on this shape; tutti's
  blocking `Exec` + single `activeTurn` slot + implicit 7-field state is the anomaly.

## Optimal target (the no-compromise end state)

A single per-session **projection** that folds ALL provider lifecycle
(turn state + messages + compaction + approvals) into explicit state, reconciled
against the Step-4 authoritative snapshot, behind a **non-blocking command/observe**
adapter API:

1. **Turn state = reducer output**, an explicit `turnPhase` state machine
   (`idle → running → compacting → interrupting → terminal{completed|failed|canceled}`),
   never a parked goroutine. Terminal transitions are ordinary events
   (`turn/completed` ∪ terminal `error` ∪ interrupted ∪ **snapshot-says-not-running**),
   NOT a status whitelist.
2. **One projection for turns AND messages**, one `Version` cursor (ADR 0004),
   one `OwnerThreadID` lane model (ADR 0003) — matching t3code's single
   `sequence` event log and traycer's single chat event log. tutti today runs two
   parallel mechanisms (activity Store for messages; blocking `activeTurn` for
   turns); the optimum unifies them.
3. **`Adapter.Exec` is non-blocking**: submit → return a turn handle; the
   controller observes progress + terminal outcome via the existing `EventSink`
   stream + the projected turn state, not a blocking return. No goroutine to
   wedge → the wedge (67009835), the stuck-spinner class, the liveness floor, and
   the single-turn constraint all disappear by construction.

## Sequencing (rides the EXISTING steps; no new steps; each shippable + green)

| Step             | Sharpened to                                                                                                                                                                                                                                                                                                                                                                                                                      | Risk control                                                                                                                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Step 4**       | Reducer emits a **unified projection** (messages **+ turn state**) into one snapshot with one monotonic cursor (ADR 0004). Turn state becomes reconcilable.                                                                                                                                                                                                                                                                       | Characterization corpus (Step 0) stays green; snapshot tested at the daemon boundary. Gap-free cursor is the prerequisite for making the projection a sole source of truth.                                                                                                          |
| **Step 5 (A+B)** | Explicit `turnPhase` enum + single `transition()` owned by the **reducer** (source of truth); `awaitTurnCompletion` rewritten as a **subscriber** ("block until phase==Terminal"). Compaction = first-class event in the machine. Terminal-error + snapshot-negative are transitions that deliver `done` + set phase.                                                                                                             | **Shadow-compare**: run the projection's terminal classification alongside the old blocking model; assert equality against the Step-0 corpus + new golden turn tests BEFORE the projection becomes authoritative. Reducer is single-writer under `a.mu`; transitions turnID-guarded. |
| **Step 7 (C+D)** | **Invert `Exec` via a strangler shim**: introduce the async submit/observe core; keep the blocking `Exec([]events, error)` signature as a thin wrapper over it (block until the projection reports terminal). Migrate controller/callers to the async API incrementally; remove the wrapper only when no caller needs it. Facade owns command/observe + session lifecycle (Cluster D). Projection unification (D) completes here. | **Strangler = reversible, no big-bang contract break.** Opens the controller↔adapter seam ONCE (with Cluster D). Gated on Step 4 snapshot being authoritative.                                                                                                                       |

## Risk controls (the "controlled" in "no compromise")

1. **Strangler shim for the Exec inversion** — the blocking signature never breaks;
   it becomes a wrapper over the async core; callers migrate one at a time; the
   wrapper is deleted last. Fully reversible per caller.
2. **Projection-as-truth introduced behind the existing blocking await first**
   (Step 5) — during a shadow period the old `done`-channel path still dominates
   if the projection disagrees; flip only after shadow-compare passes.
3. **Shadow-compare + characterization corpus** — new turn-state projection runs
   in parallel; its terminal classification must match the old model against the
   Step-0 corpus + golden turn tests before it becomes authoritative.
4. **Hard gate: C depends on Step 4** — the projection cannot be the sole source of
   truth until the snapshot is gap-free/authoritative (ADR 0004).
5. **One controller touch** — do C with Step 7 (Cluster D) so the seam opens once.
6. **Per-step green + independently shippable** — the design's existing discipline;
   no step combines seams beyond its owner.

## Why no-compromise is safe here

- A+B (Step 5) are **strictly on the optimal path** — the enum machine as source of
  truth is step one of the projection, not a throwaway patch. Nothing built is discarded.
- C (Exec inversion) is the only controller-touching leap, and the **strangler shim
  makes it incremental and reversible** — the blast radius is opened one caller at a
  time behind a stable signature, gated on Step 4, aligned with Step 7's existing seam.
- D (unification) is the natural convergence of ADR 0003 (`OwnerThreadID`), ADR 0004
  (cursor), and the Step-4 reducer — one projection the other ADRs already feed.

## Supersedes / relates

- Supersedes the "minimal + explicit enum" vs "structural async" fork: **A+B = the
  enum beachhead, C+D = the structural completion; all committed, sequenced.**
- Makes ADR 0004 (cursor) a hard prerequisite and ADR 0003 (`OwnerThreadID`) a
  feeder of the same unified projection.
