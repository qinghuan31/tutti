import { describe, expect, it } from "vitest";
import { normalizeAgentGUIAgents } from "./agents";
import type { AgentGUIAgent } from "./types";

function createAgent(
  agentTargetId: string,
  overrides: Partial<AgentGUIAgent> = {}
): AgentGUIAgent {
  return {
    agentTargetId,
    name: agentTargetId,
    iconUrl: `app://agents/${agentTargetId}.png`,
    availability: { status: "ready" },
    provider: "codex",
    ...overrides
  };
}

describe("normalizeAgentGUIAgents", () => {
  it("preserves host order and keeps agents that share a provider distinct", () => {
    const agents = normalizeAgentGUIAgents([
      createAgent("alice-codex", { name: "Alice's Codex" }),
      createAgent("bob-codex", { name: "Bob's Codex" })
    ]);

    expect(agents.map((agent) => agent.agentTargetId)).toEqual([
      "alice-codex",
      "bob-codex"
    ]);
    expect(agents.map((agent) => agent.provider)).toEqual(["codex", "codex"]);
  });

  it("drops invalid and duplicate identities while normalizing presentation", () => {
    const agents = normalizeAgentGUIAgents([
      createAgent(" alice ", {
        name: " Alice ",
        iconUrl: " app://agents/alice.png ",
        description: " Shared agent ",
        owner: { name: " Owner ", avatarUrl: " app://owner.png " },
        availability: { status: "unavailable", reason: " Offline " }
      }),
      createAgent("alice"),
      createAgent("", { name: "Missing identity" }),
      createAgent("missing-name", { name: " " }),
      createAgent("missing-icon", { iconUrl: " " })
    ]);

    expect(agents).toEqual([
      {
        agentTargetId: "alice",
        name: "Alice",
        iconUrl: "app://agents/alice.png",
        description: "Shared agent",
        owner: { name: "Owner", avatarUrl: "app://owner.png" },
        availability: { status: "unavailable", reason: "Offline" },
        provider: "codex"
      }
    ]);
  });
});
