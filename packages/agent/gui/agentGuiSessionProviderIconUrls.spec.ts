import { describe, expect, it } from "vitest";
import {
  cursorColorfulUrl,
  cursorFlatFilledIconUrl,
  resolveAgentGuiSessionProviderIconUrl
} from "./agentGuiSessionProviderIconUrls.ts";

describe("resolveAgentGuiSessionProviderIconUrl", () => {
  it("returns the colorful cursor icon for cursor sessions", () => {
    expect(resolveAgentGuiSessionProviderIconUrl("cursor")).toBe(
      cursorColorfulUrl
    );
  });

  it("keeps the legacy flat filled cursor icon available for older callers", () => {
    expect(cursorFlatFilledIconUrl).toEqual(expect.any(String));
  });

  it("returns null for providers without a session icon override", () => {
    expect(resolveAgentGuiSessionProviderIconUrl("hermes")).toBeNull();
  });
});
