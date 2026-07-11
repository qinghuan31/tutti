import assert from "node:assert/strict";
import test from "node:test";
import type { AgentGUIAgent } from "@tutti-os/agent-gui";
import { filterWorkspaceAgentGuiAgents } from "./workspaceAgentGuiAgentFilter.ts";

const targets = [
  createTarget("codex"),
  createTarget("tutti-agent"),
  createTarget("claude-code")
];

test("filterWorkspaceAgentGuiAgents removes Tutti Agent new-entry targets when the switch is off", () => {
  const filtered = filterWorkspaceAgentGuiAgents(targets, {
    tuttiAgentSwitchEnabled: false
  });

  assert.deepEqual(
    filtered.map((target) => target.provider),
    ["codex", "claude-code"]
  );
});

test("filterWorkspaceAgentGuiAgents keeps Tutti Agent new-entry targets when the switch is on", () => {
  const filtered = filterWorkspaceAgentGuiAgents(targets, {
    tuttiAgentSwitchEnabled: true
  });

  assert.deepEqual(
    filtered.map((target) => target.provider),
    ["codex", "tutti-agent", "claude-code"]
  );
});

function createTarget(provider: AgentGUIAgent["provider"]): AgentGUIAgent {
  return {
    agentTargetId: `local:${provider}`,
    availability: { status: "ready" },
    iconUrl: `app://icons/${provider}.png`,
    name: provider,
    provider
  };
}
