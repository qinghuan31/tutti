import { describe, expect, it } from "vitest";
import type { AgentActivityInteraction } from "@tutti-os/agent-activity-core";
import { resolveAgentGUIInteractionTarget } from "./agentGuiController.interactionHelpers";

describe("resolveAgentGUIInteractionTarget", () => {
  it("keeps the canonical child session and turn tuple", () => {
    const interactions = [
      {
        agentSessionId: "root",
        requestId: "approval-1",
        turnId: "root-turn"
      },
      {
        agentSessionId: "child-1",
        requestId: "approval-1",
        turnId: "child-turn-1"
      }
    ] as AgentActivityInteraction[];

    expect(
      resolveAgentGUIInteractionTarget(interactions, "approval-1")
    ).toEqual({
      agentSessionId: "child-1",
      turnId: "child-turn-1"
    });
  });

  it("does not fall back to the active root session for an unknown request", () => {
    expect(resolveAgentGUIInteractionTarget([], "missing")).toBeNull();
  });
});
