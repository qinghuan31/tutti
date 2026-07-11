import type { AgentMessageRowVM } from "./agentMessageRowVM";
import type { AgentProcessingRowVM } from "./agentProcessingRowVM";
import type { AgentToolGroupRowVM } from "./agentToolGroupRowVM";
import type { AgentTurnSummaryRowVM } from "./agentTurnSummaryRowVM";
import type { AgentTurnElapsedRowVM } from "./agentTurnElapsedRowVM";

export type AgentTranscriptRowVM =
  | AgentMessageRowVM
  | AgentToolGroupRowVM
  | AgentTurnSummaryRowVM
  | AgentProcessingRowVM
  | AgentTurnElapsedRowVM;
