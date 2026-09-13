import { requireAgent } from "./agent";
import { postJson } from "./api";
import { syncTelebirr } from "./telebirr";
import { loadSnapshot, saveSnapshot, type TelebirrTransaction } from "./telebirrData";
import { queueTelebirr } from "./telebirrLock";

/**
 * Answering a customer's deposit check, without the agent doing anything.
 *
 * The customer types a reference on the web and waits. This opens telebirr,
 * reads the agent's own transaction history, finds that reference and reports
 * the amount back — which is what turns the customer's page successful. The
 * agent never taps anything; they just see it happen in the notification list.
 */

export type ConfirmStage =
  | "queued"
  | "reading"   // driving telebirr
  | "confirmed"
  | "not_found"
  | "failed";

export interface ConfirmProgress {
  requestId: string;
  stage: ConfirmStage;
  amount?: number;
  reason?: string;
  /** Receipts opened so far, when the list gave no reference numbers. */
  opened?: number;
}

/** telebirr receipts are compared loosely — people retype them by eye. */
const normalizeReference = (value: string) => value.replace(/\s+/g, "").toUpperCase();

export function findByReference(
  transactions: TelebirrTransaction[],
  reference: string,
): TelebirrTransaction | undefined {
  const wanted = normalizeReference(reference);
  return transactions.find((tx) => normalizeReference(tx.receipt) === wanted);
}

/**
 * Runs one lookup: telebirr, then the report.
 *
 * The search looks at the fresh read first and falls back to the stored
 * snapshot, so a reference that was already on file still resolves when the
 * live read came back short.
 */
async function runLookup(
  requestId: string,
  reference: string,
  onProgress: (progress: ConfirmProgress) => void,
): Promise<void> {
  const agent = await requireAgent();

  let match: TelebirrTransaction | undefined;
  // Everything actually looked at: the fresh read plus what was already on file.
  let pool: TelebirrTransaction[] = [];
  // How many receipts the read had to open, when the list carried no numbers.
  let opened = 0;
  // Whether the search saw every receipt, or stopped at the cap or the clock.
  let exhausted = true;
  try {
    onProgress({ requestId, stage: "reading" });
    // Waits for any run already in progress rather than opening telebirr on top
    // of it; a customer is watching a page, so this one has to happen. The
    // reference goes down with it so the whole check is one trip into telebirr.
    const result = await queueTelebirr(`deposit ${reference}`, () =>
      syncTelebirr(() => {}, {
        reference,
        onOpened: (n) => {
          opened = n;
          onProgress({ requestId, stage: "reading", opened: n });
        },
      }),
    );

    // Keep what the read produced, exactly as a manual sync would.
    const previous = await loadSnapshot();
    await saveSnapshot({
      ...previous,
      balance: result.balance ?? previous.balance,
      transactions: result.transactions.length ? result.transactions : previous.transactions,
      readAt: Date.now(),
    });

    pool = [...result.transactions, ...previous.transactions];
    match = findByReference(pool, reference);

    // The list had no reference numbers, so the receipts themselves were opened
    // and one of them carried this reference. That IS the confirmation — the
    // amount is the one telebirr printed on the row it was found on.
    exhausted = result.seekSearch ? result.seekSearch.exhausted : true;
    if (result.seekSearch) opened = result.seekSearch.opened;

    if (!match && result.seekAmount !== null) {
      await report(agent.phone, agent.pin, {
        requestId,
        found: true,
        amount: result.seekAmount,
      });
      onProgress({ requestId, stage: "confirmed", amount: result.seekAmount });
      return;
    }
  } catch (error) {
    // Could not drive telebirr at all — accessibility off, telebirr missing,
    // sign-in failed. The customer is told to wait rather than told "no such
    // reference", which would be a different and wrong answer.
    const reason = error instanceof Error ? error.message : "The telebirr read failed.";
    await report(agent.phone, agent.pin, { requestId, found: false, reason });
    onProgress({ requestId, stage: "failed", reason });
    return;
  }

  if (!match) {
    // Nothing was read at all — a different answer from "not there", and the
    // only one that is AutoPilot's fault rather than the customer's.
    if (pool.length === 0) {
      const reason = "Could not read the telebirr transaction list.";
      await report(agent.phone, agent.pin, { requestId, found: false, reason });
      onProgress({ requestId, stage: "failed", reason });
      return;
    }

    // Receipts were read — either from the list, or by opening them — and this
    // reference was on none of them. If the opening hit its cap there may be
    // older ones it never reached, so say so rather than claiming certainty.
    if (!exhausted) {
      const reason = `Checked the ${opened} most recent receipts and did not find it.`;
      await report(agent.phone, agent.pin, { requestId, found: false, reason });
      onProgress({ requestId, stage: "failed", reason });
      return;
    }

    await report(agent.phone, agent.pin, { requestId, found: false });
    onProgress({ requestId, stage: "not_found" });
    return;
  }

  // Only money that came IN can settle a deposit: a payment the agent sent out
  // carries a receipt number too, and must never confirm someone's deposit.
  if (match.value <= 0) {
    await report(agent.phone, agent.pin, { requestId, found: false });
    onProgress({ requestId, stage: "not_found" });
    return;
  }

  await report(agent.phone, agent.pin, { requestId, found: true, amount: match.value });
  onProgress({ requestId, stage: "confirmed", amount: match.value });
}

interface Report {
  requestId: string;
  found: boolean;
  amount?: number;
  reason?: string;
}

/** Tells the server how it went. Credentials go with it, as everywhere else. */
async function report(phone: string, pin: string, body: Report): Promise<void> {
  try {
    await postJson("/api/agents/deposit/resolve", { phone, pin, ...body });
  } catch {
    // The customer's page will time out on its own; nothing here can fix a
    // server that cannot be reached, and throwing would lose the queue.
  }
}

/**
 * Every request this app has already taken on.
 *
 * The same requestId can arrive more than once — a socket that reconnects, a
 * duplicate emit, an effect that re-runs in development — and each arrival
 * would otherwise drive telebirr again for a check that is already answered.
 * The server refuses the second answer either way, but the point is not to open
 * telebirr for it at all.
 */
const handled = new Set<string>();

export function queueLookup(
  requestId: string,
  reference: string,
  onProgress: (progress: ConfirmProgress) => void,
): void {
  if (handled.has(requestId)) return;
  handled.add(requestId);

  onProgress({ requestId, stage: "queued" });

  // `queueTelebirr` inside runLookup does the serialising, so this only has to
  // catch what escapes: a failure here still has to reach the screen.
  runLookup(requestId, reference, onProgress).catch((error) => {
    onProgress({
      requestId,
      stage: "failed",
      reason: error instanceof Error ? error.message : "Something went wrong.",
    });
  });
}


/** One row of the agent's server-side history. */
export interface StoredRequest {
  requestId: string;
  reference: string;
  status: "PENDING" | "CONFIRMED" | "NOT_FOUND" | "FAILED";
  amount: number | null;
  reason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * The agent's checks as the server has them.
 *
 * Read on start so the list is the server's record rather than whatever the
 * app happened to keep, and so a check answered while the app was closed still
 * shows. Returns null when it cannot be reached — the caller keeps what it has.
 */
export async function fetchHistory(phone: string, pin: string): Promise<StoredRequest[] | null> {
  try {
    const result = await postJson<{ requests: StoredRequest[] }>(
      "/api/agents/deposit/history",
      { phone, pin },
    );
    return result.requests;
  } catch {
    return null;
  }
}

/** Marks a request as already dealt with, so restoring history never re-runs it. */
export function markHandled(requestId: string): void {
  handled.add(requestId);
}
