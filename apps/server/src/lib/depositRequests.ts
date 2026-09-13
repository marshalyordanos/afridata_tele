import { prisma } from "../prisma.js";
import { Prisma } from "../generated/prisma/client.js";
import type { DepositRequestStatus } from "../generated/prisma/enums.js";

/**
 * Deposit checks waiting on an agent's handset.
 *
 * A customer's check is not answered by the server — it is answered by the
 * agent's phone, which opens telebirr, looks the reference up and reports back.
 * That round trip takes tens of seconds, so the request is a row for its whole
 * life: it survives a restart on either side, it is the history the agent's app
 * and the office read back, and it is what makes answering idempotent. A phone
 * that reports twice — a retry, a reconnect — cannot resolve the same check
 * twice, which is the difference between one deposit and two.
 */

/**
 * How long a handset has to answer before the check is abandoned.
 *
 * Long, because the phone may open twenty receipts in telebirr looking for the
 * reference. It has to outlast the customer page's own timeout, so that a slow
 * answer still lands on a request that is alive to receive it.
 */
export const REQUEST_TTL_MS = 5 * 60 * 1000;

export function isExpired(createdAt: Date): boolean {
  return Date.now() - createdAt.getTime() > REQUEST_TTL_MS;
}

/**
 * Opens a check. The requestId is the customer's, so a repeat of the same id is
 * a duplicate submission rather than a new check — the existing row is returned
 * so the caller can answer consistently instead of creating a second.
 */
export async function openRequest(input: {
  requestId: string;
  agentId: string;
  reference: string;
}) {
  try {
    return await prisma.depositRequest.create({ data: input });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.depositRequest.findUniqueOrThrow({ where: { requestId: input.requestId } });
    }
    throw error;
  }
}

export type ResolveOutcome =
  | { status: "CONFIRMED"; amount: number }
  | { status: "NOT_FOUND" }
  | { status: "FAILED"; reason: string };

export type ResolveResult =
  | { ok: true; request: Awaited<ReturnType<typeof openRequest>> }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_RESOLVED" | "EXPIRED"; status?: DepositRequestStatus };

/**
 * Records the handset's answer, once.
 *
 * The status guard is in the `updateMany` filter rather than in a read followed
 * by a write, so two reports racing each other cannot both pass the check —
 * the database decides which one wins, and the loser is told it already
 * happened rather than silently overwriting the first answer.
 */
export async function resolveRequest(
  requestId: string,
  agentId: string,
  outcome: ResolveOutcome,
): Promise<ResolveResult> {
  const existing = await prisma.depositRequest.findUnique({ where: { requestId } });

  // An agent may only answer what was sent to them: an id belonging to someone
  // else is indistinguishable from one that does not exist.
  if (!existing || existing.agentId !== agentId) return { ok: false, code: "NOT_FOUND" };
  if (existing.status !== "PENDING") {
    return { ok: false, code: "ALREADY_RESOLVED", status: existing.status };
  }
  if (isExpired(existing.createdAt)) return { ok: false, code: "EXPIRED" };

  const { count } = await prisma.depositRequest.updateMany({
    where: { requestId, agentId, status: "PENDING" },
    data: {
      status: outcome.status,
      amount: outcome.status === "CONFIRMED" ? outcome.amount : null,
      reason: outcome.status === "FAILED" ? outcome.reason : null,
      resolvedAt: new Date(),
    },
  });

  if (count === 0) {
    const now = await prisma.depositRequest.findUnique({ where: { requestId } });
    return { ok: false, code: "ALREADY_RESOLVED", status: now?.status };
  }

  return { ok: true, request: await prisma.depositRequest.findUniqueOrThrow({ where: { requestId } }) };
}

/** The agent's recent checks, newest first — the history their app restores. */
export function recentRequests(agentId: string, take = 50) {
  return prisma.depositRequest.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take,
  });
}

/**
 * Checks whose handset never answered, aged past the deadline. Marked FAILED so
 * the agent's history does not fill with rows that hang as "checking" forever.
 */
export async function expireStale(agentId: string): Promise<void> {
  await prisma.depositRequest.updateMany({
    where: {
      agentId,
      status: "PENDING",
      createdAt: { lt: new Date(Date.now() - REQUEST_TTL_MS) },
    },
    data: { status: "FAILED", reason: "The phone did not answer in time.", resolvedAt: new Date() },
  });
}
