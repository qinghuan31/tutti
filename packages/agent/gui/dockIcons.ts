import {
  antigravityRoundedUrl,
  codexRoundedUrl,
  cursorRoundedUrl,
  geminiRoundedUrl,
  hermesRoundedUrl,
  manageAgentClaudeCodeUrl,
  manageAgentTuttiUrl,
  openclawRoundedUrl
} from "./managedAgentIconAssets.ts";

export const agentGuiDockIconUrl = codexRoundedUrl;

export const agentGuiDockIconUrls = {
  "claude-code": manageAgentClaudeCodeUrl,
  antigravity: antigravityRoundedUrl,
  codex: codexRoundedUrl,
  cursor: cursorRoundedUrl,
  gemini: geminiRoundedUrl,
  hermes: hermesRoundedUrl,
  nexight: manageAgentTuttiUrl,
  openclaw: openclawRoundedUrl
} as const;
