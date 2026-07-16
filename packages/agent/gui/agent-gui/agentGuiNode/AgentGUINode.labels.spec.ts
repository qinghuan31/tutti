import { describe, expect, it } from "vitest";
import type { TranslateFn } from "../../i18n/index";
import { buildAgentHomeSuggestions } from "./AgentGUINode.labels";

const translate = ((key: string) => key) as TranslateFn;

describe("buildAgentHomeSuggestions", () => {
  it("shows every starter entry by default", () => {
    expect(
      buildAgentHomeSuggestions(translate, "workspace-1", []).map(
        (category) => category.id
      )
    ).toEqual([
      "meet-tutti",
      "task-breakdown",
      "quality-review",
      "agent-interaction",
      "import-session"
    ]);
  });

  it("removes the starter entries disabled by the host", () => {
    expect(
      buildAgentHomeSuggestions(
        translate,
        "workspace-1",
        [],
        ["task-breakdown", "agent-interaction"]
      ).map((category) => category.id)
    ).toEqual(["meet-tutti", "quality-review", "import-session"]);
  });
});
