import { useMemo, type JSX } from "react";
import type { AgentProcessingRowVM } from "../contracts/agentProcessingRowVM";
import type { AgentTurnElapsedRowVM } from "../contracts/agentTurnElapsedRowVM";
import { useElapsedSeconds } from "../lib/elapsedClock";

export function AgentProcessingRow({
  row,
  label,
  elapsedLabel,
  completedElapsedLabel
}: {
  row: AgentProcessingRowVM | AgentTurnElapsedRowVM;
  label: string;
  elapsedLabel: (elapsedSeconds: number) => string;
  completedElapsedLabel: (elapsedSeconds: number) => string;
}): JSX.Element {
  const elapsedSeconds = useElapsedSeconds(
    row.startedAtUnixMs ?? null,
    row.completedAtUnixMs ?? null,
    isLiveProcessingRow(row)
  );
  const elapsedText = useMemo(() => {
    if (elapsedSeconds === null) {
      return null;
    }
    return isLiveProcessingRow(row)
      ? elapsedLabel(elapsedSeconds)
      : completedElapsedLabel(elapsedSeconds);
  }, [completedElapsedLabel, elapsedLabel, elapsedSeconds, row]);

  return (
    <div
      data-row-id={row.id}
      className="workspace-agents-status-panel__detail-processing inline-flex items-center gap-1.5"
    >
      <span className="inline-flex min-w-0 items-center gap-1 font-semibold">
        {elapsedText ? (
          <span
            className="font-normal text-[var(--text-muted,var(--tutti-text-muted))]"
            data-testid="agent-processing-elapsed"
          >
            {elapsedText}
          </span>
        ) : (
          <span>{processingLabel(row, label)}</span>
        )}
        {isLiveProcessingRow(row) ? <LoadingEllipsis /> : null}
      </span>
    </div>
  );
}

function isLiveProcessingRow(
  row: AgentProcessingRowVM | AgentTurnElapsedRowVM
): boolean {
  return row.kind === "processing" && row.live === true;
}

function processingLabel(
  row: AgentProcessingRowVM | AgentTurnElapsedRowVM,
  fallback: string
): string {
  if ("label" in row && row.label?.trim()) {
    return row.label.trim();
  }
  return fallback;
}

function LoadingEllipsis(): JSX.Element {
  "use memo";
  return (
    <span
      className="tsh-inline-loading-ellipsis tsh-inline-loading-ellipsis--entry-timing"
      aria-hidden="true"
    >
      <span />
      <span />
      <span />
    </span>
  );
}
