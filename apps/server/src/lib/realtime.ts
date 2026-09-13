import type { Server as HttpServer } from "node:http";
import { Server as IOServer, type Socket } from "socket.io";
import { authenticateAgent } from "./agentAuth.js";
import { normalizePhone } from "./phone.js";

/**
 * Realtime push to enrolled handsets.
 *
 * An agent's phone opens one socket and is put in a room of its own, so a
 * customer's request reaches exactly the agent they picked and nobody else.
 */

/**
 * What the handset receives on `customer:request`.
 *
 * Two shapes, one event, so the phone keeps a single ordered list of things
 * customers have asked for. Neither carries a verified figure: the server never
 * sees the telebirr payment, so a deposit is only the reference the customer
 * typed, and a withdrawal only the amount they asked for. The agent settles
 * both against their own telebirr account.
 */
export type CustomerRequest =
  | {
      kind: "deposit";
      agentId: string;
      at: number;
      reference: string;
      /** What the handset quotes back when it reports the lookup's outcome. */
      requestId: string;
    }
  | {
      kind: "withdrawal";
      agentId: string;
      at: number;
      amount: number;
      /** The customer's own number, canonical +251 — where the cash-out goes. */
      phone: string;
    };

/**
 * The outcome of a deposit check, sent back to the customer's page.
 *
 * `confirmed` means the agent's phone found that reference in its own telebirr
 * history and read this amount off it — the only kind of confirmation in the
 * system, since the server never sees telebirr.
 */
export type DepositOutcome =
  | { requestId: string; status: "confirmed"; reference: string; amount: number }
  | { requestId: string; status: "not_found"; reference: string }
  | { requestId: string; status: "failed"; reference: string; reason: string };

/** One room per agent, and one per in-flight request the customer waits on. */
const roomFor = (agentId: string) => `agent:${agentId}`;
const requestRoom = (requestId: string) => `request:${requestId}`;

/**
 * A customer socket may only ever watch requests it has ids for, and only so
 * many, so one connection cannot sit in thousands of rooms.
 */
const MAX_WATCHED = 20;
const REQUEST_ID = /^[a-zA-Z0-9-]{8,64}$/;

let io: IOServer | null = null;

/**
 * Binds socket.io to the HTTP server.
 *
 * The handset authenticates in the handshake with the same phone + PIN it
 * enrolled with, through the same throttled check the enrol route uses — a
 * socket is a login, so it cannot be the unguarded way in.
 */
export function initRealtime(server: HttpServer): IOServer {
  io = new IOServer(server, {
    // Same open policy as the REST API above it; tighten both together.
    cors: { origin: "*" },
  });

  io.use(async (socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as {
      role?: unknown;
      phone?: unknown;
      pin?: unknown;
    };

    // A customer's page proves nothing and is granted nothing: it may listen to
    // requests whose ids it already holds, and cannot join an agent's room or
    // send anything that moves money.
    if (auth.role === "customer") {
      socket.data.role = "customer";
      return next();
    }

    const rawPhone = typeof auth.phone === "string" ? auth.phone : "";
    const pin = typeof auth.pin === "string" ? auth.pin : "";

    const phone = normalizePhone(rawPhone);
    if (!phone || !/^\d{6}$/.test(pin)) {
      return next(new Error("INVALID_CREDENTIALS"));
    }

    const result = await authenticateAgent(phone, pin);
    if (!result.ok) return next(new Error(result.code));

    // Stashed so the connect handler knows which room to join without a
    // second lookup, and so the client cannot name its own room.
    socket.data.role = "agent";
    socket.data.agentId = result.agent.id;
    socket.data.agentPhone = result.agent.phone;
    next();
  });

  io.on("connection", (socket: Socket) => {
    if (socket.data.role === "customer") {
      let watched = 0;
      socket.on("watch", (requestId: unknown) => {
        if (typeof requestId !== "string" || !REQUEST_ID.test(requestId)) return;
        if (watched >= MAX_WATCHED) return;
        watched += 1;
        socket.join(requestRoom(requestId));
      });
      socket.emit("ready", { role: "customer" });
      return;
    }

    const agentId = socket.data.agentId as string;
    socket.join(roomFor(agentId));
    socket.emit("ready", { agentId });
    console.log(`[realtime] agent ${socket.data.agentPhone} connected`);

    socket.on("disconnect", (reason) => {
      console.log(`[realtime] agent ${socket.data.agentPhone} left (${reason})`);
    });
  });

  return io;
}

/**
 * Pushes a customer's request to one agent's handsets.
 *
 * Returns how many sockets were in the room, so a caller can tell "delivered"
 * from "the agent's phone is not connected". Never throws: a notification
 * failing must not fail the customer's request.
 */
export async function notifyAgent(event: CustomerRequest): Promise<number> {
  if (!io) return 0;
  try {
    const room = roomFor(event.agentId);
    const sockets = await io.in(room).fetchSockets();
    io.to(room).emit("customer:request", event);
    return sockets.length;
  } catch (error) {
    console.error("[realtime] could not notify agent", error);
    return 0;
  }
}

/**
 * Tells the customer's page how their check turned out. Same never-throws rule
 * as above: a page that has closed its tab must not fail the agent's report.
 */
export function resolveDepositForCustomer(outcome: DepositOutcome): void {
  if (!io) return;
  try {
    io.to(requestRoom(outcome.requestId)).emit("deposit:resolved", outcome);
  } catch (error) {
    console.error("[realtime] could not resolve deposit", error);
  }
}

/**
 * The settled check, pushed back to the agent's own handsets.
 *
 * The phone that ran the lookup already knows how it went, but this is the
 * server's word for it, and it is what reaches the agent's other devices and a
 * phone that reconnected in the middle. Sending the whole row keeps the app's
 * list the same shape as the history endpoint's.
 */
export interface SettledRequest {
  requestId: string;
  reference: string;
  status: "CONFIRMED" | "NOT_FOUND" | "FAILED";
  amount: number | null;
  reason: string | null;
  resolvedAt: string | null;
}

export async function notifyAgentOfOutcome(
  agentId: string,
  request: {
    requestId: string;
    reference: string;
    status: string;
    amount: number | null;
    reason: string | null;
    resolvedAt: Date | null;
  },
): Promise<void> {
  if (!io) return;
  try {
    const payload: SettledRequest = {
      requestId: request.requestId,
      reference: request.reference,
      status: request.status as SettledRequest["status"],
      amount: request.amount,
      reason: request.reason,
      resolvedAt: request.resolvedAt ? request.resolvedAt.toISOString() : null,
    };
    io.to(roomFor(agentId)).emit("deposit:settled", payload);
  } catch (error) {
    console.error("[realtime] could not push outcome", error);
  }
}
