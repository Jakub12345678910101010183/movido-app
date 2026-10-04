/** Keeps realtime-backed lists current when the websocket is unavailable. */

/** How often lists reload while instant (realtime) updates are unavailable. */
export const FALLBACK_POLL_MS = 30_000;

/**
 * Polling fallback for one realtime channel.
 *
 * - Polls `load` every FALLBACK_POLL_MS while the channel is down, starting
 *   in the down state until the channel reports SUBSCRIBED.
 * - Reloads once when the channel comes back after being down.
 * - Never starts a load while the previous one from this fallback is still
 *   running (each fallback has its own guard; other tables are unaffected).
 * - After `stop()` nothing restarts it: the realtime library reports CLOSED
 *   (or CHANNEL_ERROR) after the channel is removed, during cleanup.
 */
export function pollWhileDown(load: () => unknown, every: number = FALLBACK_POLL_MS) {
  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let inFlight = false;
  let reloadAfter = false;

  /** Starts one load unless one is running. `mustReload` queues one more for after it. */
  const run = (mustReload = false) => {
    if (stopped) return;
    if (inFlight) { if (mustReload) reloadAfter = true; return; }
    inFlight = true;
    let pending: unknown;
    try { pending = load(); } catch { pending = undefined; }
    Promise.resolve(pending).catch(() => {}).finally(() => {
      inFlight = false;
      if (reloadAfter) { reloadAfter = false; run(); }
    });
  };

  const state = {
    wasDown: false,
    get stopped() { return stopped; },
    get polling() { return timer !== null; },
    set(down: boolean) {
      if (stopped) return;
      if (down && !timer) timer = setInterval(() => run(), every);
      if (!down && timer) { clearInterval(timer); timer = null; }
    },
    /** Pass the realtime subscribe status here. Ignored once stopped. */
    onStatus(status: string) {
      if (stopped) return;
      const live = status === "SUBSCRIBED";
      // Changes made while the channel was down are never replayed: reload,
      // after any load already running (it may have started before them).
      if (live && state.wasDown) run(true);
      state.wasDown = !live;
      state.set(!live);
    },
    /** Idempotent. */
    stop() {
      stopped = true;
      reloadAfter = false;
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
  state.set(true);
  return state;
}
