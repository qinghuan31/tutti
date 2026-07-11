export interface AgentProcessingRowVM {
  kind: "processing";
  id: string;
  turnId: string | null;
  label?: string | null;
  occurredAtUnixMs: number | null;
  startedAtUnixMs?: number | null;
  completedAtUnixMs?: number | null;
  live?: boolean;
}
