import { io, type Socket } from "socket.io-client";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/**
 * The customer's end of a deposit check.
 *
 * The server cannot answer a check — the agent's phone does, after opening
 * telebirr and finding the receipt, which takes the best part of a minute. So
 * the page opens a socket, watches the request it is about to make, and waits
 * for the phone's answer.
 *
 * This connection proves nothing and is granted nothing: it can only listen to
 * request ids it already holds, and those are made up here, in this browser.
 */

export type DepositOutcome =
  | { requestId: string; status: "confirmed"; reference: string; amount: number }
  | { requestId: string; status: "not_found"; reference: string }
  | { requestId: string; status: "failed"; reference: string; reason: string };

let socket: Socket | null = null;

function connection(): Socket {
  if (!socket) {
    socket = io(BASE, { auth: { role: "customer" } });
  }
  return socket;
}

/** A request id this browser invents, unguessable enough to be its own key. */
export function newRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Waits for the handset's answer on one request.
 *
 * Resolves null if the phone never answers: an agent whose telebirr is slow, or
 * whose phone is switched off, must not leave the page spinning forever.
 * Returns a `stop` to drop the listener when the page gives up or moves on.
 */
export function awaitOutcome(
  requestId: string,
  timeoutMs: number,
): { promise: Promise<DepositOutcome | null>; stop: () => void } {
  const active = connection();
  active.emit("watch", requestId);

  let settle: (value: DepositOutcome | null) => void = () => {};
  let timer: number | undefined;

  const onResolved = (outcome: DepositOutcome) => {
    // One socket serves every check this page makes; ignore other requests'.
    if (outcome.requestId === requestId) settle(outcome);
  };

  const stop = () => {
    active.off("deposit:resolved", onResolved);
    if (timer !== undefined) window.clearTimeout(timer);
  };

  const promise = new Promise<DepositOutcome | null>((resolve) => {
    settle = (value) => {
      stop();
      resolve(value);
    };
    active.on("deposit:resolved", onResolved);
    timer = window.setTimeout(() => settle(null), timeoutMs);
  });

  // `watch` is only delivered on a live connection, so a socket that is still
  // opening — or that dropped — has to ask again once it is up.
  active.on("connect", () => active.emit("watch", requestId));

  return { promise, stop };
}
