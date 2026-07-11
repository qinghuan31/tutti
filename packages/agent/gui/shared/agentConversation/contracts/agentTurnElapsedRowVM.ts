export interface AgentTurnElapsedRowVM {
  kind: "turn-elapsed";
  id: string;
  turnId: string;
  occurredAtUnixMs: number | null;
  startedAtUnixMs: number;
  completedAtUnixMs: number;
}
