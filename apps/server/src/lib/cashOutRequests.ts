import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";

/**
 * Cash-outs handed to an agent's handset.
 *
 * The mirror of depositRequests.ts, and a row for the same reasons — it outlives
 * a restart on either side, it is the history the agent's app and the office
 * read back, and it makes the handset's report idempotent.
 *
 * One reason is its own, though, and it is the important one: this is the only
 * record anywhere that money left the agent's float. telebirr tells nobody but
 * the handset that drove it, so before this row existed a payout lived solely in
 * one phone's local storage — gone with a reinstall, and invisible to the office.
 */

/**
 * How long a handset has to make the transfer before the request is abandoned.
 *
 * Generous: a payout signs in, walks four screens and enters a PIN, and it
 * queues behind any read already driving telebirr.
 */
export const CASHOUT_TTL_MS = 10 * 60 * 1000;

export function isExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > CASHOUT_TTL_MS;
}

/**
 * Opens a cash-out and returns the row.
 *
 * The requestId is issued here rather than by the caller: unlike a deposit
 * check, the customer's page does not invent one, and the handset needs a
 * durable id to report against.
 */
export async function openCashOut(input: { agentId: string; phone: string; amount: number }) {
  return prisma.cashOutRequest.create({
    data: { ...input, requestId: `cashout-${randomUUID()}` },
  });
}

export type CashOutOutcome =
  | { status: "SENT"; balanceAfter?: number }
  | { status: "FAILED"; reason: string };

export type CashOutResolveResult =
  | { ok: true; request: Awaited<ReturnType<typeof openCashOut>> }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_RESOLVED"; status?: string };

/**
 * Records the handset's report, once.
 *
 * As with deposits, the status guard lives in the `updateMany` filter rather
 * than in a read followed by a write, so two reports racing cannot both pass —
 * the database picks a winner and the loser is told it already happened. That
 * matters more here than anywhere else: the second report would otherwise
 * rewrite the record of a transfer that has already been made.
 *
 * Deliberately NOT expiry-guarded. A deposit check that answers late is merely
 * stale, but a cash-out that reports late still moved real money, and the row
 * has to record that however long it took.
 */
export async function resolveCashOut(
  requestId: string,
  agentId: string,
  outcome: CashOutOutcome,
): Promise<CashOutResolveResult> {
  const existing = await prisma.cashOutRequest.findUnique({ where: { requestId } });

  // An agent may only report on what was sent to them: an id belonging to
  // someone else is indistinguishable from one that does not exist.
  if (!existing || existing.agentId !== agentId) return { ok: false, code: "NOT_FOUND" };
  if (existing.status !== "PENDING") {
    return { ok: false, code: "ALREADY_RESOLVED", status: existing.status };
  }

  const { count } = await prisma.cashOutRequest.updateMany({
    where: { requestId, agentId, status: "PENDING" },
    data: {
      status: outcome.status,
      reason: outcome.status === "FAILED" ? outcome.reason : null,
      balanceAfter: outcome.status === "SENT" ? outcome.balanceAfter ?? null : null,
      resolvedAt: new Date(),
    },
  });

  if (count === 0) {
    const now = await prisma.cashOutRequest.findUnique({ where: { requestId } });
    return { ok: false, code: "ALREADY_RESOLVED", status: now?.status };
  }

  return {
    ok: true,
    request: await prisma.cashOutRequest.findUniqueOrThrow({ where: { requestId } }),
  };
}

/** The agent's recent cash-outs, newest first — the history their app restores. */
export function recentCashOuts(agentId: string, take = 50) {
  return prisma.cashOutRequest.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Payouts whose handset never reported, aged past the deadline.
 *
 * Marked FAILED only so the list stops showing them as still running. The wording
 * says what is actually known — that the phone went quiet, NOT that the money
 * stayed put — because from here those two cannot be told apart.
 */
export async function expireStaleCashOuts(agentId: string): Promise<void> {
  await prisma.cashOutRequest.updateMany({
    where: {
      agentId,
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - CASHOUT_TTL_MS) },
    },
    data: {
      status: "FAILED",
      reason: "The phone never reported back — check telebirr before re-sending.",
      resolvedAt: new Date(),
    },
  });
}
