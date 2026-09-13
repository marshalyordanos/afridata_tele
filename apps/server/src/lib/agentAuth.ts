import { prisma } from "../prisma.js";
import type { AgentModel } from "../generated/prisma/models.js";

/**
 * Phone + PIN verification for agents, shared by the enrolment route and the
 * realtime socket handshake.
 *
 * It lives here rather than in either caller so the two cannot drift, and more
 * importantly so they share ONE lockout counter: a per-route throttle would let
 * an attacker run the PIN space against whichever entry point was not counting.
 */

/**
 * A six-digit PIN is only a million guesses, so verification is throttled per
 * phone: five wrong PINs and that number is locked out for fifteen minutes.
 * In memory, which is enough for one server process — move it to the database
 * or a cache before running more than one.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; firstAt: number }>();

function lockedOutFor(phone: string): number {
  const record = attempts.get(phone);
  if (!record) return 0;
  const elapsed = Date.now() - record.firstAt;
  if (elapsed > LOCKOUT_MS) {
    attempts.delete(phone);
    return 0;
  }
  return record.count >= MAX_ATTEMPTS ? LOCKOUT_MS - elapsed : 0;
}

function recordFailure(phone: string): void {
  const record = attempts.get(phone);
  if (!record || Date.now() - record.firstAt > LOCKOUT_MS) {
    attempts.set(phone, { count: 1, firstAt: Date.now() });
    return;
  }
  record.count += 1;
}

export type AgentAuthResult =
  | { ok: true; agent: AgentModel }
  | { ok: false; code: "INVALID_CREDENTIALS" }
  | { ok: false; code: "AGENT_NOT_ACTIVE"; status: AgentModel["status"] }
  | { ok: false; code: "TOO_MANY_ATTEMPTS"; retryAfterSeconds: number };

/**
 * Checks a canonical +251 phone against its stored PIN.
 *
 * `phone` must already be normalised — callers parse it with the phone schema
 * so that the lockout counts one key per number rather than one per spelling.
 */
export async function authenticateAgent(phone: string, pin: string): Promise<AgentAuthResult> {
  const waitMs = lockedOutFor(phone);
  if (waitMs > 0) {
    return {
      ok: false,
      code: "TOO_MANY_ATTEMPTS",
      retryAfterSeconds: Math.ceil(waitMs / 1000),
    };
  }

  const agent = await prisma.agent.findUnique({ where: { phone } });

  // One answer for an unknown number and for a wrong PIN, so this cannot be
  // used to find out which numbers are registered.
  if (!agent || !agent.pin || agent.pin !== pin) {
    recordFailure(phone);
    return { ok: false, code: "INVALID_CREDENTIALS" };
  }

  if (agent.status !== "ACTIVE") {
    return { ok: false, code: "AGENT_NOT_ACTIVE", status: agent.status };
  }

  attempts.delete(phone);
  return { ok: true, agent };
}
