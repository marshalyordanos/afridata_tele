import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { hashPassword } from "../lib/auth.js";
import { requireAuth, requireSuperAdmin } from "../middleware/auth.js";
import { Prisma } from "../generated/prisma/client.js";

export const adminsRouter = Router();

// Managing console users is a super-admin-only area, start to finish.
adminsRouter.use(requireAuth, requireSuperAdmin);

const ROLES = ["SUPER_ADMIN", "ADMIN"] as const;

/** Password hashes never leave the server. */
const publicFields = {
  id: true,
  phone: true,
  name: true,
  role: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Defaults stay out of the shared shape: `.partial()` preserves a `.default()`,
 * so an update built from the create schema would stamp `role: "ADMIN"` onto
 * every PATCH that omitted it — silently demoting a super admin who was only
 * having their name corrected.
 */
const adminFields = {
  phone: z.string().trim().min(4).max(20).regex(/^\+?\d+$/, "Digits only, optionally leading +."),
  name: z.string().trim().min(2).max(120),
  password: z.string().min(8, "Use at least 8 characters.").max(72),
  role: z.enum(ROLES),
};

const createAdminSchema = z.object({
  ...adminFields,
  role: adminFields.role.default("ADMIN"),
});

const updateAdminSchema = z.object(adminFields).partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional(),
  role: z.enum(ROLES).optional(),
});

function isDuplicatePhone(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isMissingRecord(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

adminsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY", details: z.flattenError(parsed.error) });
  }

  const { page, pageSize, search, role } = parsed.data;

  const where: Prisma.AdminUserWhereInput = {};
  if (role) where.role = role;
  if (search) {
    where.OR = [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }];
  }

  const [total, items] = await Promise.all([
    prisma.adminUser.count({ where }),
    prisma.adminUser.findMany({
      where,
      select: publicFields,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  res.json({
    items,
    page,
    pageSize,
    total,
    pageCount,
    hasPrev: page > 1,
    hasNext: page < pageCount,
  });
});

adminsRouter.post("/", async (req, res) => {
  const parsed = createAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  const { password, ...rest } = parsed.data;

  try {
    const admin = await prisma.adminUser.create({
      data: { ...rest, passwordHash: hashPassword(password) },
      select: publicFields,
    });
    res.status(201).json(admin);
  } catch (error) {
    if (isDuplicatePhone(error)) return res.status(409).json({ error: "PHONE_TAKEN" });
    throw error;
  }
});

adminsRouter.patch("/:id", async (req, res) => {
  const parsed = updateAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  const { password, ...rest } = parsed.data;
  const data: Prisma.AdminUserUpdateInput = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  );
  if (password) data.passwordHash = hashPassword(password);

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "EMPTY_UPDATE" });
  }

  // Demoting yourself would lock the last super admin out of this very page.
  if (req.params.id === req.admin!.sub && rest.role && rest.role !== "SUPER_ADMIN") {
    return res.status(400).json({ error: "CANNOT_DEMOTE_SELF" });
  }

  try {
    const admin = await prisma.adminUser.update({
      where: { id: req.params.id },
      data,
      select: publicFields,
    });
    res.json(admin);
  } catch (error) {
    if (isDuplicatePhone(error)) return res.status(409).json({ error: "PHONE_TAKEN" });
    if (isMissingRecord(error)) return res.status(404).json({ error: "ADMIN_NOT_FOUND" });
    throw error;
  }
});

adminsRouter.delete("/:id", async (req, res) => {
  if (req.params.id === req.admin!.sub) {
    return res.status(400).json({ error: "CANNOT_DELETE_SELF" });
  }

  try {
    await prisma.adminUser.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    if (isMissingRecord(error)) return res.status(404).json({ error: "ADMIN_NOT_FOUND" });
    throw error;
  }
});
