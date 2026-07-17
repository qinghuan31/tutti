import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  join(process.cwd(), "app/renderer/agentactivity.css"),
  "utf8"
);

describe("AgentGUIConversationRailItem title mention composition", () => {
  it("keeps the optional leading mention icon compact and monochrome", () => {
    const mentionIconStyles = css.slice(
      css.indexOf(".agent-gui-node__conversation-title-mention-icon"),
      css.indexOf(".agent-gui-node__conversation-time")
    );

    expect(mentionIconStyles).toContain("color: var(--text-primary);");
    expect(mentionIconStyles).toContain("flex: 0 0 14px;");
    expect(mentionIconStyles).not.toContain("--rich-text-mention-session");
    expect(mentionIconStyles).not.toContain("--rich-text-mention-issue");
  });
});
