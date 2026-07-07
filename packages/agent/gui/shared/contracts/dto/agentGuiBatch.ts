import type {
  AgentHostAgentSessionComposerSettings,
  AgentHostAgentSessionProvider
} from "./agentSession";

export type AgentGuiBatchRunnerProvider = Extract<
  AgentHostAgentSessionProvider,
  "claude-code" | "codex" | "tutti-agent" | "hermes" | "nexight" | "openclaw"
>;

export interface AgentGuiBatchPromptCase {
  id: string;
  line: number;
  prompt: string;
  title?: string | null;
  settings?: AgentHostAgentSessionComposerSettings | null;
}

export type AgentGuiBatchRunCaseStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "blocked"
  | "error";

export interface AgentGuiBatchRunCaseResult {
  id: string;
  line: number;
  title?: string | null;
  prompt: string;
  status: AgentGuiBatchRunCaseStatus;
  provider: AgentGuiBatchRunnerProvider;
  agentSessionId?: string | null;
  providerSessionId?: string | null;
  turnId?: string | null;
  startedAtUnixMs?: number | null;
  completedAtUnixMs?: number | null;
  durationMs?: number | null;
  error?: string | null;
}

export interface AgentGuiBatchRunExportInput {
  batchId: string;
  workspaceId: string;
  workspacePath?: string | null;
  providers: AgentGuiBatchRunnerProvider[];
  sourceFileName?: string | null;
  sourceFilePath?: string | null;
  startedAtUnixMs?: number | null;
  completedAtUnixMs?: number | null;
  cases: AgentGuiBatchRunCaseResult[];
}

export interface AgentGuiBatchRunExportResult {
  canceled?: boolean;
  filePath: string | null;
  fileCount: number;
  artifactCount: number;
}
