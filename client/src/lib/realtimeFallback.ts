/** Keeps realtime-backed lists current when the websocket is unavailable. */

/** How often lists reload while instant (realtime) updates are unavailable. */
export const FALLBACK_POLL_MS = 30_000;

/**
 * Polls `load` every FALLBACK_POLL_MS while `set(true)` (channel down) and
 * stops when `set(false)`. Starts in the down state until the channel reports.
 */
export function pollWhileDown(load: () => unknown, every: number = FALLBACK_POLL_MS) {
  let timer: ReturnType<typeof setInterval> | null = null;
  const state = {
    wasDown: false,
    set(down: boolean) {
      if (down && !timer) timer = setInterval(() => { void load(); }, every);
      if (!down && timer) { clearInterval(timer); timer = null; }
    },
    stop() { state.set(false); },
  };
  state.set(true);
  return state;
}
