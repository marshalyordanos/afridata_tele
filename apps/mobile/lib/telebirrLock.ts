/**
 * One telebirr run at a time, app-wide.
 *
 * Driving telebirr takes over the screen, and finishing hands the screen back
 * to AutoPilot — which is itself an event the home screen reacts to. Without a
 * lock the automatic deposit lookup and the home screen's own sync each start
 * telebirr, hand back, and set the other off again: telebirr opens over and
 * over and neither read completes.
 *
 * Module scope on purpose. A React ref or a component's state would be one lock
 * per mount, and the whole point is that every caller shares the same one.
 */

let current: Promise<unknown> | null = null;
/**
 * Identity of the run that currently holds the lock.
 *
 * A finishing job must only clear the lock if it is still the one holding it —
 * otherwise it would release it out from under whatever queued behind it. A
 * token compares cleanly; the promise itself cannot be referenced from inside
 * its own initialiser.
 */
let token: object | null = null;
let holder: string | null = null;

export function telebirrBusy(): boolean {
  return current !== null;
}

/** Who holds it, for a message worth reading when something is refused. */
export function telebirrHolder(): string | null {
  return holder;
}

/** Hands the lock back, but only when `mine` is still the holder. */
function release(mine: object): void {
  if (token !== mine) return;
  current = null;
  token = null;
  holder = null;
}

/**
 * Runs `job` with the lock held, or returns null right away if telebirr is
 * already being driven. Callers must handle null — it means "not now", and
 * queueing every request that arrived during a two-minute read would just
 * reopen telebirr a dozen times once it cleared.
 */
export async function withTelebirr<T>(label: string, job: () => Promise<T>): Promise<T | null> {
  if (current) return null;

  const mine = {};
  holder = label;
  const run = (async () => {
    try {
      return await job();
    } finally {
      release(mine);
    }
  })();

  current = run;
  token = mine;
  return run;
}

/**
 * Like `withTelebirr`, but waits its turn instead of giving up.
 *
 * For work that must happen eventually — answering a customer who is watching a
 * page — rather than the opportunistic refresh a screen does on open.
 */
export async function queueTelebirr<T>(label: string, job: () => Promise<T>): Promise<T> {
  const previous = current;
  // Swallow the previous job's failure: waiting in line must not inherit it.
  const wait = previous ? previous.then(() => {}, () => {}) : Promise.resolve();

  const mine = {};
  const run = (async () => {
    await wait;
    holder = label;
    try {
      return await job();
    } finally {
      release(mine);
    }
  })();

  current = run;
  token = mine;
  return run;
}
