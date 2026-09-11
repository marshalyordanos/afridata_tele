const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type User = {
  id: string;
  phone: string;
  name: string;
  balance: number;
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

export function checkDeposit(userId: string, reference: string) {
  return post<WalletResult>("/api/wallet/deposit/check", { userId, reference });
}

export function withdraw(userId: string, amount: number) {
  return post<WalletResult>("/api/wallet/withdraw", { userId, amount });
}
