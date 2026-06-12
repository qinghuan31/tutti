import { describe, expect, it } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { agentGuiDockIconUrls } from "../dockIcons.ts";
import {
  agentGuiWorkbenchDefaultCopy,
  createAgentGuiWorkbenchContribution,
  resolveAgentGuiWorkbenchDefaultLaunchFrame,
  resolveAgentGuiWorkbenchContributionCopy
} from "./contribution.ts";
import { agentGuiWorkbenchDockEntryId } from "./launch.ts";

function readDockEntryIconSrc(icon: unknown): string | undefined {
  if (!isValidElement(icon)) {
    return undefined;
  }
  return (icon as ReactElement<{ src?: string }>).props.src;
}

describe("agent GUI workbench contribution copy", () => {
  it("uses package defaults when the host does not provide copy", () => {
    expect(resolveAgentGuiWorkbenchContributionCopy()).toEqual(
      agentGuiWorkbenchDefaultCopy
    );

    const contribution = createAgentGuiWorkbenchContribution({
      renderBody: () => null,
      workspaceId: "workspace-1"
    });

    expect(contribution.nodes?.[0]?.title).toBe(
      agentGuiWorkbenchDefaultCopy.nodeTitle
    );
  });

  it("lets hosts override only the copy they own", () => {
    expect(
      resolveAgentGuiWorkbenchContributionCopy({
        nodeTitle: "Assistant"
      })
    ).toEqual({
      ...agentGuiWorkbenchDefaultCopy,
      nodeTitle: "Assistant"
    });
  });

  it("uses packaged dock icons when the host does not provide icon URLs", () => {
    const contribution = createAgentGuiWorkbenchContribution({
      renderBody: () => null,
      workspaceId: "workspace-1"
    });

    const codexDockEntry = contribution.dockEntries?.find(
      (entry) => entry.id === agentGuiWorkbenchDockEntryId("codex")
    );

    expect(readDockEntryIconSrc(codexDockEntry?.icon)).toBe(
      agentGuiDockIconUrls.codex
    );
  });

  it("lets hosts override packaged dock icons explicitly", () => {
    const contribution = createAgentGuiWorkbenchContribution({
      dockIconUrls: {
        codex: "app://icons/codex.png"
      },
      renderBody: () => null,
      workspaceId: "workspace-1"
    });

    const codexDockEntry = contribution.dockEntries?.find(
      (entry) => entry.id === agentGuiWorkbenchDockEntryId("codex")
    );
    const geminiDockEntry = contribution.dockEntries?.find(
      (entry) => entry.id === agentGuiWorkbenchDockEntryId("gemini")
    );

    expect(readDockEntryIconSrc(codexDockEntry?.icon)).toBe(
      "app://icons/codex.png"
    );
    expect(readDockEntryIconSrc(geminiDockEntry?.icon)).toBe(
      agentGuiDockIconUrls.gemini
    );
  });

  it("opens at 70 percent of the workbench area excluding chrome and dock safe areas", () => {
    const frame = resolveAgentGuiWorkbenchDefaultLaunchFrame({
      frame: { height: 560, width: 1040, x: 140, y: 48 },
      request: {
        layoutConstraints: {
          minHeight: 160,
          minWidth: 280,
          safeArea: {
            bottom: 79,
            left: 0,
            right: 0,
            top: 52
          },
          surfacePadding: 0
        },
        surfaceSize: {
          height: 900,
          width: 1440
        }
      }
    });

    expect(frame).toEqual({
      height: 538,
      width: 1040,
      x: 140,
      y: 48
    });
  });
});
