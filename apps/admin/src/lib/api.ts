import {
  SESSION_EXPIRED,
  clearSession,
  getToken,
  saveSession,
  type AdminProfile,
  type AdminRole,
} from "./session";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export type AgentStatus = "PENDING" | "ACTIVE" | "SUSPENDED";

export type Agent = {
  id: string;
  phone: string;
  fullName: string;
  pin: string | null;
  businessName: string | null;
  region: string | null;
  city: string | null;
  status: AgentStatus;
  balance: number;
  commissionRate: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentInput = {
  phone: string;
  fullName: string;
  pin?: string | null;
  businessName?: string | null;
  region?: string | null;
  city?: string | null;
  status: AgentStatus;
  balance: number;
  commissionRate: number;
  note?: string | null;
};

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasPrev: boolean;
  hasNext: boolean;
};

export type AgentStats = {
  total: number;
  byStatus: Record<AgentStatus, number>;
  totalBalance: number;
};

export type AgentListParams = {
  page: number;
  pageSize: number;
  search?: string;
  status?: AgentStatus | "";
  sortBy: "createdAt" | "fullName" | "balance" | "status";
  sortDir: "asc" | "desc";
};

/** Server error codes, rendered as something a person can act on. */
const MESSAGES: Record<string, string> = {
  AGENT_NOT_FOUND: "That agent no longer exists.",
  ADMIN_NOT_FOUND: "That admin no longer exists.",
  INVALID_CREDENTIALS: "Wrong phone number or password.",
  UNAUTHORIZED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "Only a super admin can do that.",
  WRONG_PASSWORD: "Your current password is not correct.",
  CANNOT_DELETE_SELF: "You cannot delete your own account.",
  CANNOT_DEMOTE_SELF: "You cannot remove your own super admin role.",
  PHONE_TAKEN: "An agent is already registered with that phone number.",
  INVALID_BODY: "Please check the highlighted fields.",
  INVALID_QUERY: "That filter combination is not valid.",
  EMPTY_UPDATE: "Nothing was changed.",
};

/** Field-level messages the form can attach to inputs, e.g. { phone: "..." }. */
export type FieldErrors = Record<string, string>;

export class ApiError extends Error {
  readonly code: string;
  readonly fields: FieldErrors;

  constructor(message: string, code: string, fields: FieldErrors = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.fields = fields;
  }
}

type ZodFlattened = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

function toFieldErrors(details: unknown): FieldErrors {
  const fieldErrors = (details as ZodFlattened | undefined)?.fieldErrors;
  if (!fieldErrors) return {};

  const result: FieldErrors = {};
  for (const [field, messages] of Object.entries(fieldErrors)) {
    if (messages?.[0]) result[field] = messages[0];
  }
  return result;
}

type RequestOptions = RequestInit & { anonymous?: boolean };

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const { anonymous, ...rest } = init ?? {};

  const headers: Record<string, string> = { ...(rest.headers as Record<string, string>) };
  if (rest.body) headers["Content-Type"] = "application/json";

  const token = getToken();
  if (token && !anonymous) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...rest, headers });
  } catch {
    throw new ApiError("Cannot reach the API. Is the server running?", "NETWORK");
  }

  // A rejected token anywhere means the whole session is over. Logging in is
  // the exception: a bad password there is a form error, not an expiry.
  if (res.status === 401 && !anonymous) {
    clearSession();
    window.dispatchEvent(new Event(SESSION_EXPIRED));
  }

  if (res.status === 204) return undefined as T;

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const code = typeof data.error === "string" ? data.error : "UNKNOWN";
    const fields = toFieldErrors(data.details);
    throw new ApiError(MESSAGES[code] ?? "Something went wrong. Please try again.", code, fields);
  }

  return data as T;
}

export function listAgents(params: AgentListParams): Promise<Paginated<Agent>> {
  const query = new URLSearchParams({
    page: String(params.page),
    pageSize: String(params.pageSize),
    sortBy: params.sortBy,
    sortDir: params.sortDir,
  });
  if (params.search) query.set("search", params.search);
  if (params.status) query.set("status", params.status);

  return request<Paginated<Agent>>(`/api/agents?${query.toString()}`);
}

export function fetchAgentStats(): Promise<AgentStats> {
  return request<AgentStats>("/api/agents/stats");
}

export function createAgent(input: AgentInput): Promise<Agent> {
  return request<Agent>("/api/agents", { method: "POST", body: JSON.stringify(input) });
}

export function updateAgent(id: string, input: Partial<AgentInput>): Promise<Agent> {
  return request<Agent>(`/api/agents/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteAgent(id: string): Promise<void> {
  return request<void>(`/api/agents/${id}`, { method: "DELETE" });
}

/* --------------------------------------------------------------------- auth */

export async function login(phone: string, password: string): Promise<AdminProfile> {
  const result = await request<{ token: string; admin: AdminProfile }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ phone, password }),
    anonymous: true,
  });

  saveSession(result.token, result.admin);
  return result.admin;
}

/** Checks a stored token against the server and returns the fresh profile. */
export function fetchMe(): Promise<AdminProfile> {
  return request<AdminProfile>("/api/auth/me");
}

export async function logout(): Promise<void> {
  try {
    await request<void>("/api/auth/logout", { method: "POST" });
  } catch {
    // Signing out locally must succeed even when the API is unreachable.
  }
  clearSession();
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>("/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/* ------------------------------------------------------------- admin users */

export type Admin = {
  id: string;
  phone: string;
  name: string;
  role: AdminRole;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminInput = {
  phone: string;
  name: string;
  role: AdminRole;
  password?: string;
};

export function listAdmins(page: number, pageSize: number, search?: string) {
  const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (search) query.set("search", search);
  return request<Paginated<Admin>>(`/api/admins?${query.toString()}`);
}

export function createAdmin(input: AdminInput): Promise<Admin> {
  return request<Admin>("/api/admins", { method: "POST", body: JSON.stringify(input) });
}

export function updateAdmin(id: string, input: Partial<AdminInput>): Promise<Admin> {
  return request<Admin>(`/api/admins/${id}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function deleteAdmin(id: string): Promise<void> {
  return request<void>(`/api/admins/${id}`, { method: "DELETE" });
}

export type { AdminProfile, AdminRole };
