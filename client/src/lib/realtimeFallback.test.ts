import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollWhileDown } from "./realtimeFallback";

describe("pollWhileDown", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("polls until the channel is live, and again after it drops", () => {
    const load = vi.fn();
    const f = pollWhileDown(load, 1000);
    vi.advanceTimersByTime(2500);
    expect(load).toHaveBeenCalledTimes(2);
    f.set(false);
    vi.advanceTimersByTime(5000);
    expect(load).toHaveBeenCalledTimes(2);
    f.set(true);
    vi.advanceTimersByTime(1000);
    expect(load).toHaveBeenCalledTimes(3);
    f.stop();
    vi.advanceTimersByTime(5000);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
