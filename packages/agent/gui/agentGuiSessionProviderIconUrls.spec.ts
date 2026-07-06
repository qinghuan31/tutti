import { describe, expect, it } from "vitest";
import {
  cursorFlatFilledIconUrl,
  resolveAgentGuiSessionProviderIconUrl
} from "./agentGuiSessionProviderIconUrls.ts";

describe("resolveAgentGuiSessionProviderIconUrl", () => {
  it("returns the flat filled cursor icon for cursor sessions", () => {
    expect(resolveAgentGuiSessionProviderIconUrl("cursor")).toBe(
      cursorFlatFilledIconUrl
    );
  });

  it("returns null for providers without a flat filled session icon", () => {
    expect(resolveAgentGuiSessionProviderIconUrl("hermes")).toBeNull();
  });
});
