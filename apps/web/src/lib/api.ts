const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type User = {
  id: string;
  phone: string;
  name: string;
  balance: number;
};

/** An agent a customer can pay, as returned by the public list. */
export type Agent = {
  id: string;
  phone: string;
  fullName: string;
  businessName: string | null;
  region: string | null;
  city: string | null;
};

export type WalletResult = {
  amount: number;
  reference: string;
  balance: number;
};

/** Turns the server's error codes into something a person can read. */
const MESSAGES: Record<string, string> = {
  USER_NOT_FOUND: "That account could not be found.",
  REFERENCE_NOT_FOUND: "No deposit found with that reference number.",
  ALREADY_CLAIMED: "This reference number has already been used.",
  INSUFFICIENT_FUNDS: "Not enough balance for this withdrawal.",
  AGENT_NOT_FOUND: "That agent could not be found. Reload the page.",
  AGENT_NOT_ACTIVE: "That agent is not active. Pick another one.",
  INVALID_PHONE: "Check that phone number — use the format 0912345678.",
  INVALID_AMOUNT: "Enter an amount greater than zero.",
  INVALID_REFERENCE: "Enter the reference number from your receipt.",
  INVALID_BODY: "Some details are missing. Check the form and try again.",
};

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : "";
    throw new Error(MESSAGES[code] ?? "Something went wrong. Please try again.");
  }

  return data as T;
}

export async function fetchUsers(): Promise<User[]> {
  const res = await fetch(`${BASE}/api/users`);
  if (!res.ok) throw new Error("Could not load accounts.");
  return res.json();
}

/** Only agents an admin has marked ACTIVE can take a customer's money. */
export async function fetchActiveAgents(): Promise<Agent[]> {
  const res = await fetch(`${BASE}/api/agents/active`);
  if (!res.ok) throw new Error("Could not load agents.");
  return res.json();
}

/** True `notified` means the agent's handset was connected and got the push. */
export type DepositNotice = { reference: string; requestId: string; notified: boolean };
export type WithdrawNotice = { amount: number; phone: string; notified: boolean };

/**
 * Asks the agent's handset to look a reference up in telebirr.
 *
 * Returning only means the phone was asked. The answer arrives separately, over
 * the socket, once the phone has actually been into telebirr and found it.
 */
export function notifyDeposit(agentId: string, reference: string, requestId: string) {
  return post<DepositNotice>("/api/wallet/deposit/notify", { agentId, reference, requestId });
}

/**
 * Asks the agent for cash out: the customer's own number, and how much. Also
 * unverified — the agent decides whether to pay.
 */
export function notifyWithdraw(agentId: string, phone: string, amount: number) {
  return post<WithdrawNotice>("/api/wallet/withdraw/notify", { agentId, phone, amount });
}

export function checkDeposit(userId: string, reference: string) {
  return post<WalletResult>("/api/wallet/deposit/check", { userId, reference });
}

export function withdraw(userId: string, amount: number) {
  return post<WalletResult>("/api/wallet/withdraw", { userId, amount });
}
