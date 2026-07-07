import {
  codexRoundedUrl,
  cursorRoundedUrl,
  geminiRoundedUrl,
  hermesRoundedUrl,
  manageAgentClaudeCodeUrl,
  manageAgentTuttiUrl,
  openclawRoundedUrl,
  tuttiAgentRoundedUrl
} from "./managedAgentIconAssets.ts";

export const agentGuiDockIconUrl = codexRoundedUrl;

export const agentGuiDockIconUrls = {
  "claude-code": manageAgentClaudeCodeUrl,
  codex: codexRoundedUrl,
  cursor: cursorRoundedUrl,
  gemini: geminiRoundedUrl,
  hermes: hermesRoundedUrl,
  nexight: manageAgentTuttiUrl,
  openclaw: openclawRoundedUrl,
  "tutti-agent": tuttiAgentRoundedUrl
} as const;
