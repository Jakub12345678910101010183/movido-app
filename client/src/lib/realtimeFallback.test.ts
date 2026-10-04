import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pollWhileDown } from "./realtimeFallback";

/** A load whose completion the test controls. */
function controlledLoad() {
  const resolvers: Array<() => void> = [];
  const load = vi.fn(() => new Promise<void>((resolve) => { resolvers.push(resolve); }));
  return { load, finish: async () => { resolvers.shift()?.(); await Promise.resolve(); await Promise.resolve(); } };
}

describe("pollWhileDown", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("polls until the channel is live, and again after it drops", async () => {
    const load = vi.fn();
    const f = pollWhileDown(load, 1000);
    await vi.advanceTimersByTimeAsync(2500);
    expect(load).toHaveBeenCalledTimes(2);
    f.onStatus("SUBSCRIBED");
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(2);
    f.onStatus("CHANNEL_ERROR");
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(3);
    f.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("reloads once when the channel comes back after being down", () => {
    const load = vi.fn();
    const f = pollWhileDown(load, 1000);
    f.onStatus("SUBSCRIBED");            // first connect: no extra reload
    expect(load).toHaveBeenCalledTimes(0);
    f.onStatus("CHANNEL_ERROR");
    f.onStatus("SUBSCRIBED");            // reconnect: reload
    expect(load).toHaveBeenCalledTimes(1);
    expect(f.polling).toBe(false);
  });

  describe("H-1: no restart after cleanup", () => {
    it.each(["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"])("ignores a late %s after stop (no new interval, no load)", (late) => {
      const load = vi.fn();
      const f = pollWhileDown(load, 1000);
      f.onStatus("SUBSCRIBED");
      expect(vi.getTimerCount()).toBe(0);
      f.stop();                           // component unmounts
      f.onStatus(late);                   // realtime-js reports CLOSED after removeChannel
      f.onStatus("SUBSCRIBED");
      expect(f.polling).toBe(false);
      expect(vi.getTimerCount()).toBe(0);
      vi.advanceTimersByTime(60_000);
      expect(load).not.toHaveBeenCalled();
    });

    it("stops a running interval and stays stopped; stop is idempotent", () => {
      const load = vi.fn();
      const f = pollWhileDown(load, 1000);
      expect(vi.getTimerCount()).toBe(1);   // down until the channel reports
      f.stop(); f.stop();
      f.set(true);
      expect(vi.getTimerCount()).toBe(0);
      expect(f.stopped).toBe(true);
      vi.advanceTimersByTime(10_000);
      expect(load).not.toHaveBeenCalled();
    });
  });

  describe("L-1: no overlapping polls", () => {
    it("skips a tick while the previous poll is pending, then polls normally", async () => {
      const { load, finish } = controlledLoad();
      pollWhileDown(load, 1000);
      vi.advanceTimersByTime(1000);         // poll 1 starts
      expect(load).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);         // tick while poll 1 pending: skipped
      vi.advanceTimersByTime(1000);
      expect(load).toHaveBeenCalledTimes(1);
      await finish();                       // poll 1 resolves
      vi.advanceTimersByTime(1000);         // next tick polls
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("keeps polling after a failed poll", async () => {
      let fail = true;
      const load = vi.fn(() => (fail ? Promise.reject(new Error("offline")) : Promise.resolve()));
      pollWhileDown(load, 1000);
      vi.advanceTimersByTime(1000);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
      fail = false;
      vi.advanceTimersByTime(1000);
      expect(load).toHaveBeenCalledTimes(2);
    });

    it("stop while a poll is pending schedules nothing afterwards", async () => {
      const { load, finish } = controlledLoad();
      const f = pollWhileDown(load, 1000);
      vi.advanceTimersByTime(1000);
      expect(load).toHaveBeenCalledTimes(1);
      f.onStatus("CHANNEL_ERROR");
      f.stop();
      await finish();
      f.onStatus("CLOSED");
      vi.advanceTimersByTime(10_000);
      expect(load).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    });

    it("a reconnect during a pending poll reloads once after it, not alongside it", async () => {
      const { load, finish } = controlledLoad();
      const f = pollWhileDown(load, 1000);
      f.onStatus("CHANNEL_ERROR");
      vi.advanceTimersByTime(1000);         // poll pending
      f.onStatus("SUBSCRIBED");             // reconnect while pending: queued
      expect(load).toHaveBeenCalledTimes(1);
      await finish();
      expect(load).toHaveBeenCalledTimes(2);
      await finish();
      vi.advanceTimersByTime(10_000);       // live: no more polling
      expect(load).toHaveBeenCalledTimes(2);
    });
  });
});
