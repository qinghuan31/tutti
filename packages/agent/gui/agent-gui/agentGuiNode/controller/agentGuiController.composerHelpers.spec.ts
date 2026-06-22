import { afterEach, describe, expect, it } from "vitest";
import { setAgentGuiI18nTestLocale } from "../../../i18n/testUtils";
import type { AgentSessionPermissionConfig } from "../../../shared/agentSessionTypes";
import { permissionModeOptions } from "./agentGuiController.composerHelpers";

describe("permissionModeOptions", () => {
  afterEach(() => {
    setAgentGuiI18nTestLocale("en");
  });

  it("localizes codex auto permission through the zh-CN provider label", () => {
    setAgentGuiI18nTestLocale("zh-CN");

    const permissionConfig: AgentSessionPermissionConfig = {
      configurable: true,
      defaultValue: "auto",
      modes: [
        {
          id: "auto",
          label: "Approve for me",
          description: "Ask only when risky actions are detected",
          semantic: "auto"
        }
      ]
    };

    expect(permissionModeOptions("codex", permissionConfig)).toEqual([
      {
        value: "auto",
        label: "替我审批",
        description: "仅对检测到的风险操作请求批准"
      }
    ]);
  });
});
