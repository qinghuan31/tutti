import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConversationImageContextMenu } from "./ConversationImageContextMenu";

const { copyImageToClipboardMock } = vi.hoisted(() => ({
  copyImageToClipboardMock: vi.fn()
}));

vi.mock("../lib/copyImageToClipboard", () => ({
  copyImageToClipboard: copyImageToClipboardMock
}));

describe("ConversationImageContextMenu", () => {
  afterEach(() => {
    copyImageToClipboardMock.mockReset();
  });

  it("wraps children in a trigger element by default", () => {
    render(
      <ConversationImageContextMenu src="blob:preview">
        <img data-testid="image" alt="" />
      </ConversationImageContextMenu>
    );

    const trigger = document.querySelector(
      '[data-slot="context-menu-trigger"]'
    );
    expect(trigger).not.toBeNull();
    // The image is nested inside the wrapper trigger, not the trigger itself.
    expect(screen.getByTestId("image").getAttribute("data-slot")).not.toBe(
      "context-menu-trigger"
    );
    expect(trigger?.querySelector('[data-testid="image"]')).not.toBeNull();
  });

  it("attaches the trigger directly to the child when asChild is set", () => {
    render(
      <ConversationImageContextMenu src="blob:preview" asChild>
        <img data-testid="image" alt="" />
      </ConversationImageContextMenu>
    );

    // No extra wrapper: the image element itself becomes the trigger. This is
    // what lets the zoomed image keep its library-managed positioning.
    expect(screen.getByTestId("image").getAttribute("data-slot")).toBe(
      "context-menu-trigger"
    );
  });

  it("shows feedback after copying from the context menu", async () => {
    copyImageToClipboardMock.mockResolvedValue(true);

    render(
      <ConversationImageContextMenu src="blob:preview">
        <img data-testid="image" alt="" />
      </ConversationImageContextMenu>
    );

    fireEvent.contextMenu(screen.getByTestId("image"));
    const copyItem = await screen.findByRole("menuitem", {
      name: "Copy image"
    });
    fireEvent.pointerDown(copyItem);
    expect(screen.getByRole("menuitem", { name: "Copy image" })).toBeVisible();
    fireEvent.pointerUp(copyItem);
    fireEvent.click(copyItem);

    expect(copyImageToClipboardMock).toHaveBeenCalledWith(
      "blob:preview",
      expect.anything()
    );
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Image copied");
      expect(screen.queryByRole("menuitem", { name: "Copy image" })).toBeNull();
    });
  });

  it("keeps the context menu above zoom previews", async () => {
    render(
      <ConversationImageContextMenu src="blob:preview">
        <img data-testid="image" alt="" />
      </ConversationImageContextMenu>
    );

    fireEvent.contextMenu(screen.getByTestId("image"));

    expect(await screen.findByRole("menu")).toHaveStyle({ zIndex: "100302" });
  });
});
