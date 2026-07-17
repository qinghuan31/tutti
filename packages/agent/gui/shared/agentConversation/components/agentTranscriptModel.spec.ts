import { describe, expect, it } from "vitest";
import type { AgentTranscriptPresentationKind } from "../contracts/agentTranscriptPresentation";
import type { AgentTranscriptRowVM } from "../contracts/agentTranscriptRowVM";
import { findTurnDividerRowIndexes } from "./agentTranscriptModel";

describe("findTurnDividerRowIndexes", () => {
  const turnIndexes = new Map([
    ["turn-1", 0],
    ["turn-2", 1]
  ]);

  it("keeps the normal divider between turns", () => {
    expect([
      ...findTurnDividerRowIndexes(turnIndexes, [row("turn-1"), row("turn-2")])
    ]).toEqual([1]);
  });

  it("does not stack a turn divider immediately after a semantic boundary", () => {
    expect([
      ...findTurnDividerRowIndexes(turnIndexes, [
        row("turn-1", "turn-boundary"),
        row("turn-2")
      ])
    ]).toEqual([]);
  });

  it("keeps the divider for running progress and non-adjacent boundaries", () => {
    expect([
      ...findTurnDividerRowIndexes(turnIndexes, [
        row("turn-1", "specific-progress"),
        row("turn-2")
      ])
    ]).toEqual([1]);
    expect([
      ...findTurnDividerRowIndexes(turnIndexes, [
        row("turn-1", "turn-boundary"),
        row("turn-1"),
        row("turn-2")
      ])
    ]).toEqual([2]);
  });
});

function row(
  turnId: string,
  presentationKind: AgentTranscriptPresentationKind = "content"
): AgentTranscriptRowVM {
  return {
    kind: "message",
    id: `row:${turnId}:${presentationKind}`,
    turnId,
    speaker: "assistant",
    messages: [
      {
        kind: "message-content",
        id: `message:${turnId}:${presentationKind}`,
        turnId,
        body: presentationKind,
        presentationKind,
        occurredAtUnixMs: 1
      }
    ],
    thinking: [],
    occurredAtUnixMs: 1
  };
}
