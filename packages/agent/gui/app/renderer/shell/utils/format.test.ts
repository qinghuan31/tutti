import { afterEach, describe, expect, it, vi } from "vitest";
import { setCurrentAgentGuiI18nLocaleForTests } from "../../../../i18n/runtime";
import { toRelativeTime } from "./format";

describe("toRelativeTime", () => {
  afterEach(() => {
    setCurrentAgentGuiI18nLocaleForTests("en");
    vi.useRealTimers();
  });

  it("formats relative timestamps for English locale", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    setCurrentAgentGuiI18nLocaleForTests("en");

    expect(toRelativeTime("2026-06-14T12:00:00Z")).toBe("10 days ago");
    expect(toRelativeTime("2026-04-24T12:00:00Z")).toBe("2 months ago");
    expect(toRelativeTime("2024-06-24T12:00:00Z")).toBe("2 years ago");
  });

  it("formats relative timestamps for Chinese locale with readable digit spacing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-24T12:00:00Z"));
    setCurrentAgentGuiI18nLocaleForTests("zh-CN");

    expect(toRelativeTime("2026-06-14T12:00:00Z")).toBe("10 天前");
    expect(toRelativeTime("2026-04-24T12:00:00Z")).toBe("2 个月前");
    expect(toRelativeTime("2024-06-24T12:00:00Z")).toBe("2 年前");
  });
});
