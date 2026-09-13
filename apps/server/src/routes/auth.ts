import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword, signToken, verifyPassword } from "../lib/auth.js";
import { requireAuth } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  phone: z.string().trim().min(4),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(72),
});

/** Everything the console needs about the signed-in admin. */
const publicFields = {
  id: true,
  phone: true,
  name: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_CREDENTIALS" });
  }

  const { phone, password } = parsed.data;
  const admin = await prisma.adminUser.findUnique({ where: { phone } });

  // One message for both halves, so this cannot be used to enumerate accounts.
  if (!admin || !verifyPassword(password, admin.passwordHash)) {
    return res.status(401).json({ error: "INVALID_CREDENTIALS" });
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  const token = signToken({ sub: admin.id, phone: admin.phone, role: admin.role });

  res.json({
    token,
    admin: {
      id: admin.id,
      phone: admin.phone,
      name: admin.name,
      role: admin.role,
    },
  });
});

/** Confirms a stored token is still good, and refreshes the cached profile. */
authRouter.get("/me", requireAuth, async (req, res) => {
  const admin = await prisma.adminUser.findUnique({
    where: { id: req.admin!.sub },
    select: publicFields,
  });

  if (!admin) return res.status(401).json({ error: "UNAUTHORIZED" });
  res.json(admin);
});

authRouter.post("/password", requireAuth, async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  const admin = await prisma.adminUser.findUnique({ where: { id: req.admin!.sub } });
  if (!admin) return res.status(401).json({ error: "UNAUTHORIZED" });

  if (!verifyPassword(parsed.data.currentPassword, admin.passwordHash)) {
    return res.status(400).json({ error: "WRONG_PASSWORD" });
  }

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: { passwordHash: hashPassword(parsed.data.newPassword) },
  });

  res.json({ ok: true });
});

/**
 * Tokens are stateless, so signing out is the client dropping the token. The
 * endpoint exists so the console has one thing to call.
 */
authRouter.post("/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});
