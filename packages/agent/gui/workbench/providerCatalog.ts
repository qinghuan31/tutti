import type { AgentGuiWorkbenchProvider } from "./types.ts";

export const agentGuiWorkbenchProviders = [
  "claude-code",
  "codex",
  "cursor",
  "nexight",
  "hermes",
  "gemini",
  "openclaw"
] as const satisfies readonly AgentGuiWorkbenchProvider[];

export const agentGuiWorkbenchDefaultDockProviders = [
  "codex",
  "claude-code"
] as const satisfies readonly AgentGuiWorkbenchProvider[];

export const agentGuiWorkbenchDockSuppressedProviders = [
  "hermes",
  "gemini"
] as const satisfies readonly AgentGuiWorkbenchProvider[];

export const agentGuiWorkbenchComingSoonProviders = [
  "nexight"
] as const satisfies readonly AgentGuiWorkbenchProvider[];

const defaultDockProviderSet = new Set<AgentGuiWorkbenchProvider>(
  agentGuiWorkbenchDefaultDockProviders
);
const dockSuppressedProviderSet = new Set<AgentGuiWorkbenchProvider>(
  agentGuiWorkbenchDockSuppressedProviders
);
const comingSoonProviderSet = new Set<AgentGuiWorkbenchProvider>(
  agentGuiWorkbenchComingSoonProviders
);

// i18n-check-ignore: provider brand names.
export const agentGuiWorkbenchProviderLabels: Record<
  AgentGuiWorkbenchProvider,
  string
> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
  gemini: "Gemini CLI",
  hermes: "Hermes Agent",
  nexight: "Nexight",
  openclaw: "OpenClaw"
};

export function resolveAgentGuiWorkbenchProviderLabel(
  provider: AgentGuiWorkbenchProvider
): string {
  return agentGuiWorkbenchProviderLabels[provider];
}

export function isAgentGuiWorkbenchDefaultDockProvider(
  provider: AgentGuiWorkbenchProvider
): boolean {
  return defaultDockProviderSet.has(provider);
}

export function isAgentGuiWorkbenchDockSuppressedProvider(
  provider: AgentGuiWorkbenchProvider
): boolean {
  return dockSuppressedProviderSet.has(provider);
}

export function isAgentGuiWorkbenchComingSoonProvider(
  provider: AgentGuiWorkbenchProvider
): boolean {
  return comingSoonProviderSet.has(provider);
}

export function isAgentGuiWorkbenchProvider(
  value: unknown
): value is AgentGuiWorkbenchProvider {
  return (
    typeof value === "string" &&
    agentGuiWorkbenchProviders.includes(value as AgentGuiWorkbenchProvider)
  );
}

export function normalizeAgentGuiWorkbenchProvider(
  value: unknown,
  fallbackProvider: AgentGuiWorkbenchProvider = "codex"
): AgentGuiWorkbenchProvider {
  return isAgentGuiWorkbenchProvider(value) ? value : fallbackProvider;
}
