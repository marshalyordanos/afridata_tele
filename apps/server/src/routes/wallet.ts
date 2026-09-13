import { Router, type Response } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";
import { notifyAgent } from "../lib/realtime.js";
import { openRequest } from "../lib/depositRequests.js";
import { phoneSchema } from "../lib/phone.js";

export const walletRouter = Router();

const checkSchema = z.object({
  userId: z.string().min(1),
  reference: z.string().min(4),
});

const withdrawSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
});

const agentIdSchema = z.string().min(1);

/**
 * Turns a failed parse into one slug the client can show a message for.
 *
 * The raw flattened issue tree is no use to a customer-facing page — it can
 * only render what it recognises — so the field that failed becomes the code.
 */
function inputError(error: z.ZodError): string {
  const fields = z.flattenError(error).fieldErrors as Record<string, unknown>;
  if (fields.phone) return "INVALID_PHONE";
  if (fields.amount) return "INVALID_AMOUNT";
  if (fields.reference) return "INVALID_REFERENCE";
  return "INVALID_BODY";
}

const depositNoticeSchema = z.object({
  /** Whatever the customer typed. The server never checks it — the phone does. */
  reference: z.string().trim().min(1).max(64),
  agentId: agentIdSchema,
  /**
   * The customer's page makes this up and is already listening on it, so the
   * answer has somewhere to go the instant the handset reports back.
   */
  requestId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
});

const withdrawNoticeSchema = z.object({
  /** The customer's own telebirr number — the agent sends the cash-out to it. */
  phone: phoneSchema,
  /** What the customer wants in cash. Capped only to keep typos out. */
  amount: z.number().positive().max(1_000_000),
  agentId: agentIdSchema,
});

/**
 * The agent a customer named, if they are real and can still take business.
 *
 * Checking separates "the agent's phone is offline" from "that agent does not
 * exist", which the `notified` flag alone could not tell apart. Writes the
 * response and returns null when there is nothing to notify.
 */
async function resolveAgent(agentId: string, res: Response) {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { id: true, status: true },
  });

  if (!agent) {
    res.status(404).json({ error: "AGENT_NOT_FOUND" });
    return null;
  }
  if (agent.status !== "ACTIVE") {
    res.status(403).json({ error: "AGENT_NOT_ACTIVE" });
    return null;
  }
  return agent;
}

/**
 * Hands a reference number to the agent's handset to look up.
 *
 * The server cannot confirm a reference — it never sees telebirr. So this only
 * starts the round trip: the phone opens telebirr, finds the transaction and
 * reports back through `/api/agents/deposit/resolve`, which is what the
 * customer's page is waiting on. Returning here means "asked", not "confirmed".
 */
walletRouter.post("/deposit/notify", async (req, res) => {
  const parsed = depositNoticeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: inputError(parsed.error) });
  }

  const agent = await resolveAgent(parsed.data.agentId, res);
  if (!agent) return;

  const { reference, requestId } = parsed.data;
  await openRequest({ requestId, agentId: agent.id, reference });

  const delivered = await notifyAgent({
    kind: "deposit",
    reference,
    requestId,
    agentId: agent.id,
    at: Date.now(),
  });

  res.json({ reference, requestId, notified: delivered > 0 });
});

/**
 * Asks an agent for cash out.
 *
 * The mirror of the deposit above and just as unverified: there is no customer
 * account here, so no balance to debit and nothing to check the amount against.
 * The customer gives the agent their own number and what they want in cash; it
 * lands on the agent's phone, and the agent pays out — or does not — on their
 * own judgement. `/withdraw` below is the one that actually moves money, once
 * there is a customer account behind it.
 */
walletRouter.post("/withdraw/notify", async (req, res) => {
  const parsed = withdrawNoticeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: inputError(parsed.error) });
  }

  const agent = await resolveAgent(parsed.data.agentId, res);
  if (!agent) return;

  const delivered = await notifyAgent({
    kind: "withdrawal",
    amount: parsed.data.amount,
    phone: parsed.data.phone,
    agentId: agent.id,
    at: Date.now(),
  });

  res.json({ amount: parsed.data.amount, phone: parsed.data.phone, notified: delivered > 0 });
});

/**
 * Look up a deposit by its reference number and credit it to the chosen user.
 * The lookup and the credit share one transaction so a reference cannot be
 * claimed twice.
 */
walletRouter.post("/deposit/check", async (req, res) => {
  const parsed = checkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { userId, reference } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("USER_NOT_FOUND");

      const deposit = await tx.deposit.findUnique({
        where: { reference: reference.trim() },
      });
      if (!deposit) throw new Error("REFERENCE_NOT_FOUND");
      if (deposit.status === "CLAIMED") throw new Error("ALREADY_CLAIMED");

      await tx.deposit.update({
        where: { id: deposit.id },
        data: { status: "CLAIMED", claimedAt: new Date(), userId },
      });

      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { increment: deposit.amount } },
      });

      return { amount: deposit.amount, reference: deposit.reference, balance: updated.balance };
    });

    res.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "USER_NOT_FOUND" || code === "REFERENCE_NOT_FOUND") {
      return res.status(404).json({ error: code });
    }
    if (code === "ALREADY_CLAIMED") {
      return res.status(409).json({ error: code });
    }
    throw error;
  }
});

walletRouter.post("/withdraw", async (req, res) => {
  const parsed = withdrawSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { userId, amount } = parsed.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error("USER_NOT_FOUND");
      if (user.balance < amount) throw new Error("INSUFFICIENT_FUNDS");

      const updated = await tx.user.update({
        where: { id: userId },
        data: { balance: { decrement: amount } },
      });

      const withdrawal = await tx.withdrawal.create({
        data: { amount, userId, reference: randomUUID().slice(0, 8).toUpperCase() },
      });

      return { amount, reference: withdrawal.reference, balance: updated.balance };
    });

    res.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "USER_NOT_FOUND") return res.status(404).json({ error: code });
    if (code === "INSUFFICIENT_FUNDS") return res.status(400).json({ error: code });
    throw error;
  }
});
