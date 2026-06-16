import type { AgentSessionCommand } from "../../../shared/agentSessionTypes";
import {
  draftForSlashCommand,
  mergeSlashCommands,
  parseSlashCommandInvocation,
  promptForSlashCommand
} from "./agentSlashCommands";

export type AgentSlashCommandProvider = "codex" | "claude-code" | string;

export type SlashCommandSelectionEffect =
  | {
      kind: "fillDraft";
      draft: string;
    }
  | {
      kind: "submitPrompt";
      prompt: string;
    }
  | {
      kind: "showStatus";
    }
  | {
      kind: "togglePlanMode";
    }
  | {
      kind: "showReviewPicker";
    }
  | {
      kind: "toggleSpeed";
    }
  | {
      kind: "blockCommand";
    };

interface ResolveSlashCommandSelectionEffectInput {
  provider: AgentSlashCommandProvider;
  command: AgentSessionCommand;
  currentDraft: string;
}

interface ResolveSlashCommandSubmitEffectInput {
  provider: AgentSlashCommandProvider;
  commands: readonly AgentSessionCommand[];
  draft: string;
}

interface ProviderSlashPolicy {
  /** Commands submitted immediately on selection instead of filling a draft. */
  immediateCommands: ReadonlySet<string>;
  /** Commands surfaced when the agent advertises none of its own. */
  fallbackCommands: readonly AgentSessionCommand[];
}

const REVIEW_COMMAND = "review";
// `compact` is locally handled and submitted immediately for every provider.
const UNIVERSAL_IMMEDIATE_COMMANDS = new Set(["compact"]);
// Commands blocked or handled locally across the ACP providers below.
const ACP_BLOCKED_COMMANDS = new Set(["plan"]);
const ACP_LOCAL_STATUS_COMMANDS = new Set(["status"]);
// `/fast` toggles the orthogonal speed dimension locally rather than reaching
// the agent as a prompt; supported for codex and claude-code.
const ACP_LOCAL_TOGGLE_SPEED_COMMANDS = new Set(["fast"]);
const ACP_FALLBACK_COMMANDS: readonly AgentSessionCommand[] = [
  { name: "compact" },
  { name: "status" },
  { name: "fast" }
];

const PROVIDER_SLASH_POLICY: Record<
  "codex" | "claude-code",
  ProviderSlashPolicy
> = {
  codex: {
    immediateCommands: new Set(["init", "compact"]),
    fallbackCommands: ACP_FALLBACK_COMMANDS
  },
  "claude-code": {
    immediateCommands: new Set(["compact", "context", "usage"]),
    fallbackCommands: ACP_FALLBACK_COMMANDS
  }
};

function providerSlashPolicy(
  provider: AgentSlashCommandProvider
): ProviderSlashPolicy | undefined {
  return provider === "codex" || provider === "claude-code"
    ? PROVIDER_SLASH_POLICY[provider]
    : undefined;
}

function isACPProvider(provider: AgentSlashCommandProvider): boolean {
  return provider === "codex" || provider === "claude-code";
}

export function resolveSlashCommandsForProvider({
  provider,
  commands,
  hasCompactableContext = true,
  compactSupported
}: {
  provider: AgentSlashCommandProvider;
  commands: readonly AgentSessionCommand[];
  hasCompactableContext?: boolean;
  /**
   * Negotiated `compact` capability. `false` drops the command entirely
   * (including provider fallbacks); `undefined`/`null` means unknown and
   * keeps the legacy `hasCompactableContext` behavior.
   */
  compactSupported?: boolean | null;
}): AgentSessionCommand[] {
  return mergeSlashCommands(
    filterUnavailableSlashCommands(commands, {
      compactSupported,
      hasCompactableContext,
      provider
    }),
    filterUnavailableSlashCommands(fallbackCommandsForProvider(provider), {
      compactSupported,
      hasCompactableContext,
      provider
    })
  );
}

export function resolveSlashCommandSelectionEffect({
  provider,
  command,
  currentDraft
}: ResolveSlashCommandSelectionEffectInput): SlashCommandSelectionEffect {
  const commandName = normalizedCommandName(command);
  if (isBlockedSlashCommand(provider, commandName)) {
    return { kind: "blockCommand" };
  }
  if (isLocalToggleSpeedCommand(provider, commandName)) {
    return { kind: "toggleSpeed" };
  }
  if (isLocalStatusCommand(provider, commandName)) {
    return { kind: "showStatus" };
  }
  // Picking codex `/review` from the palette never carries args (the palette
  // closes once a space is typed), so always open the target picker.
  if (isReviewPickerCommand(provider, commandName)) {
    return { kind: "showReviewPicker" };
  }
  if (isImmediateCommand(provider, commandName)) {
    return {
      kind: "submitPrompt",
      prompt: promptForSlashCommand(command)
    };
  }
  return {
    kind: "fillDraft",
    draft: draftForSlashCommand(command, currentDraft)
  };
}

export function resolveSlashCommandSubmitEffect({
  provider,
  commands,
  draft
}: ResolveSlashCommandSubmitEffectInput): SlashCommandSelectionEffect | null {
  const invocation = parseSlashCommandInvocation(draft);
  if (!invocation) {
    return null;
  }
  if (isBlockedSlashCommand(provider, invocation.commandName)) {
    return { kind: "blockCommand" };
  }
  const command = commands.find(
    (candidate) =>
      candidate.name.trim().toLowerCase() ===
      invocation.commandName.toLowerCase()
  );
  if (!command) {
    return null;
  }
  const commandName = normalizedCommandName(command);
  if (isLocalToggleSpeedCommand(provider, commandName)) {
    return { kind: "toggleSpeed" };
  }
  if (isLocalStatusCommand(provider, commandName)) {
    return { kind: "showStatus" };
  }
  // Bare `/review` opens the target picker; `/review <text>` keeps the legacy
  // behavior of submitting the text straight through as a custom review.
  if (isReviewPickerCommand(provider, commandName)) {
    return invocation.args.trim() === "" ? { kind: "showReviewPicker" } : null;
  }
  if (isImmediateCommand(provider, commandName)) {
    return {
      kind: "submitPrompt",
      prompt: invocation.normalizedPrompt
    };
  }
  return null;
}

function isBlockedSlashCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  return (
    isACPProvider(provider) &&
    ACP_BLOCKED_COMMANDS.has(commandName.trim().toLowerCase())
  );
}

function isReviewPickerCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  return provider === "codex" && commandName === REVIEW_COMMAND;
}

function fallbackCommandsForProvider(
  provider: AgentSlashCommandProvider
): readonly AgentSessionCommand[] {
  return providerSlashPolicy(provider)?.fallbackCommands ?? [];
}

function isLocalStatusCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  return isACPProvider(provider) && ACP_LOCAL_STATUS_COMMANDS.has(commandName);
}

function isLocalToggleSpeedCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  return (
    isACPProvider(provider) && ACP_LOCAL_TOGGLE_SPEED_COMMANDS.has(commandName)
  );
}

function isImmediateCommand(
  provider: AgentSlashCommandProvider,
  commandName: string
): boolean {
  if (UNIVERSAL_IMMEDIATE_COMMANDS.has(commandName)) {
    return true;
  }
  return (
    providerSlashPolicy(provider)?.immediateCommands.has(commandName) ?? false
  );
}

function normalizedCommandName(command: AgentSessionCommand): string {
  return command.name.trim().toLowerCase();
}

function filterUnavailableSlashCommands(
  commands: readonly AgentSessionCommand[],
  input: {
    compactSupported?: boolean | null;
    hasCompactableContext: boolean;
    provider: AgentSlashCommandProvider;
  }
): AgentSessionCommand[] {
  return commands.filter((command) => {
    const commandName = normalizedCommandName(command);
    if (
      isACPProvider(input.provider) &&
      ACP_BLOCKED_COMMANDS.has(commandName)
    ) {
      return false;
    }
    if (commandName === "compact") {
      if (input.compactSupported === false) {
        return false;
      }
      return input.hasCompactableContext;
    }
    return true;
  });
}
