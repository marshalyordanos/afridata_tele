import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { prisma } from "../prisma.js";

export const transactionsRouter = Router();

const transferSchema = z.object({
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  amount: z.number().positive(),
  note: z.string().max(140).optional(),
});

transactionsRouter.get("/", async (_req, res) => {
  const transactions = await prisma.transaction.findMany({
    orderBy: { createdAt: "desc" },
    include: { sender: true, receiver: true },
  });
  res.json(transactions);
});

transactionsRouter.post("/transfer", async (req, res) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const { senderId, receiverId, amount, note } = parsed.data;
  if (senderId === receiverId) {
    return res.status(400).json({ error: "Sender and receiver must differ" });
  }

  try {
    // Debit, credit and the ledger row all land together or not at all.
    const transaction = await prisma.$transaction(async (tx) => {
      const sender = await tx.user.findUnique({ where: { id: senderId } });
      const receiver = await tx.user.findUnique({ where: { id: receiverId } });

      if (!sender) throw new Error("SENDER_NOT_FOUND");
      if (!receiver) throw new Error("RECEIVER_NOT_FOUND");
      if (sender.balance < amount) throw new Error("INSUFFICIENT_FUNDS");

      await tx.user.update({
        where: { id: senderId },
        data: { balance: { decrement: amount } },
      });

      await tx.user.update({
        where: { id: receiverId },
        data: { balance: { increment: amount } },
      });

      return tx.transaction.create({
        data: {
          amount,
          note,
          senderId,
          receiverId,
          status: "COMPLETED",
          reference: randomUUID(),
        },
        include: { sender: true, receiver: true },
      });
    });

    res.status(201).json(transaction);
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNKNOWN";
    if (code === "SENDER_NOT_FOUND" || code === "RECEIVER_NOT_FOUND") {
      return res.status(404).json({ error: code });
    }
    if (code === "INSUFFICIENT_FUNDS") {
      return res.status(400).json({ error: code });
    }
    throw error;
  }
});
