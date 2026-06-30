import type { AgentGUIQueuedPromptVM } from "./agent-gui/agentGuiNode/model/agentGuiNodeTypes";
import type { AgentPromptContentBlock } from "./shared/contracts/dto";

export interface AgentQueuedPromptRetryBlock {
  queuedPromptId: string;
  sessionStateUpdatedAtUnixMs: number | null;
  conversationUpdatedAtUnixMs: number | null;
}

export interface AgentQueuedPromptClaim {
  agentSessionId: string;
  claimId: string;
  ownerId: string;
  promptId: string;
  leasedUntilUnixMs: number;
  workspaceId: string;
}

export interface AgentQueuedPromptQueueSnapshot {
  agentSessionId: string;
  claim: AgentQueuedPromptClaim | null;
  failedPromptId: string | null;
  prompts: readonly AgentGUIQueuedPromptVM[];
  retryBlock: AgentQueuedPromptRetryBlock | null;
  sendNextPromptId: string | null;
  workspaceId: string;
}

export interface AgentQueuedPromptSnapshot {
  queuesByKey: Readonly<Record<string, AgentQueuedPromptQueueSnapshot>>;
  version: number;
}

export interface AgentQueuedPromptClaimResult {
  claim: AgentQueuedPromptClaim;
  prompt: AgentGUIQueuedPromptVM;
}

export interface AgentQueuedPromptRuntime {
  claimNextToDrain(input: {
    agentSessionId: string;
    leaseMs?: number;
    ownerId: string;
    workspaceId: string;
  }): AgentQueuedPromptClaimResult | null;
  cleanupSession(input: { agentSessionId: string; workspaceId: string }): void;
  completeClaim(input: {
    agentSessionId: string;
    claimId: string;
    ownerId: string;
    workspaceId: string;
  }): boolean;
  enqueue(input: {
    prompt: AgentGUIQueuedPromptVM;
    agentSessionId: string;
    workspaceId: string;
  }): void;
  getSessionSnapshot(input: {
    agentSessionId: string;
    workspaceId: string;
  }): AgentQueuedPromptQueueSnapshot;
  getSnapshot(): AgentQueuedPromptSnapshot;
  markPromptFailed(input: {
    agentSessionId: string;
    promptId: string;
    workspaceId: string;
  }): void;
  promotePrompt(input: {
    agentSessionId: string;
    promptId: string;
    workspaceId: string;
  }): void;
  releaseClaim(input: {
    agentSessionId: string;
    claimId: string;
    ownerId: string;
    workspaceId: string;
  }): boolean;
  releaseOwner(ownerId: string): void;
  removePrompt(input: {
    agentSessionId: string;
    promptId: string;
    workspaceId: string;
  }): AgentGUIQueuedPromptVM | null;
  setRetryBlock(input: {
    agentSessionId: string;
    retryBlock: AgentQueuedPromptRetryBlock | null;
    workspaceId: string;
  }): void;
  subscribe(listener: () => void): () => void;
}

const DEFAULT_CLAIM_LEASE_MS = 30_000;

export const EMPTY_AGENT_QUEUED_PROMPT_SNAPSHOT: AgentQueuedPromptSnapshot =
  Object.freeze({
    queuesByKey: Object.freeze({}),
    version: 0
  });

export function createAgentQueuedPromptRuntime(): AgentQueuedPromptRuntime {
  let snapshot = EMPTY_AGENT_QUEUED_PROMPT_SNAPSHOT;
  const emptyQueuesByKey = new Map<string, AgentQueuedPromptQueueSnapshot>();
  const listeners = new Set<() => void>();

  const notify = (): void => {
    for (const listener of [...listeners]) {
      listener();
    }
  };

  const updateQueue = (
    workspaceId: string,
    agentSessionId: string,
    updater: (
      queue: AgentQueuedPromptQueueSnapshot
    ) => AgentQueuedPromptQueueSnapshot | null
  ): void => {
    const key = queueKey(workspaceId, agentSessionId);
    const current =
      snapshot.queuesByKey[key] ??
      getEmptyQueueSnapshot(emptyQueuesByKey, { workspaceId, agentSessionId });
    const nextQueue = updater(withExpiredClaimReleased(current));
    if (nextQueue === current) {
      return;
    }
    const nextQueuesByKey: Record<string, AgentQueuedPromptQueueSnapshot> = {
      ...snapshot.queuesByKey
    };
    if (nextQueue === null || isEmptyQueue(nextQueue)) {
      delete nextQueuesByKey[key];
    } else {
      nextQueuesByKey[key] = freezeQueue(nextQueue);
    }
    snapshot = Object.freeze({
      queuesByKey: Object.freeze(nextQueuesByKey),
      version: snapshot.version + 1
    });
    notify();
  };

  return {
    claimNextToDrain(input) {
      const workspaceId = input.workspaceId.trim();
      const agentSessionId = input.agentSessionId.trim();
      const ownerId = input.ownerId.trim();
      if (!workspaceId || !agentSessionId || !ownerId) {
        return null;
      }
      const current = withExpiredClaimReleased(
        snapshot.queuesByKey[queueKey(workspaceId, agentSessionId)] ??
          getEmptyQueueSnapshot(emptyQueuesByKey, {
            workspaceId,
            agentSessionId
          })
      );
      if (current.claim || current.prompts.length === 0) {
        return null;
      }
      const prompt = current.prompts[0]!;
      const claim: AgentQueuedPromptClaim = Object.freeze({
        workspaceId,
        agentSessionId,
        ownerId,
        promptId: prompt.id,
        claimId: `claim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        leasedUntilUnixMs:
          Date.now() + Math.max(1, input.leaseMs ?? DEFAULT_CLAIM_LEASE_MS)
      });
      updateQueue(workspaceId, agentSessionId, (queue) => ({
        ...queue,
        claim
      }));
      return { claim, prompt };
    },
    cleanupSession(input) {
      const workspaceId = input.workspaceId.trim();
      const agentSessionId = input.agentSessionId.trim();
      if (!workspaceId || !agentSessionId) {
        return;
      }
      updateQueue(workspaceId, agentSessionId, () => null);
    },
    completeClaim(input) {
      let completed = false;
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => {
        if (!claimMatches(queue.claim, input)) {
          return queue;
        }
        completed = true;
        const promptId = queue.claim.promptId;
        return {
          ...queue,
          claim: null,
          failedPromptId:
            queue.failedPromptId === promptId ? null : queue.failedPromptId,
          prompts: Object.freeze(
            queue.prompts.filter((prompt) => prompt.id !== promptId)
          ),
          retryBlock:
            queue.retryBlock?.queuedPromptId === promptId
              ? null
              : queue.retryBlock,
          sendNextPromptId:
            queue.sendNextPromptId === promptId ? null : queue.sendNextPromptId
        };
      });
      return completed;
    },
    enqueue(input) {
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => ({
        ...queue,
        prompts: Object.freeze([...queue.prompts, freezePrompt(input.prompt)])
      }));
    },
    getSessionSnapshot(input) {
      const workspaceId = input.workspaceId.trim();
      const agentSessionId = input.agentSessionId.trim();
      const key = queueKey(workspaceId, agentSessionId);
      const current =
        snapshot.queuesByKey[key] ??
        getEmptyQueueSnapshot(emptyQueuesByKey, {
          workspaceId,
          agentSessionId
        });
      const next = withExpiredClaimReleased(current);
      if (next !== current) {
        updateQueue(workspaceId, agentSessionId, () => next);
      }
      return snapshot.queuesByKey[key] ?? next;
    },
    getSnapshot() {
      return snapshot;
    },
    markPromptFailed(input) {
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => ({
        ...queue,
        failedPromptId: input.promptId.trim() || queue.failedPromptId
      }));
    },
    promotePrompt(input) {
      const promptId = input.promptId.trim();
      if (!promptId) {
        return;
      }
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => {
        const index = queue.prompts.findIndex(
          (prompt) => prompt.id === promptId
        );
        if (index < 0) {
          return queue;
        }
        const prompts = [...queue.prompts];
        if (index > 0) {
          const [selected] = prompts.splice(index, 1);
          prompts.unshift(selected!);
        }
        return {
          ...queue,
          failedPromptId:
            queue.failedPromptId === promptId ? null : queue.failedPromptId,
          prompts: Object.freeze(prompts),
          retryBlock:
            queue.retryBlock?.queuedPromptId === promptId
              ? null
              : queue.retryBlock,
          sendNextPromptId: promptId
        };
      });
    },
    releaseClaim(input) {
      let released = false;
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => {
        if (!claimMatches(queue.claim, input)) {
          return queue;
        }
        released = true;
        return { ...queue, claim: null };
      });
      return released;
    },
    releaseOwner(ownerId) {
      const normalizedOwnerId = ownerId.trim();
      if (!normalizedOwnerId) {
        return;
      }
      for (const queue of Object.values(snapshot.queuesByKey)) {
        if (queue.claim?.ownerId === normalizedOwnerId) {
          updateQueue(queue.workspaceId, queue.agentSessionId, (current) => ({
            ...current,
            claim:
              current.claim?.ownerId === normalizedOwnerId
                ? null
                : current.claim
          }));
        }
      }
    },
    removePrompt(input) {
      const promptId = input.promptId.trim();
      if (!promptId) {
        return null;
      }
      let removed: AgentGUIQueuedPromptVM | null = null;
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => {
        removed =
          queue.prompts.find((prompt) => prompt.id === promptId) ?? null;
        if (!removed) {
          return queue;
        }
        return {
          ...queue,
          claim: queue.claim?.promptId === promptId ? null : queue.claim,
          failedPromptId:
            queue.failedPromptId === promptId ? null : queue.failedPromptId,
          prompts: Object.freeze(
            queue.prompts.filter((prompt) => prompt.id !== promptId)
          ),
          retryBlock:
            queue.retryBlock?.queuedPromptId === promptId
              ? null
              : queue.retryBlock,
          sendNextPromptId:
            queue.sendNextPromptId === promptId ? null : queue.sendNextPromptId
        };
      });
      return removed;
    },
    setRetryBlock(input) {
      updateQueue(input.workspaceId, input.agentSessionId, (queue) => ({
        ...queue,
        retryBlock: input.retryBlock
          ? Object.freeze({ ...input.retryBlock })
          : null
      }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

function queueKey(workspaceId: string, agentSessionId: string): string {
  return `${workspaceId.trim()}\0${agentSessionId.trim()}`;
}

function emptyQueueSnapshot(input: {
  workspaceId: string;
  agentSessionId: string;
}): AgentQueuedPromptQueueSnapshot {
  return freezeQueue({
    workspaceId: input.workspaceId,
    agentSessionId: input.agentSessionId,
    claim: null,
    failedPromptId: null,
    prompts: Object.freeze([]),
    retryBlock: null,
    sendNextPromptId: null
  });
}

function getEmptyQueueSnapshot(
  cache: Map<string, AgentQueuedPromptQueueSnapshot>,
  input: {
    workspaceId: string;
    agentSessionId: string;
  }
): AgentQueuedPromptQueueSnapshot {
  const key = queueKey(input.workspaceId, input.agentSessionId);
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const next = emptyQueueSnapshot(input);
  cache.set(key, next);
  return next;
}

function freezePrompt(prompt: AgentGUIQueuedPromptVM): AgentGUIQueuedPromptVM {
  return Object.freeze({
    ...prompt,
    content: Object.freeze([
      ...prompt.content
    ]) as unknown as AgentPromptContentBlock[]
  });
}

function freezeQueue(
  queue: AgentQueuedPromptQueueSnapshot
): AgentQueuedPromptQueueSnapshot {
  return Object.freeze({
    ...queue,
    claim: queue.claim ? Object.freeze({ ...queue.claim }) : null,
    prompts: Object.freeze(queue.prompts.map(freezePrompt)),
    retryBlock: queue.retryBlock ? Object.freeze({ ...queue.retryBlock }) : null
  });
}

function withExpiredClaimReleased(
  queue: AgentQueuedPromptQueueSnapshot
): AgentQueuedPromptQueueSnapshot {
  if (!queue.claim || queue.claim.leasedUntilUnixMs > Date.now()) {
    return queue;
  }
  return freezeQueue({ ...queue, claim: null });
}

function isEmptyQueue(queue: AgentQueuedPromptQueueSnapshot): boolean {
  return (
    queue.prompts.length === 0 &&
    queue.claim === null &&
    queue.failedPromptId === null &&
    queue.retryBlock === null &&
    queue.sendNextPromptId === null
  );
}

function claimMatches(
  claim: AgentQueuedPromptClaim | null,
  input: {
    agentSessionId: string;
    claimId: string;
    ownerId: string;
    workspaceId: string;
  }
): claim is AgentQueuedPromptClaim {
  return (
    claim !== null &&
    claim.workspaceId === input.workspaceId.trim() &&
    claim.agentSessionId === input.agentSessionId.trim() &&
    claim.ownerId === input.ownerId.trim() &&
    claim.claimId === input.claimId.trim()
  );
}
