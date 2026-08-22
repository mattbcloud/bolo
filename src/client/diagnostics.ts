/**
 * Client-side crash reporting.
 *
 * When a player drops mid-game there is usually nothing left to look at: the tab may be one of
 * several windows nobody was watching, the console may be filtered or drowned in browser-extension
 * noise, and on a hosted deployment there is no console to read at all. So the page reports its own
 * failures to the server, where they land in the same log as the [SILENCE]/[REAP] lines for that
 * moment and can be lined up against them.
 *
 * Three things are worth reporting, because each produces the same visible symptom — a client that
 * stops talking to the server — for a completely different reason:
 *
 *   uncaught errors / rejections — something threw; whatever ran after it never ran again.
 *   main-thread stalls           — nothing threw, the thread simply stopped servicing timers, which
 *                                  also stops the browser draining the WebSocket, so even the
 *                                  protocol-level pong the server relies on goes unanswered.
 *   socket close codes           — says who hung up: code 4000 is the server's stale-client reaper,
 *                                  1006 is an abnormal close with no close frame (a broken pipe,
 *                                  typically an intermediary), 1001/1000 are the page itself going
 *                                  away.
 */

export interface ClientErrorReport {
  kind: string;
  message: string;
  detail?: unknown;
  stack?: string;
}

/** Cap total reports so a repeating failure can't turn into a request flood. */
const MAX_REPORTS = 50;
let reportsSent = 0;

/** De-duplicate by message: the same throw usually recurs every tick. */
const seen = new Set<string>();

export function reportClientError(report: ClientErrorReport): void {
  const key = `${report.kind}:${report.message}`;
  if (seen.has(key) || reportsSent >= MAX_REPORTS) return;
  seen.add(key);
  reportsSent++;

  const body = JSON.stringify({
    ...report,
    nick: (globalThis as any).__boloNick ?? null,
    url: location.href,
    hidden: document.visibilityState === 'hidden',
    at: new Date().toISOString(),
  });

  // keepalive so a report still goes out when it is the page itself that is going away.
  try {
    fetch('/api/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => { /* reporting must never itself throw */ });
  } catch {
    /* ignore */
  }
}

/**
 * Watch for the main thread going away. Timers are the canary: if a 250ms interval comes back late
 * by seconds, the thread was blocked for that long, and a blocked thread stops draining the socket.
 *
 * A hidden tab has its timers throttled to roughly 1 Hz by the browser, which is not a stall — hence
 * the 2.5s floor, and hence recording visibility on every report so a throttled tab is never
 * mistaken for a wedged one.
 */
const STALL_CHECK_MS = 250;
const STALL_THRESHOLD_MS = 2500;

function installStallDetector(): void {
  let last = performance.now();
  setInterval(() => {
    const now = performance.now();
    const gap = now - last;
    last = now;
    if (gap > STALL_THRESHOLD_MS) {
      const hidden = document.visibilityState === 'hidden';
      console.warn(`[STALL] main thread blocked ~${Math.round(gap)}ms (hidden=${hidden})`);
      // Stalls are reported per occurrence, not deduped by message, so the timing of each one
      // survives — that is the whole point of the measurement.
      seen.delete(`stall:main thread blocked ~${Math.round(gap)}ms`);
      reportClientError({
        kind: 'stall',
        message: `main thread blocked ~${Math.round(gap)}ms`,
        detail: { hidden, thresholdMs: STALL_THRESHOLD_MS },
      });
    }
  }, STALL_CHECK_MS);
}

let installed = false;

/** Idempotent: module reloads under HMR must not stack duplicate listeners. */
export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  (globalThis as any).__reportClientError = reportClientError;

  window.addEventListener('error', (e: ErrorEvent) => {
    reportClientError({
      kind: 'uncaught',
      message: e.message || 'unknown error',
      detail: { source: e.filename, line: e.lineno, col: e.colno },
      stack: e.error instanceof Error ? e.error.stack : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    const reason: any = e.reason;
    reportClientError({
      kind: 'rejection',
      message: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
  });

  installStallDetector();
}
