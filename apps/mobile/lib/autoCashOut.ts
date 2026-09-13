import { nationalDigits, requireAgent } from "./agent";
import { postJson } from "./api";
import { signInAndSend, type SendPhase } from "./telebirr";
import { queueTelebirr } from "./telebirrLock";
import { loadSnapshot, saveSnapshot } from "./telebirrData";

/**
 * Paying out a customer's cash-out, without the agent doing anything.
 *
 * The customer asks for an amount on the web page and hands over cash at the
 * counter; the server pushes the request to this handset, and this opens
 * telebirr, signs in as the enrolled agent and sends that amount to the
 * customer's own number. The agent taps nothing — they watch it happen in the
 * notification list, the same way a deposit check answers itself.
 *
 * The mirror image of autoConfirm.ts, with one difference that governs
 * everything below: a deposit check only READS telebirr, while this MOVES REAL
 * MONEY out of the agent's float, on the strength of a request that arrived over
 * a socket. Nothing downstream asks a human, so the guards here are the only
 * ones there are:
 *
 *   - an id runs at most once per app session, so a repeated or replayed event
 *     cannot pay the same customer twice;
 *   - the number and the amount are checked before telebirr is opened;
 *   - the telebirr lock serialises this behind any read already running;
 *   - a transfer interrupted by the app closing is never retried on its own,
 *     because whether the money left is unknowable from here.
 */

export type CashOutStage =
  /**
   * Arrived, waiting for the agent to approve it. No longer reached by a new
   * request — payouts start on arrival — but kept so cash-outs already stored on
   * a handset from the tap-to-approve build still render, and can still be paid.
   */
  | "awaiting"
  | "queued"
  | "sending" // driving telebirr
  | "sent"
  | "failed"
  /** The app was closed mid-transfer; whether it went through is unknown. */
  | "interrupted";

export interface CashOutProgress {
  id: string;
  stage: CashOutStage;
  /** Which telebirr step it is on, for the progress list on the home screen. */
  phase?: SendPhase;
  reason?: string;
  /** telebirr's balance after a completed send, as it reported it. */
  balance?: number;
}

/** A stage with nothing left to happen, so a restored one is not left spinning. */
export function isSettled(stage: CashOutStage): boolean {
  return stage === "sent" || stage === "failed" || stage === "interrupted";
}

/**
 * The amount as telebirr's field wants it: plain digits, and cents only when
 * the request actually has them — typing "100.00" where "100" will do is one
 * more thing for the keypad to get wrong.
 */
export function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

/**
 * Tells the server how the payout went, so the row stops being PENDING.
 *
 * Never throws: the money has already moved (or already failed) by the time this
 * runs, and losing the report must not turn a completed transfer into an
 * exception. A report that cannot be delivered leaves the row to be closed off
 * by the server's own staleness sweep.
 */
async function report(
  requestId: string,
  body: { sent: boolean; balanceAfter?: number; reason?: string },
): Promise<void> {
  try {
    const agent = await requireAgent();
    await postJson("/api/agents/cashout/resolve", {
      phone: agent.phone,
      pin: agent.pin,
      requestId,
      ...body,
    });
  } catch {
    // Nothing here can fix an unreachable server, and throwing would lose the queue.
  }
}

async function runCashOut(
  id: string,
  requestId: string,
  customerPhone: string,
  amount: number,
  onProgress: (progress: CashOutProgress) => void,
): Promise<void> {
  const digits = nationalDigits(customerPhone);

  // Refused here rather than part-way through telebirr's form: a number the
  // field cannot hold would otherwise strand the run on the recipient screen.
  if (!/^[79]\d{8}$/.test(digits)) {
    const reason = `${customerPhone} is not an Ethiopian mobile number.`;
    await report(requestId, { sent: false, reason });
    onProgress({ id, stage: "failed", reason });
    return;
  }
  if (!(amount > 0)) {
    const reason = "The requested amount is not a positive number.";
    await report(requestId, { sent: false, reason });
    onProgress({ id, stage: "failed", reason });
    return;
  }

  onProgress({ id, stage: "sending" });

  // Waits for any run already in progress rather than opening telebirr on top
  // of it — a customer is standing at the counter, so this one has to happen.
  const result = await queueTelebirr(`cash-out ${formatAmount(amount)} to ${digits}`, () =>
    signInAndSend(digits, formatAmount(amount), (phase) =>
      onProgress({ id, stage: "sending", phase }),
    ),
  );

  if (result.ok) {
    // Save the balance telebirr reported after the transfer. Without this the
    // app goes on showing the figure from before the send — right until the
    // next sync, which may be a long while — and an agent reading a stale
    // balance off this screen can hand out money they no longer have.
    if (typeof result.balance === "number") {
      const previous = await loadSnapshot();
      await saveSnapshot({ ...previous, balance: result.balance, readAt: Date.now() });
    }

    await report(requestId, { sent: true, balanceAfter: result.balance ?? undefined });
    onProgress({ id, stage: "sent", balance: result.balance ?? undefined });
    return;
  }
  // The last couple of log lines are the ones that say what actually stopped it.
  const reason = result.log.slice(-2).join(" · ");
  await report(requestId, { sent: false, reason: reason || "The transfer failed." });
  onProgress({ id, stage: "failed", reason });
}

/**
 * Cash-outs this app has already taken on.
 *
 * The same request can arrive more than once — a socket that reconnects, a
 * duplicate emit, an effect that re-runs in development. Sending twice would
 * pay the customer twice, so an id is only ever run once per app session.
 */
const handled = new Set<string>();

/**
 * Starts one payout. Called from the socket handler the moment a request
 * arrives; the `handled` set above is what stops a duplicate event paying twice.
 */
export function queueCashOut(
  id: string,
  requestId: string,
  customerPhone: string,
  amount: number,
  onProgress: (progress: CashOutProgress) => void,
): void {
  if (handled.has(id)) return;
  handled.add(id);

  onProgress({ id, stage: "queued" });

  // queueTelebirr inside runCashOut does the serialising; this only has to catch
  // what escapes, because a failure still has to reach the screen — and the
  // server, so the row does not sit PENDING until the staleness sweep.
  runCashOut(id, requestId, customerPhone, amount, onProgress).catch(async (error) => {
    const reason = error instanceof Error ? error.message : "Something went wrong.";
    await report(requestId, { sent: false, reason });
    onProgress({ id, stage: "failed", reason });
  });
}

/** One cash-out row of the agent's server-side history. */
export interface StoredCashOut {
  requestId: string;
  phone: string;
  amount: number;
  status: "PENDING" | "SENT" | "FAILED";
  reason: string | null;
  balanceAfter: number | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * The agent's cash-outs as the server has them. Returns null when it cannot be
 * reached — the caller keeps whatever the device already had.
 */
export async function fetchCashOutHistory(
  phone: string,
  pin: string,
): Promise<StoredCashOut[] | null> {
  try {
    const result = await postJson<{ requests: StoredCashOut[] }>(
      "/api/agents/cashout/history",
      { phone, pin },
    );
    return result.requests;
  } catch {
    return null;
  }
}

/** Marks a cash-out as already dealt with, so restoring never re-sends it. */
export function markCashOutHandled(id: string): void {
  handled.add(id);
}
