import type { AgentProvider } from "./agentSettings";

export const AGENT_PROVIDER_LABEL: Record<AgentProvider, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  nexight: "Nexight",
  opencode: "OpenCode",
  gemini: "Gemini CLI",
  openclaw: "OpenClaw",
  hermes: "Hermes Agent"
};

export interface AgentProviderCapabilities {
  runtimeObservation: "jsonl" | "provider-api" | "none";
  experimental: boolean;
}

export const AGENT_PROVIDER_CAPABILITIES: Record<
  AgentProvider,
  AgentProviderCapabilities
> = {
  "claude-code": {
    runtimeObservation: "jsonl",
    experimental: false
  },
  codex: {
    runtimeObservation: "jsonl",
    experimental: false
  },
  cursor: {
    runtimeObservation: "jsonl",
    experimental: false
  },
  nexight: {
    runtimeObservation: "jsonl",
    experimental: false
  },
  opencode: {
    runtimeObservation: "provider-api",
    experimental: false
  },
  gemini: {
    runtimeObservation: "none",
    experimental: false
  },
  openclaw: {
    runtimeObservation: "jsonl",
    experimental: false
  },
  hermes: {
    runtimeObservation: "jsonl",
    experimental: false
  }
};
