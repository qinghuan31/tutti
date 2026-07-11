import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  computeElapsedSeconds,
  formatElapsedSeconds,
  formatLocalizedElapsedLabel,
  isPositiveUnixMs,
  useElapsedSeconds
} from "./elapsedClock";

describe("computeElapsedSeconds", () => {
  it("returns null when the start time is missing or invalid", () => {
    expect(computeElapsedSeconds(null, null, 10_000, true)).toBeNull();
    expect(computeElapsedSeconds(0, null, 10_000, true)).toBeNull();
    expect(computeElapsedSeconds(-1, null, 10_000, true)).toBeNull();
  });
});

describe("useElapsedSeconds", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("freezes at completedAtUnixMs for non-live rows and never ticks", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(20_000));
    const { result } = renderHook(() =>
      useElapsedSeconds(7_000, 10_000, false)
    );
    expect(result.current).toBe(3);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(3);
  });

  it("ticks every second for live rows from the shared heartbeat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    const { result } = renderHook(() => useElapsedSeconds(7_000, null, true));
    expect(result.current).toBe(3);
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(result.current).toBe(5);
  });

  it("recomputes from lifecycle timestamps after the renderer clock resumes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    const { result, rerender } = renderHook(
      ({ completedAtUnixMs, live }) =>
        useElapsedSeconds(7_000, completedAtUnixMs, live),
      {
        initialProps: {
          completedAtUnixMs: null as number | null,
          live: true
        }
      }
    );

    expect(result.current).toBe(3);

    // Simulate a suspended renderer or sleeping machine: wall-clock time
    // advances without delivering each one-second heartbeat callback.
    vi.setSystemTime(new Date(130_000));
    act(() => {
      vi.advanceTimersToNextTimer();
    });
    expect(result.current).toBe(124);

    // A terminal lifecycle timestamp is authoritative even when it arrives
    // after resume, and later ticks must not move the displayed duration.
    rerender({ completedAtUnixMs: 75_000, live: false });
    expect(result.current).toBe(68);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(result.current).toBe(68);
  });

  it("drives concurrent live rows from a single heartbeat tick", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(10_000));
    const a = renderHook(() => useElapsedSeconds(7_000, null, true));
    const b = renderHook(() => useElapsedSeconds(8_000, null, true));
    expect(a.result.current).toBe(3);
    expect(b.result.current).toBe(2);
    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(a.result.current).toBe(4);
    expect(b.result.current).toBe(3);
  });
});

describe("isPositiveUnixMs", () => {
  it("accepts finite positive numbers only", () => {
    expect(isPositiveUnixMs(1)).toBe(true);
    expect(isPositiveUnixMs(0)).toBe(false);
    expect(isPositiveUnixMs(-1)).toBe(false);
    expect(isPositiveUnixMs(Number.NaN)).toBe(false);
    expect(isPositiveUnixMs(null)).toBe(false);
    expect(isPositiveUnixMs(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("formatElapsedSeconds", () => {
  it("formats sub-minute durations as seconds", () => {
    expect(formatElapsedSeconds(0)).toBe("0s");
    expect(formatElapsedSeconds(59)).toBe("59s");
  });
  it("formats minute-only and minute-plus-second durations", () => {
    expect(formatElapsedSeconds(60)).toBe("1m");
    expect(formatElapsedSeconds(80)).toBe("1m 20s");
    expect(formatElapsedSeconds(125)).toBe("2m 5s");
  });
});

describe("formatLocalizedElapsedLabel", () => {
  it("uses localized elapsed label keys", () => {
    const translate = (
      key: string,
      values: { count?: number; minutes?: number; seconds?: number }
    ) => `${key}:${values.count ?? values.minutes}:${values.seconds ?? ""}`;
    expect(formatLocalizedElapsedLabel(translate, 3, "processingElapsed")).toBe(
      "agentHost.agentGui.processingElapsedSeconds:3:"
    );
    expect(formatLocalizedElapsedLabel(translate, 60, "turnElapsed")).toBe(
      "agentHost.agentGui.turnElapsedMinutesOnly:1:"
    );
  });
});
