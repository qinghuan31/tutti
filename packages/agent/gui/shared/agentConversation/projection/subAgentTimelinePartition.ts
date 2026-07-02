import type { WorkspaceAgentActivityTimelineItem } from "../../workspaceAgentActivityTypes";
import {
  isWorkspaceAgentToolCallItem,
  resolveWorkspaceAgentToolName
} from "../../workspaceAgentToolCallDisplay";
import type {
  AgentTaskSubAgentStatus,
  AgentTaskSubAgentVM
} from "../contracts/agentTaskItemVM";
import type { AgentConversationVM } from "../contracts/agentConversationVM";
import type { AgentToolCallVM } from "../contracts/agentToolCallVM";
import type { AgentToolGroupRowVM } from "../contracts/agentToolGroupRowVM";

// Codex app-server collab child threads report their activity through the
// parent session. The daemon stamps every child-thread row with a non-empty
// payload.ownerThreadId (reporter.go withOwnerThreadID); parent rows never
// carry the key. These rows must never interleave with the parent transcript:
// they are segregated here and re-surfaced as live sub-agent lanes on the
// parent's collab tool card (the spawn card, which has no ownerThreadId).

export interface SubAgentTimelinePartition {
  mainTimelineItems: WorkspaceAgentActivityTimelineItem[];
  subAgentItemsByOwner: ReadonlyMap<
    string,
    WorkspaceAgentActivityTimelineItem[]
  >;
}

export function timelineItemOwnerThreadId(
  item: WorkspaceAgentActivityTimelineItem
): string | null {
  const ownerThreadId = item.payload?.ownerThreadId;
  if (typeof ownerThreadId !== "string") {
    return null;
  }
  const trimmed = ownerThreadId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function partitionSubAgentTimelineItems(
  timelineItems: readonly WorkspaceAgentActivityTimelineItem[]
): SubAgentTimelinePartition {
  const subAgentItemsByOwner = new Map<
    string,
    WorkspaceAgentActivityTimelineItem[]
  >();
  let mainTimelineItems: WorkspaceAgentActivityTimelineItem[] | null = null;
  for (let index = 0; index < timelineItems.length; index += 1) {
    const item = timelineItems[index];
    if (!item) {
      continue;
    }
    const ownerThreadId = timelineItemOwnerThreadId(item);
    if (!ownerThreadId) {
      mainTimelineItems?.push(item);
      continue;
    }
    if (!mainTimelineItems) {
      mainTimelineItems = timelineItems.slice(0, index);
    }
    const ownerItems = subAgentItemsByOwner.get(ownerThreadId) ?? [];
    ownerItems.push(item);
    subAgentItemsByOwner.set(ownerThreadId, ownerItems);
  }
  return {
    mainTimelineItems:
      mainTimelineItems ??
      (timelineItems as WorkspaceAgentActivityTimelineItem[]),
    subAgentItemsByOwner
  };
}

// A collab spawn card summarizes one delegated agent in the parent transcript.
// Lanes attach to cards by (a) the card input's receiverThreadIds — the daemon
// forwards the raw item's declared child thread ids, the authoritative key —
// then (b) exact match on a completed card's output payload mentioning the
// child thread id, and finally (c) time affinity for rows produced before the
// daemon forwarded receiverThreadIds: the most recently started collab card
// that began at or before the lane's first activity, preferring running cards.
interface SubAgentCollabCard {
  callId: string;
  startedAtUnixMs: number;
  status: AgentTaskSubAgentStatus;
  receiverThreadIds: ReadonlySet<string>;
  outputStrings: ReadonlySet<string>;
}

export function buildSubAgentLanesByCallId(
  partition: SubAgentTimelinePartition
): ReadonlyMap<string, AgentTaskSubAgentVM[]> {
  const lanesByCallId = new Map<string, AgentTaskSubAgentVM[]>();
  if (partition.subAgentItemsByOwner.size === 0) {
    return lanesByCallId;
  }
  const cards = collectCollabCards(partition.mainTimelineItems);
  if (cards.length === 0) {
    return lanesByCallId;
  }
  for (const [ownerThreadId, items] of partition.subAgentItemsByOwner) {
    const sortedItems = [...items].sort(compareTimelineItemsAscending);
    const startedAtUnixMs = timelineItemTime(sortedItems[0]);
    const card =
      cards.find((candidate) => candidate.receiverThreadIds.has(ownerThreadId)) ??
      cards.find((candidate) => candidate.outputStrings.has(ownerThreadId)) ??
      matchCardByTimeAffinity(cards, startedAtUnixMs);
    if (!card) {
      continue;
    }
    const lanes = lanesByCallId.get(card.callId) ?? [];
    lanes.push(subAgentLane(ownerThreadId, sortedItems, card.status));
    lanesByCallId.set(card.callId, lanes);
  }
  for (const lanes of lanesByCallId.values()) {
    lanes.sort(
      (left, right) =>
        (left.startedAtUnixMs ?? 0) - (right.startedAtUnixMs ?? 0) ||
        left.ownerThreadId.localeCompare(right.ownerThreadId)
    );
  }
  return lanesByCallId;
}

export function attachSubAgentLanesToConversationVM(
  conversation: AgentConversationVM | null,
  lanesByCallId: ReadonlyMap<string, AgentTaskSubAgentVM[]>
): AgentConversationVM | null {
  if (!conversation || lanesByCallId.size === 0) {
    return conversation;
  }
  let changed = false;
  const rows = conversation.rows.map((row) => {
    if (row.kind !== "tool-group") {
      return row;
    }
    const nextRow = toolGroupRowWithSubAgents(row, lanesByCallId);
    if (nextRow !== row) {
      changed = true;
    }
    return nextRow;
  });
  return changed ? { ...conversation, rows } : conversation;
}

function toolGroupRowWithSubAgents(
  row: AgentToolGroupRowVM,
  lanesByCallId: ReadonlyMap<string, AgentTaskSubAgentVM[]>
): AgentToolGroupRowVM {
  let changed = false;
  const callsById = new Map<string, AgentToolCallVM>();
  const calls = row.calls.map((call) => {
    const lanes = call.task ? lanesByCallId.get(toolCallRawId(call.id)) : null;
    if (!lanes || lanes.length === 0 || !call.task) {
      return call;
    }
    changed = true;
    const nextCall: AgentToolCallVM = {
      ...call,
      task: { ...call.task, subAgents: lanes }
    };
    callsById.set(nextCall.id, nextCall);
    return nextCall;
  });
  if (!changed) {
    return row;
  }
  const entries = row.entries.map((entry) => {
    if (entry.kind !== "tool-call") {
      return entry;
    }
    const nextCall = callsById.get(entry.call.id);
    return nextCall ? { ...entry, call: nextCall } : entry;
  });
  return { ...row, calls, entries };
}

function toolCallRawId(id: string): string {
  return id.startsWith("call:") ? id.slice("call:".length) : id;
}

function subAgentLane(
  ownerThreadId: string,
  sortedItems: readonly WorkspaceAgentActivityTimelineItem[],
  status: AgentTaskSubAgentStatus
): AgentTaskSubAgentVM {
  const latest = latestDisplayableActivity(sortedItems);
  const lastItem = sortedItems[sortedItems.length - 1];
  return {
    ownerThreadId,
    status,
    latestActivity: latest?.text ?? null,
    latestActivityKind: latest?.kind ?? null,
    startedAtUnixMs: timelineItemTime(sortedItems[0]) || null,
    latestActivityAtUnixMs: timelineItemTime(lastItem) || null
  };
}

function latestDisplayableActivity(
  sortedItems: readonly WorkspaceAgentActivityTimelineItem[]
): { text: string; kind: "message" | "reasoning" | "tool" } | null {
  for (let index = sortedItems.length - 1; index >= 0; index -= 1) {
    const item = sortedItems[index];
    if (!item) {
      continue;
    }
    if (isWorkspaceAgentToolCallItem(item)) {
      const name =
        firstString(item.name, stringValue(item.payload?.name)) ?? null;
      if (name) {
        return { text: name, kind: "tool" };
      }
      continue;
    }
    const text = snippet(timelineItemText(item));
    if (!text) {
      continue;
    }
    const itemType = item.itemType?.trim().toLowerCase() ?? "";
    const role = item.role?.trim().toLowerCase() ?? "";
    if (
      itemType === "message.assistant_thinking" ||
      role === "assistant_thinking"
    ) {
      return { text, kind: "reasoning" };
    }
    return { text, kind: "message" };
  }
  return null;
}

const SUB_AGENT_ACTIVITY_SNIPPET_LENGTH = 140;

function snippet(text: string): string {
  if (text.length <= SUB_AGENT_ACTIVITY_SNIPPET_LENGTH) {
    return text;
  }
  // Streamed assistant text grows at the tail; the trailing window is the
  // sub-agent's most current activity.
  return `…${text.slice(-SUB_AGENT_ACTIVITY_SNIPPET_LENGTH)}`;
}

function timelineItemText(item: WorkspaceAgentActivityTimelineItem): string {
  const text =
    stringValue(item.payload?.text) ??
    stringValue(item.payload?.content) ??
    stringValue(item.content) ??
    "";
  return text.replace(/\s+/g, " ").trim();
}

const COLLAB_CARD_TOOL_NAMES = new Set([
  "task",
  "subagent",
  "delegatetask",
  "delegateagent",
  "agent"
]);

function collectCollabCards(
  mainTimelineItems: readonly WorkspaceAgentActivityTimelineItem[]
): SubAgentCollabCard[] {
  const cardsByCallId = new Map<
    string,
    {
      callId: string;
      startedAtUnixMs: number;
      latestAtUnixMs: number;
      latestStatus: string | null;
      receiverThreadIds: Set<string>;
      outputStrings: Set<string>;
    }
  >();
  for (const item of mainTimelineItems) {
    if (!isWorkspaceAgentToolCallItem(item) || !isCollabCardItem(item)) {
      continue;
    }
    const callId = firstString(item.callId, stringValue(item.payload?.callId));
    if (!callId) {
      continue;
    }
    const time = timelineItemTime(item);
    const status = firstString(item.status, stringValue(item.payload?.status));
    const existing = cardsByCallId.get(callId);
    if (!existing) {
      cardsByCallId.set(callId, {
        callId,
        startedAtUnixMs: time,
        latestAtUnixMs: time,
        latestStatus: status ?? null,
        receiverThreadIds: collectReceiverThreadIds(item.payload?.input),
        outputStrings: collectStringValues(item.payload?.output)
      });
      continue;
    }
    existing.startedAtUnixMs = Math.min(existing.startedAtUnixMs, time);
    if (time >= existing.latestAtUnixMs) {
      existing.latestAtUnixMs = time;
      existing.latestStatus = status ?? existing.latestStatus;
    }
    for (const value of collectReceiverThreadIds(item.payload?.input)) {
      existing.receiverThreadIds.add(value);
    }
    for (const value of collectStringValues(item.payload?.output)) {
      existing.outputStrings.add(value);
    }
  }
  return [...cardsByCallId.values()]
    .map((card) => ({
      callId: card.callId,
      startedAtUnixMs: card.startedAtUnixMs,
      status: subAgentStatusFromCallStatus(card.latestStatus),
      receiverThreadIds: card.receiverThreadIds,
      outputStrings: card.outputStrings
    }))
    .sort((left, right) => left.startedAtUnixMs - right.startedAtUnixMs);
}

function isCollabCardItem(item: WorkspaceAgentActivityTimelineItem): boolean {
  const toolName = normalizeToolToken(resolveWorkspaceAgentToolName(item));
  return COLLAB_CARD_TOOL_NAMES.has(toolName);
}

function matchCardByTimeAffinity(
  cards: readonly SubAgentCollabCard[],
  laneStartedAtUnixMs: number
): SubAgentCollabCard | null {
  const startedBeforeLane = cards.filter(
    (card) => card.startedAtUnixMs <= laneStartedAtUnixMs
  );
  const candidates = startedBeforeLane.length > 0 ? startedBeforeLane : cards;
  const running = candidates.filter((card) => card.status === "running");
  const pool = running.length > 0 ? running : candidates;
  if (pool.length === 0) {
    return null;
  }
  if (startedBeforeLane.length > 0) {
    // Latest card that had already started when the lane began.
    return pool.reduce((latest, card) =>
      card.startedAtUnixMs >= latest.startedAtUnixMs ? card : latest
    );
  }
  // Ordering edge: the lane's rows arrived before any card. Attach to the
  // earliest candidate so the lane surfaces as soon as a card exists.
  return pool.reduce((earliest, card) =>
    card.startedAtUnixMs < earliest.startedAtUnixMs ? card : earliest
  );
}

function subAgentStatusFromCallStatus(
  status: string | null
): AgentTaskSubAgentStatus {
  switch ((status ?? "").trim().toLowerCase()) {
    case "completed":
    case "done":
    case "success":
    case "succeeded":
      return "completed";
    case "failed":
    case "error":
    case "errored":
    case "canceled":
      return "failed";
    default:
      return "running";
  }
}

function collectReceiverThreadIds(input: unknown): Set<string> {
  const out = new Set<string>();
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return out;
  }
  const raw = (input as Record<string, unknown>).receiverThreadIds;
  if (!Array.isArray(raw)) {
    return out;
  }
  for (const entry of raw) {
    const id = stringValue(entry);
    if (id) {
      out.add(id);
    }
  }
  return out;
}

function collectStringValues(value: unknown, depth = 0): Set<string> {
  const out = new Set<string>();
  collectStringValuesInto(value, depth, out);
  return out;
}

function collectStringValuesInto(
  value: unknown,
  depth: number,
  out: Set<string>
): void {
  if (depth > 5 || value == null) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      out.add(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStringValuesInto(entry, depth + 1, out);
    }
    return;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>
    )) {
      out.add(key);
      collectStringValuesInto(entry, depth + 1, out);
    }
  }
}

function timelineItemTime(
  item: WorkspaceAgentActivityTimelineItem | undefined
): number {
  return item?.occurredAtUnixMs ?? item?.createdAtUnixMs ?? 0;
}

function compareTimelineItemsAscending(
  left: WorkspaceAgentActivityTimelineItem,
  right: WorkspaceAgentActivityTimelineItem
): number {
  return (
    timelineItemTime(left) - timelineItemTime(right) ||
    (left.seq ?? 0) - (right.seq ?? 0) ||
    left.id - right.id
  );
}

function normalizeToolToken(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/[\s_-]+/g, "")
    .trim()
    .toLowerCase();
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstString(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    const resolved = stringValue(value);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
