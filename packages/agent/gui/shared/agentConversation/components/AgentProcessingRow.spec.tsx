import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentProcessingRow } from "./AgentProcessingRow";

describe("AgentProcessingRow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });
  it("renders the processing label inside a stable text span", () => {
    render(
      <AgentProcessingRow
        row={{
          kind: "processing",
          id: "processing",
          turnId: null,
          label: "正在规划下一步",
          occurredAtUnixMs: null,
          live: true
        }}
        label="Planning next moves"
        elapsedLabel={(seconds) => `Processed ${seconds}s`}
        completedElapsedLabel={(seconds) => `Total ${seconds}s`}
      />
    );

    const label = screen.getByText("正在规划下一步");
    expect(label.className).not.toContain("tsh-inline-scanlight-line");
    expect(label.parentElement?.className).toContain("font-semibold");
    expect(
      label.parentElement?.querySelector(
        ".tsh-inline-loading-ellipsis--entry-timing"
      )
    ).toBeTruthy();
  });

  it("renders and updates elapsed runtime while processing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));

    render(
      <AgentProcessingRow
        row={{
          kind: "processing",
          id: "processing",
          turnId: "turn-1",
          label: null,
          occurredAtUnixMs: null,
          startedAtUnixMs: 7_000,
          live: true
        }}
        label="Processing"
        elapsedLabel={(elapsedSeconds) => `已处理 ${elapsedSeconds}s`}
        completedElapsedLabel={(elapsedSeconds) => `总用时 ${elapsedSeconds}s`}
      />
    );

    expect(screen.getByTestId("agent-processing-elapsed")).toHaveTextContent(
      "已处理 3s"
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId("agent-processing-elapsed")).toHaveTextContent(
      "已处理 5s"
    );
  });

  it("keeps the final elapsed runtime fixed after processing completes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000));

    render(
      <AgentProcessingRow
        row={{
          kind: "turn-elapsed",
          id: "turn-elapsed:turn-1",
          turnId: "turn-1",
          occurredAtUnixMs: 7_000,
          startedAtUnixMs: 7_000,
          completedAtUnixMs: 10_000
        }}
        label="Processing"
        elapsedLabel={(elapsedSeconds) => `已处理 ${elapsedSeconds}s`}
        completedElapsedLabel={(elapsedSeconds) => `总用时 ${elapsedSeconds}s`}
      />
    );

    expect(screen.getByTestId("agent-processing-elapsed")).toHaveTextContent(
      "总用时 3s"
    );

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByTestId("agent-processing-elapsed")).toHaveTextContent(
      "总用时 3s"
    );
  });

  it("does not render a leading loading icon before the processing label", () => {
    const { container } = render(
      <AgentProcessingRow
        row={{
          kind: "processing",
          id: "processing",
          turnId: null,
          label: "正在规划下一步",
          occurredAtUnixMs: null
        }}
        label="Planning next moves"
        elapsedLabel={(seconds) => `Processed ${seconds}s`}
        completedElapsedLabel={(seconds) => `Total ${seconds}s`}
      />
    );

    expect(container.querySelector("video")).not.toBeInTheDocument();
    expect(
      container.querySelector(".tsh-inline-scanlight-icon")
    ).not.toBeInTheDocument();
  });
});
