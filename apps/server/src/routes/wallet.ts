import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";

export const walletRouter = Router();

const checkSchema = z.object({
  userId: z.string().min(1),
  reference: z.string().min(4),
});

const withdrawSchema = z.object({
  userId: z.string().min(1),
  amount: z.number().positive(),
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
