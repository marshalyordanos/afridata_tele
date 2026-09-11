import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";

export const usersRouter = Router();

const createUserSchema = z.object({
  phone: z.string().min(9),
  name: z.string().min(1),
  balance: z.number().nonnegative().optional(),
});

usersRouter.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  res.json(users);
});

usersRouter.get("/:id", async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.params.id },
    include: { sent: true, received: true },
  });

  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

usersRouter.post("/", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const user = await prisma.user.create({ data: parsed.data });
  res.status(201).json(user);
});
