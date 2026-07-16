# ADR 0007 — Sub-agent lane ownership

- Date: 2026-07-03
- Status: Superseded
- Superseded by:
  [Provider-Native Subagents](../specs/2026-07-15-provider-native-subagents.md)

## Former Problem

The earlier timeline-only model did not persist which delegation tool created a
provider child thread. AgentGUI therefore guessed lane attachment from a
partially loaded transcript, which could attach output to the wrong tool card.

## Current Decision

Provider-native agents are durable child `WorkspaceAgentSession` entities with
their own turns, messages, and interactions. Each child stores one immutable
creator relation:

- root session and root turn
- direct parent session and parent turn
- parent delegation tool-call id

AgentGUI attaches lanes only from those session relations and derives status
only from the child's canonical turn. It does not read timeline ownership
fields, infer relationships from message order, or reconstruct historical rows
that lack a child session.

This ADR remains only as the record of why inferred timeline ownership was
rejected. The linked specification is the implementation contract.
