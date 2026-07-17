import type { ReactNode } from "react";
import { cn } from "@tutti-os/ui-system";
import type { WorkspaceAgentStatusPetMood } from "../services/workspaceAgentStatusPetMood";

const workspaceAgentStatusPetSources = {
  failed: new URL(
    "../../../assets/agent-status-pet/failed.gif",
    import.meta.url
  ).href,
  idle: new URL("../../../assets/agent-status-pet/idle.gif", import.meta.url)
    .href,
  review: new URL(
    "../../../assets/agent-status-pet/review.gif",
    import.meta.url
  ).href,
  running: new URL(
    "../../../assets/agent-status-pet/running.gif",
    import.meta.url
  ).href,
  waiting: new URL(
    "../../../assets/agent-status-pet/waiting.gif",
    import.meta.url
  ).href
} as const satisfies Record<WorkspaceAgentStatusPetMood, string>;

export function WorkspaceAgentStatusPetIcon({
  className,
  imageClassName,
  mood
}: {
  className?: string;
  imageClassName?: string;
  mood: WorkspaceAgentStatusPetMood;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative -my-1 grid size-7 shrink-0 place-items-center overflow-visible",
        className
      )}
      data-agent-status-pet-mood={mood}
    >
      <img
        alt=""
        className={cn("size-7 object-contain", imageClassName)}
        draggable={false}
        src={workspaceAgentStatusPetSources[mood]}
      />
    </span>
  );
}
