import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { phoneSchema } from "../lib/phone.js";
import { Prisma } from "../generated/prisma/client.js";
import { requireAuth } from "../middleware/auth.js";
import {
  expireStaleCashOuts,
  recentCashOuts,
  resolveCashOut,
} from "../lib/cashOutRequests.js";
import { authenticateAgent } from "../lib/agentAuth.js";
import {
  expireStale,
  recentRequests,
  resolveRequest,
  type ResolveOutcome,
} from "../lib/depositRequests.js";
import { notifyAgentOfOutcome, resolveDepositForCustomer } from "../lib/realtime.js";

export const agentsRouter = Router();

const STATUSES = ["PENDING", "ACTIVE", "SUSPENDED"] as const;
const SORTABLE = ["createdAt", "fullName", "balance", "status"] as const;

const optionalText = z.string().trim().max(120).optional().nullable();

/** The Telebirr handset PIN: exactly six digits, or cleared with null/"". */
const pinSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value == null || /^\d{6}$/.test(value), {
    message: "The PIN must be exactly 6 digits.",
  });

/**
 * Handset enrolment.
 *
 * The only agent-facing endpoint: an agent signs in on the mobile app with the
 * phone number and six-digit Telebirr PIN an admin already registered for them,
 * and the app stores what comes back as its credentials. Deliberately placed
 * ABOVE `agentsRouter.use(requireAuth)` below, because the agent on the handset
 * has no admin session — everything after that line stays admin-only.
 */
const enrollSchema = z.object({
  phone: phoneSchema,
  pin: z.string().trim().regex(/^\d{6}$/, "The PIN must be exactly 6 digits."),
});

/** POST /api/agents/enroll — public: phone + PIN from the handset. */
agentsRouter.post("/enroll", async (req, res) => {
  const parsed = enrollSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  const { phone, pin } = parsed.data;
  const result = await authenticateAgent(phone, pin);

  if (!result.ok) {
    if (result.code === "TOO_MANY_ATTEMPTS") {
      return res
        .status(429)
        .json({ error: result.code, retryAfterSeconds: result.retryAfterSeconds });
    }
    if (result.code === "AGENT_NOT_ACTIVE") {
      return res.status(403).json({ error: result.code, status: result.status });
    }
    return res.status(401).json({ error: result.code });
  }

  const { agent } = result;

  // The PIN is never echoed back — the handset already has the one it sent.
  res.json({
    id: agent.id,
    phone: agent.phone,
    fullName: agent.fullName,
    businessName: agent.businessName,
    status: agent.status,
    commissionRate: agent.commissionRate,
  });
});

/**
 * The handset's report on a deposit check.
 *
 * `found` is the phone's answer after it opened telebirr and searched its own
 * transaction history. It is the only confirmation the system has, so the
 * handset authenticates with the same phone + PIN as everywhere else — nobody
 * else may declare a stranger's deposit confirmed.
 */
const resolveDepositSchema = z
  .object({
    phone: phoneSchema,
    pin: z.string().trim().regex(/^\d{6}$/, "The PIN must be exactly 6 digits."),
    requestId: z.string().regex(/^[a-zA-Z0-9-]{8,64}$/),
    found: z.boolean(),
    /** Required when found: what telebirr says the transaction was worth. */
    amount: z.number().positive().max(10_000_000).optional(),
    /** Why the lookup could not run at all, e.g. accessibility switched off. */
    reason: z.string().trim().max(200).optional(),
  })
  .refine((value) => !value.found || typeof value.amount === "number", {
    message: "A confirmed deposit must carry the amount telebirr showed.",
    path: ["amount"],
  });

/** POST /api/agents/deposit/resolve — public: phone + PIN from the handset. */
agentsRouter.post("/deposit/resolve", async (req, res) => {
  const parsed = resolveDepositSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  const { phone, pin, requestId, found, amount, reason } = parsed.data;

  const auth = await authenticateAgent(phone, pin);
  if (!auth.ok) {
    if (auth.code === "TOO_MANY_ATTEMPTS") {
      return res.status(429).json({ error: auth.code, retryAfterSeconds: auth.retryAfterSeconds });
    }
    if (auth.code === "AGENT_NOT_ACTIVE") {
      return res.status(403).json({ error: auth.code, status: auth.status });
    }
    return res.status(401).json({ error: auth.code });
  }

  // The row decides, not the phone: only the agent it was sent to can answer,
  // and only while it is still PENDING. A handset that retries — a flaky
  // network, a reconnect — gets told it already happened rather than banking
  // the same deposit twice.
  const outcome: ResolveOutcome = found
    ? { status: "CONFIRMED", amount: amount! }
    : reason
      ? { status: "FAILED", reason }
      : { status: "NOT_FOUND" };

  const result = await resolveRequest(requestId, auth.agent.id, outcome);

  if (!result.ok) {
    if (result.code === "ALREADY_RESOLVED") {
      return res.status(409).json({ error: result.code, status: result.status });
    }
    if (result.code === "EXPIRED") return res.status(410).json({ error: result.code });
    return res.status(404).json({ error: "REQUEST_NOT_FOUND" });
  }

  const request = result.request;

  if (request.status !== "CONFIRMED") {
    const settled =
      request.status === "FAILED"
        ? ({
            requestId,
            status: "failed",
            reference: request.reference,
            reason: request.reason ?? "The telebirr read failed.",
          } as const)
        : ({ requestId, status: "not_found", reference: request.reference } as const);

    resolveDepositForCustomer(settled);
    await notifyAgentOfOutcome(auth.agent.id, request);
    return res.json({ ok: true, status: request.status });
  }

  // The durable record of the money itself. Upsert rather than create because a
  // reference is unique and the same one may be checked again later — that must
  // not 500, and must not overwrite an amount already banked against it.
  const deposit = await prisma.deposit.upsert({
    where: { reference: request.reference },
    update: {},
    create: { reference: request.reference, amount: request.amount! },
  });

  resolveDepositForCustomer({
    requestId,
    status: "confirmed",
    reference: deposit.reference,
    amount: deposit.amount,
  });
  await notifyAgentOfOutcome(auth.agent.id, request);

  res.json({ ok: true, status: "confirmed", amount: deposit.amount });
});

/**
 * POST /api/agents/deposit/history — the agent's own recent checks.
 *
 * Same phone + PIN as everywhere else. The handset calls this on start so its
 * list is the server's record rather than whatever happened to be in the app's
 * storage, and so a check answered while the app was closed still shows.
 */
const historySchema = z.object({
  phone: phoneSchema,
  pin: z.string().trim().regex(/^\d{6}$/, "The PIN must be exactly 6 digits."),
});

agentsRouter.post("/deposit/history", async (req, res) => {
  const parsed = historySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  const auth = await authenticateAgent(parsed.data.phone, parsed.data.pin);
  if (!auth.ok) {
    if (auth.code === "TOO_MANY_ATTEMPTS") {
      return res.status(429).json({ error: auth.code, retryAfterSeconds: auth.retryAfterSeconds });
    }
    return res.status(auth.code === "AGENT_NOT_ACTIVE" ? 403 : 401).json({ error: auth.code });
  }

  // Anything the phone never answered is closed off first, so the list cannot
  // show a check that has been "checking telebirr" since yesterday.
  await expireStale(auth.agent.id);

  res.json({ requests: await recentRequests(auth.agent.id) });
});

/**
 * POST /api/agents/cashout/resolve — public: phone + PIN from the handset.
 *
 * How a payout stops being "pending" in the record. The handset is the only
 * thing that knows whether telebirr actually made the transfer, so this is the
 * one report there is, and the row refuses a second one.
 */
const resolveCashOutSchema = z
  .object({
    phone: phoneSchema,
    pin: z.string().trim().regex(/^\d{6}$/, "The PIN must be exactly 6 digits."),
    requestId: z.string().trim().min(8).max(80),
    sent: z.boolean(),
    /** telebirr's balance after the send, when the handset could read it. */
    balanceAfter: z.number().optional(),
    reason: z.string().trim().max(500).optional(),
  })
  // A failure has to say why: "it did not work" with no reason is the one
  // outcome nobody can act on afterwards.
  .refine((value) => value.sent || !!value.reason, {
    message: "A failed cash-out must carry a reason.",
    path: ["reason"],
  });

agentsRouter.post("/cashout/resolve", async (req, res) => {
  const parsed = resolveCashOutSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  const { phone, pin, requestId, sent, balanceAfter, reason } = parsed.data;

  const auth = await authenticateAgent(phone, pin);
  if (!auth.ok) {
    if (auth.code === "TOO_MANY_ATTEMPTS") {
      return res.status(429).json({ error: auth.code, retryAfterSeconds: auth.retryAfterSeconds });
    }
    if (auth.code === "AGENT_NOT_ACTIVE") {
      return res.status(403).json({ error: auth.code, status: auth.status });
    }
    return res.status(401).json({ error: auth.code });
  }

  const result = await resolveCashOut(
    requestId,
    auth.agent.id,
    sent ? { status: "SENT", balanceAfter } : { status: "FAILED", reason: reason! },
  );

  if (!result.ok) {
    return res
      .status(result.code === "NOT_FOUND" ? 404 : 409)
      .json({ error: result.code, status: result.status });
  }

  res.json({ request: result.request });
});

/**
 * POST /api/agents/cashout/history — the agent's own recent cash-outs.
 *
 * The other half of what the app's notification list restores from. Without it
 * a payout lived only in one phone's storage, so a reinstall — or simply a
 * second device — lost every record that money had gone out.
 */
agentsRouter.post("/cashout/history", async (req, res) => {
  const parsed = historySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY" });
  }

  const auth = await authenticateAgent(parsed.data.phone, parsed.data.pin);
  if (!auth.ok) {
    if (auth.code === "TOO_MANY_ATTEMPTS") {
      return res.status(429).json({ error: auth.code, retryAfterSeconds: auth.retryAfterSeconds });
    }
    return res.status(auth.code === "AGENT_NOT_ACTIVE" ? 403 : 401).json({ error: auth.code });
  }

  // Anything the phone never reported is closed off first, so the list cannot
  // show a payout that has been "sending" since yesterday.
  await expireStaleCashOuts(auth.agent.id);

  res.json({ requests: await recentCashOuts(auth.agent.id) });
});

/**
 * GET /api/agents/active — public: the agents a customer may pay.
 *
 * The customer-facing web app has no admin session, so it cannot use the
 * paginated admin list below. Only ACTIVE agents appear, and only the fields
 * needed to pick one — never the PIN or the agent's balance.
 */
agentsRouter.get("/active", async (_req, res) => {
  const agents = await prisma.agent.findMany({
    where: { status: "ACTIVE" },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      phone: true,
      fullName: true,
      businessName: true,
      region: true,
      city: true,
    },
  });

  res.json(agents);
});

// Everything below this line is the admin console's, behind an admin session.
agentsRouter.use(requireAuth);

/**
 * The field rules, with no defaults attached. Defaults belong to create alone:
 * `.partial()` keeps a `.default()` wrapper, so a schema built by making the
 * create schema partial would quietly write the default for every key the
 * caller left out — a PATCH of one field would reset the rest of the row.
 */
const agentFields = {
  phone: phoneSchema,
  fullName: z.string().trim().min(2).max(120),
  pin: pinSchema,
  businessName: optionalText,
  region: optionalText,
  city: optionalText,
  status: z.enum(STATUSES),
  balance: z.number().nonnegative(),
  commissionRate: z.number().min(0).max(100),
  note: z.string().trim().max(500).optional().nullable(),
};

const createAgentSchema = z.object({
  ...agentFields,
  status: agentFields.status.default("PENDING"),
  balance: agentFields.balance.default(0),
  commissionRate: agentFields.commissionRate.default(0),
});

// Every field is optional on update, but an empty body is rejected below.
const updateAgentSchema = z.object(agentFields).partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().max(120).optional(),
  status: z.enum(STATUSES).optional(),
  sortBy: z.enum(SORTABLE).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

/** Turns a list query into the `where` both the page and the count share. */
function buildWhere(query: z.infer<typeof listQuerySchema>) {
  const where: Prisma.AgentWhereInput = {};

  if (query.status) where.status = query.status;

  if (query.search) {
    const contains = query.search;
    where.OR = [
      { fullName: { contains, mode: "insensitive" } },
      { phone: { contains } },
      { pin: { contains } },
      { businessName: { contains, mode: "insensitive" } },
      { city: { contains, mode: "insensitive" } },
      { region: { contains, mode: "insensitive" } },
    ];
  }

  return where;
}

/** Prisma's unique-constraint failure, which here can only be the phone. */
function isDuplicatePhone(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isMissingRecord(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** GET /api/agents — paginated, searchable, sortable list. */
agentsRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_QUERY", details: z.flattenError(parsed.error) });
  }

  const query = parsed.data;
  const where = buildWhere(query);

  const [total, items] = await Promise.all([
    prisma.agent.count({ where }),
    prisma.agent.findMany({
      where,
      orderBy: { [query.sortBy]: query.sortDir },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / query.pageSize));

  res.json({
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    pageCount,
    hasPrev: query.page > 1,
    hasNext: query.page < pageCount,
  });
});

/** GET /api/agents/stats — headline counts for the dashboard cards. */
agentsRouter.get("/stats", async (_req, res) => {
  const [total, grouped, balance] = await Promise.all([
    prisma.agent.count(),
    prisma.agent.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.agent.aggregate({ _sum: { balance: true } }),
  ]);

  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0])) as Record<
    (typeof STATUSES)[number],
    number
  >;
  for (const row of grouped) byStatus[row.status] = row._count._all;

  res.json({ total, byStatus, totalBalance: balance._sum.balance ?? 0 });
});

agentsRouter.get("/:id", async (req, res) => {
  const agent = await prisma.agent.findUnique({ where: { id: req.params.id } });
  if (!agent) return res.status(404).json({ error: "AGENT_NOT_FOUND" });
  res.json(agent);
});

/** POST /api/agents — register a new agent. */
agentsRouter.post("/", async (req, res) => {
  const parsed = createAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }

  try {
    const agent = await prisma.agent.create({ data: parsed.data });
    res.status(201).json(agent);
  } catch (error) {
    if (isDuplicatePhone(error)) {
      return res.status(409).json({ error: "PHONE_TAKEN" });
    }
    throw error;
  }
});

agentsRouter.patch("/:id", async (req, res) => {
  const parsed = updateAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "INVALID_BODY", details: z.flattenError(parsed.error) });
  }
  const data = Object.fromEntries(
    Object.entries(parsed.data).filter(([, value]) => value !== undefined),
  );

  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: "EMPTY_UPDATE" });
  }

  try {
    const agent = await prisma.agent.update({
      where: { id: req.params.id },
      data,
    });
    res.json(agent);
  } catch (error) {
    if (isDuplicatePhone(error)) return res.status(409).json({ error: "PHONE_TAKEN" });
    if (isMissingRecord(error)) return res.status(404).json({ error: "AGENT_NOT_FOUND" });
    throw error;
  }
});

agentsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.agent.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (error) {
    if (isMissingRecord(error)) return res.status(404).json({ error: "AGENT_NOT_FOUND" });
    throw error;
  }
});
