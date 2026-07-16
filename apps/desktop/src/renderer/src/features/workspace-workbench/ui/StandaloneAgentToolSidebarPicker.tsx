import type { ReactNode } from "react";
import {
  Button,
  ChatIcon,
  FolderIcon,
  NavApplicationsLinedIcon,
  TaskIcon,
  TerminalLinedIcon,
  WebIcon
} from "@tutti-os/ui-system";
import type { StandaloneAgentToolPanelId } from "./standaloneAgentToolSidebarModel.ts";

interface StandaloneAgentToolSidebarPickerProps {
  labels: Record<StandaloneAgentToolPanelId, string>;
  onSelect: (panel: StandaloneAgentToolPanelId) => void;
}

const pickerItems = [
  { icon: FolderIcon, id: "files" },
  { icon: TerminalLinedIcon, id: "terminal" },
  { icon: WebIcon, id: "browser" },
  { icon: TaskIcon, id: "tasks" },
  { icon: NavApplicationsLinedIcon, id: "apps" },
  { icon: ChatIcon, id: "messages" }
] as const;

export function StandaloneAgentToolSidebarPicker({
  labels,
  onSelect
}: StandaloneAgentToolSidebarPickerProps): ReactNode {
  return (
    <div
      className="flex h-full min-h-0 items-center justify-center overflow-auto px-6 py-10"
      data-standalone-agent-tool-sidebar-picker="true"
    >
      <div className="flex w-full max-w-[340px] flex-col gap-2">
        {pickerItems.map(({ icon: Icon, id }) => (
          <Button
            className="h-12 w-full justify-start gap-2.5 rounded-lg border border-[var(--line-1)] bg-[var(--background-fronted)] px-2.5 text-left text-[14px] font-medium text-[var(--text-primary)] shadow-none hover:border-[var(--line-2)] hover:bg-[var(--transparency-hover)]"
            key={id}
            type="button"
            variant="ghost"
            onClick={() => onSelect(id)}
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-[7px] bg-[var(--transparency-block)] text-[var(--text-secondary)] group-hover/button:text-[var(--text-primary)]">
              <Icon aria-hidden className="size-4" />
            </span>
            <span>{labels[id]}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
