import { describe, expect, it } from "vitest";
import type { WorkspaceAgentActivityTimelineItem } from "../../workspaceAgentActivityTypes";
import {
  attachSubAgentLanesToConversationVM,
  buildSubAgentLanesByCallId,
  partitionSubAgentTimelineItems,
  timelineItemOwnerThreadId
} from "./subAgentTimelinePartition";
import type { AgentConversationVM } from "../contracts/agentConversationVM";

describe("subAgentTimelinePartition", () => {
  describe("timelineItemOwnerThreadId", () => {
    it("reads a non-empty ownerThreadId from the payload", () => {
      expect(
        timelineItemOwnerThreadId(
          timelineItem({
            id: 1,
            eventId: "child-1",
            payload: { ownerThreadId: "child-thread-1" }
          })
        )
      ).toBe("child-thread-1");
    });

    it("ignores blank and missing ownerThreadId values", () => {
      expect(
        timelineItemOwnerThreadId(
          timelineItem({
            id: 1,
            eventId: "parent-1",
            payload: { ownerThreadId: "   " }
          })
        )
      ).toBeNull();
      expect(
        timelineItemOwnerThreadId(timelineItem({ id: 2, eventId: "parent-2" }))
      ).toBeNull();
    });
  });

  describe("partitionSubAgentTimelineItems", () => {
    it("excludes child-thread rows from the main flow and groups them by owner", () => {
      const parentMessage = timelineItem({
        id: 1,
        eventId: "assistant-1",
        itemType: "message.assistant",
        role: "assistant",
        payload: { text: "parent output" }
      });
      const childMessage = timelineItem({
        id: 2,
        eventId: "child-msg-1",
        itemType: "message.assistant",
        role: "assistant",
        payload: { text: "child output", ownerThreadId: "child-thread-1" }
      });
      const childCall = timelineItem({
        id: 3,
        eventId: "child-call-1",
        itemType: "call.started",
        callId: "child-call-1",
        name: "Run command",
        payload: { ownerThreadId: "child-thread-1" }
      });
      const otherChildRow = timelineItem({
        id: 4,
        eventId: "child-msg-2",
        itemType: "message.assistant",
        role: "assistant",
        payload: { text: "second child", ownerThreadId: "child-thread-2" }
      });

      const partition = partitionSubAgentTimelineItems([
        parentMessage,
        childMessage,
        childCall,
        otherChildRow
      ]);

      expect(partition.mainTimelineItems).toEqual([parentMessage]);
      expect([...partition.subAgentItemsByOwner.keys()]).toEqual([
        "child-thread-1",
        "child-thread-2"
      ]);
      expect(partition.subAgentItemsByOwner.get("child-thread-1")).toEqual([
        childMessage,
        childCall
      ]);
    });

    it("returns the input array unchanged when no child rows exist", () => {
      const items = [
        timelineItem({ id: 1, eventId: "assistant-1" }),
        timelineItem({ id: 2, eventId: "assistant-2" })
      ];
      const partition = partitionSubAgentTimelineItems(items);
      expect(partition.mainTimelineItems).toBe(items);
      expect(partition.subAgentItemsByOwner.size).toBe(0);
    });
  });

  describe("buildSubAgentLanesByCallId", () => {
    it("attaches a running lane to the in-progress collab spawn card", () => {
      const partition = partitionSubAgentTimelineItems([
        collabCardItem({
          id: 10,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100
        }),
        childAssistantItem({
          id: 11,
          eventId: "child-msg-1",
          ownerThreadId: "child-thread-1",
          text: "Scanning the repository layout",
          occurredAtUnixMs: 150
        }),
        childCallItem({
          id: 12,
          eventId: "child-call-1",
          ownerThreadId: "child-thread-1",
          name: "Run command",
          occurredAtUnixMs: 220
        })
      ]);

      const lanes = buildSubAgentLanesByCallId(partition);

      expect(lanes.get("spawn-1")).toEqual([
        {
          ownerThreadId: "child-thread-1",
          status: "running",
          latestActivity: "Run command",
          latestActivityKind: "tool",
          startedAtUnixMs: 150,
          latestActivityAtUnixMs: 220
        }
      ]);
    });

    it("uses the trailing snippet of the latest assistant text as lane activity", () => {
      const longText = `intro ${"x".repeat(200)} live tail`;
      const partition = partitionSubAgentTimelineItems([
        collabCardItem({
          id: 10,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100
        }),
        childAssistantItem({
          id: 11,
          eventId: "child-msg-1",
          ownerThreadId: "child-thread-1",
          text: longText,
          occurredAtUnixMs: 150
        })
      ]);

      const lane = buildSubAgentLanesByCallId(partition).get("spawn-1")?.[0];

      expect(lane?.latestActivityKind).toBe("message");
      expect(lane?.latestActivity?.startsWith("…")).toBe(true);
      expect(lane?.latestActivity?.endsWith("live tail")).toBe(true);
      expect(lane?.latestActivity?.length).toBeLessThanOrEqual(141);
    });

    it("classifies reasoning rows as reasoning activity", () => {
      const partition = partitionSubAgentTimelineItems([
        collabCardItem({
          id: 10,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100
        }),
        timelineItem({
          id: 11,
          eventId: "child-think-1",
          itemType: "message.assistant_thinking",
          role: "assistant_thinking",
          payload: {
            text: "Considering options",
            ownerThreadId: "child-thread-1"
          },
          occurredAtUnixMs: 150
        })
      ]);

      const lane = buildSubAgentLanesByCallId(partition).get("spawn-1")?.[0];

      expect(lane?.latestActivityKind).toBe("reasoning");
      expect(lane?.latestActivity).toBe("Considering options");
    });

    it("prefers an exact match when a completed card's output names the child thread", () => {
      const partition = partitionSubAgentTimelineItems([
        collabCardItem({
          id: 10,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100
        }),
        collabCardItem({
          id: 11,
          eventId: "spawn-2-started",
          callId: "spawn-2",
          status: "running",
          occurredAtUnixMs: 110
        }),
        collabCardItem({
          id: 12,
          eventId: "spawn-1-completed",
          callId: "spawn-1",
          itemType: "call.completed",
          status: "completed",
          occurredAtUnixMs: 300,
          output: {
            result: { agent_id: "child-thread-1", status: "completed" }
          }
        }),
        childAssistantItem({
          id: 13,
          eventId: "child-msg-1",
          ownerThreadId: "child-thread-1",
          text: "done",
          occurredAtUnixMs: 250
        })
      ]);

      const lanes = buildSubAgentLanesByCallId(partition);

      // Time affinity alone would pick spawn-2 (latest card started before the
      // lane); the completed output's agent_id pins the lane to spawn-1.
      expect(lanes.get("spawn-2")).toBeUndefined();
      expect(lanes.get("spawn-1")).toEqual([
        expect.objectContaining({
          ownerThreadId: "child-thread-1",
          status: "completed"
        })
      ]);
    });

    it("keys lanes by the card input's receiverThreadIds over time affinity while both spawns run", () => {
      const partition = partitionSubAgentTimelineItems([
        collabCardItem({
          id: 10,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100,
          receiverThreadIds: ["child-thread-1"]
        }),
        collabCardItem({
          id: 11,
          eventId: "spawn-2-started",
          callId: "spawn-2",
          status: "running",
          occurredAtUnixMs: 110,
          receiverThreadIds: ["child-thread-2"]
        }),
        // child-1's first activity lands after spawn-2 started: time affinity
        // alone would mis-attribute it to spawn-2 while both are running.
        childAssistantItem({
          id: 12,
          eventId: "child-1-msg",
          ownerThreadId: "child-thread-1",
          text: "working on task one",
          occurredAtUnixMs: 150
        }),
        childAssistantItem({
          id: 13,
          eventId: "child-2-msg",
          ownerThreadId: "child-thread-2",
          text: "working on task two",
          occurredAtUnixMs: 160
        })
      ]);

      const lanes = buildSubAgentLanesByCallId(partition);

      expect(lanes.get("spawn-1")).toEqual([
        expect.objectContaining({ ownerThreadId: "child-thread-1" })
      ]);
      expect(lanes.get("spawn-2")).toEqual([
        expect.objectContaining({ ownerThreadId: "child-thread-2" })
      ]);
    });

    it("marks lanes failed when their card failed", () => {
      const partition = partitionSubAgentTimelineItems([
        collabCardItem({
          id: 10,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100
        }),
        collabCardItem({
          id: 11,
          eventId: "spawn-1-failed",
          callId: "spawn-1",
          itemType: "call.errored",
          status: "failed",
          occurredAtUnixMs: 300
        }),
        childAssistantItem({
          id: 12,
          eventId: "child-msg-1",
          ownerThreadId: "child-thread-1",
          text: "exploded",
          occurredAtUnixMs: 200
        })
      ]);

      expect(
        buildSubAgentLanesByCallId(partition).get("spawn-1")?.[0]?.status
      ).toBe("failed");
    });

    it("attaches an early-arriving lane once a card exists (ordering edge)", () => {
      const partition = partitionSubAgentTimelineItems([
        childAssistantItem({
          id: 10,
          eventId: "child-msg-1",
          ownerThreadId: "child-thread-1",
          text: "started before the card",
          occurredAtUnixMs: 90
        }),
        collabCardItem({
          id: 11,
          eventId: "spawn-1-started",
          callId: "spawn-1",
          status: "running",
          occurredAtUnixMs: 100
        })
      ]);

      expect(
        buildSubAgentLanesByCallId(partition).get("spawn-1")?.[0]?.ownerThreadId
      ).toBe("child-thread-1");
    });

    it("returns no lanes when there is no collab card to attach to", () => {
      const partition = partitionSubAgentTimelineItems([
        timelineItem({
          id: 10,
          eventId: "call-1",
          itemType: "call.started",
          callId: "shell-1",
          name: "Run command",
          payload: { toolName: "Bash", callId: "shell-1" },
          occurredAtUnixMs: 100
        }),
        childAssistantItem({
          id: 11,
          eventId: "child-msg-1",
          ownerThreadId: "child-thread-1",
          text: "orphan output",
          occurredAtUnixMs: 150
        })
      ]);

      expect(buildSubAgentLanesByCallId(partition).size).toBe(0);
    });
  });

  describe("attachSubAgentLanesToConversationVM", () => {
    it("returns the conversation untouched when there are no lanes", () => {
      const conversation = { rows: [] } as unknown as AgentConversationVM;
      expect(attachSubAgentLanesToConversationVM(conversation, new Map())).toBe(
        conversation
      );
    });
  });
});

function timelineItem(
  overrides: Partial<WorkspaceAgentActivityTimelineItem> & {
    id: number;
    eventId: string;
  }
): WorkspaceAgentActivityTimelineItem {
  return {
    workspaceId: "room-1",
    agentSessionId: "session-1",
    actorType: "agent",
    actorId: "codex",
    itemType: "message.assistant",
    occurredAtUnixMs: overrides.id,
    createdAtUnixMs: overrides.id,
    ...overrides
  };
}

function collabCardItem({
  id,
  eventId,
  callId,
  status,
  occurredAtUnixMs,
  itemType = "call.started",
  output,
  receiverThreadIds
}: {
  id: number;
  eventId: string;
  callId: string;
  status: string;
  occurredAtUnixMs: number;
  itemType?: string;
  output?: Record<string, unknown>;
  receiverThreadIds?: readonly string[];
}): WorkspaceAgentActivityTimelineItem {
  return timelineItem({
    id,
    eventId,
    itemType,
    callType: "tool",
    callId,
    name: "spawnAgent",
    status,
    payload: {
      callId,
      name: "spawnAgent",
      toolName: "Agent",
      kind: "execute",
      status,
      input: {
        task: "inspect the repository",
        agentName: "spawnAgent",
        ...(receiverThreadIds ? { receiverThreadIds } : {})
      },
      ...(output ? { output } : {})
    },
    occurredAtUnixMs,
    createdAtUnixMs: occurredAtUnixMs
  });
}

function childAssistantItem({
  id,
  eventId,
  ownerThreadId,
  text,
  occurredAtUnixMs
}: {
  id: number;
  eventId: string;
  ownerThreadId: string;
  text: string;
  occurredAtUnixMs: number;
}): WorkspaceAgentActivityTimelineItem {
  return timelineItem({
    id,
    eventId,
    itemType: "message.assistant",
    role: "assistant",
    payload: { text, ownerThreadId },
    occurredAtUnixMs,
    createdAtUnixMs: occurredAtUnixMs
  });
}

function childCallItem({
  id,
  eventId,
  ownerThreadId,
  name,
  occurredAtUnixMs
}: {
  id: number;
  eventId: string;
  ownerThreadId: string;
  name: string;
  occurredAtUnixMs: number;
}): WorkspaceAgentActivityTimelineItem {
  return timelineItem({
    id,
    eventId,
    itemType: "call.started",
    callType: "tool",
    callId: `${eventId}-call`,
    name,
    status: "running",
    payload: { name, ownerThreadId, callId: `${eventId}-call` },
    occurredAtUnixMs,
    createdAtUnixMs: occurredAtUnixMs
  });
}
