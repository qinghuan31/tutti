import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AgentSlashCommandPalette } from "./AgentSlashCommandPalette";

describe("AgentSlashCommandPalette", () => {
  it("uses mention palette row spacing and color tokens for command options", () => {
    render(
      <AgentSlashCommandPalette
        label="Slash commands"
        commandsGroupLabel="Commands"
        skillsGroupLabel="Skills"
        highlightedIndex={0}
        entries={[
          {
            type: "command",
            key: "command:nextop-cli",
            label: "nextop-cli",
            description: "Inspect tasks and agent context.",
            command: {
              name: "nextop-cli",
              description: "Inspect tasks and agent context.",
              inputHint: "[issue description]"
            }
          }
        ]}
        onHighlightChange={vi.fn()}
        onSelect={vi.fn()}
        onSelectSkill={vi.fn()}
      />
    );

    const palette = screen.getByRole("listbox", { name: "Slash commands" });
    expect(palette).toHaveClass(
      "agent-gui-node__mention-palette",
      "px-1",
      "pb-1",
      "pt-2"
    );

    const option = screen.getByRole("option", { name: /nextop-cli/i });
    expect(option).toHaveClass(
      "rounded-[6px]",
      "min-h-9",
      "px-2.5",
      "py-2",
      "hover:bg-[var(--transparency-block)]",
      "data-[highlighted]:bg-[var(--transparency-block)]",
      "active:bg-[var(--transparency-active)]"
    );
    expect(option).toHaveAttribute("data-highlighted", "");
    expect(screen.getByText("nextop-cli")).toHaveClass(
      "max-w-[48%]",
      "shrink-0",
      "truncate",
      "text-[12px]"
    );
    expect(screen.getByText("Inspect tasks and agent context.")).toHaveClass(
      "flex-1",
      "truncate",
      "text-[12px]",
      "text-[var(--text-secondary)]"
    );
    expect(screen.queryByText("[issue description]")).toBeNull();
  });
});
