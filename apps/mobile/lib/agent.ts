import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ApiError, postJson } from "./api";

/**
 * The enrolled agent.
 *
 * Until an agent enrols, the app has no telebirr credentials at all: the phone
 * number and PIN the automation types come from here, not from a constant in
 * the source. An admin registers the agent in the console, and the agent then
 * signs in on the handset with that number and PIN.
 */
export interface Agent {
  id: string;
  /** Canonical +251XXXXXXXXX, as the server stores it. */
  phone: string;
  /** The nine digits after +251 — the only part telebirr's field wants. */
  phoneNationalDigits: string;
  fullName: string;
  businessName: string | null;
  /**
   * The six-digit Telebirr PIN. Kept on the device because the automation has
   * to type it into telebirr on every run; it is stored in the app's private
   * storage and is never sent anywhere except to the server that issued it.
   */
  pin: string;
  enrolledAt: number;
}

const KEY = "autopilot.agent";

/**
 * Everything watching the enrolled agent.
 *
 * Storage alone is not enough now that more than one thing depends on the
 * agent: the realtime socket holds the credentials open, so when an agent signs
 * out it has to hear about it and drop the connection rather than keep pushing
 * to a handset that is no longer theirs.
 */
type AgentListener = (agent: Agent | null) => void;
const listeners = new Set<AgentListener>();

function announce(agent: Agent | null): void {
  for (const listener of listeners) listener(agent);
}

/** Subscribe to enrolment changes; returns the unsubscribe. */
export function subscribeToAgent(listener: AgentListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Nine digits after +251, from any shape the server or a user gives us. */
export function nationalDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("251") ? digits.slice(3) : digits.replace(/^0/, "");
}

/** +251 and nine digits, from the nine digits a user typed. */
export function toCanonicalPhone(input: string): string {
  return `+251${nationalDigits(input)}`;
}

export async function loadAgent(): Promise<Agent | null> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const agent = JSON.parse(raw) as Agent;
    return agent?.pin && agent?.phoneNationalDigits ? agent : null;
  } catch {
    return null;
  }
}

export async function saveAgent(agent: Agent): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(agent));
  announce(agent);
}

export async function clearAgent(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
  announce(null);
}

/**
 * The credentials the telebirr automation runs with. Throws rather than falling
 * back to anything, so an un-enrolled handset can never drive someone else's
 * account — which is exactly what a hardcoded default would allow.
 */
export async function requireAgent(): Promise<Agent> {
  const agent = await loadAgent();
  if (!agent) {
    throw new Error("No agent is signed in on this phone. Enrol with your number and PIN first.");
  }
  return agent;
}

/** What the server returns from POST /api/agents/enroll. */
interface EnrollResponse {
  id: string;
  phone: string;
  fullName: string;
  businessName: string | null;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  commissionRate: number;
}

/**
 * Verifies phone + PIN against the server and, on success, stores them as this
 * handset's credentials. The message on failure is the one to show the agent.
 */
export async function enrollAgent(phoneInput: string, pin: string): Promise<Agent> {
  const phone = toCanonicalPhone(phoneInput);

  let result: EnrollResponse;
  try {
    result = await postJson<EnrollResponse>("/api/agents/enroll", { phone, pin });
  } catch (e) {
    throw new Error(enrollMessage(e));
  }

  const agent: Agent = {
    id: result.id,
    phone: result.phone,
    phoneNationalDigits: nationalDigits(result.phone),
    fullName: result.fullName,
    businessName: result.businessName ?? null,
    pin,
    enrolledAt: Date.now(),
  };
  await saveAgent(agent);
  return agent;
}

/** Server error slugs turned into something an agent can act on. */
function enrollMessage(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : String(error);
  }
  switch (error.code) {
    case "INVALID_CREDENTIALS":
      // Deliberately does not say which of the two was wrong — the server
      // answers the same way for an unknown number, and so should we.
      return "That number and PIN do not match a registered agent.";
    case "AGENT_NOT_ACTIVE":
      return error.body?.status === "SUSPENDED"
        ? "This agent account is suspended. Contact the office."
        : "This agent account is not activated yet. Contact the office.";
    case "TOO_MANY_ATTEMPTS": {
      const minutes = Math.max(1, Math.ceil((error.body?.retryAfterSeconds ?? 900) / 60));
      return `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    case "INVALID_BODY":
      return "Check the number and the six-digit PIN.";
    case "NO_API_URL":
      return "This build has no server address configured (EXPO_PUBLIC_API_URL).";
    default:
      return error.message;
  }
}

/** The enrolled agent for a screen, with a sign-out that clears the handset. */
export function useAgent() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const loaded = await loadAgent();
    setAgent(loaded);
    setLoading(false);
    return loaded;
  }, []);

  // Subscribing as well as reading keeps every screen and the socket in step:
  // enrolling or signing out anywhere updates all of them at once.
  useEffect(() => {
    refresh();
    return subscribeToAgent(setAgent);
  }, [refresh]);

  const signOut = useCallback(async () => {
    await clearAgent();
  }, []);

  return { agent, loading, refresh, signOut };
}
