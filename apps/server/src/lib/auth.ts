import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

/**
 * Signing key for session tokens. Set AUTH_SECRET in production — the fallback
 * exists so a fresh clone runs, and it invalidates every token on restart.
 */
const SECRET =
  process.env.AUTH_SECRET ?? `dev-only-${randomBytes(16).toString("hex")}`;

if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET must be set in production.");
}

const TOKEN_TTL_SECONDS = 60 * 60 * 12;

/* ---------------------------------------------------------------- passwords */

/** scrypt with a per-password salt, stored as `scrypt$<salt>$<hash>`. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");

  // Lengths must match before timingSafeEqual, which throws otherwise.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/* ------------------------------------------------------------------ tokens */

export type TokenPayload = {
  sub: string;
  phone: string;
  role: "SUPER_ADMIN" | "ADMIN";
  exp: number;
};

const base64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64url");

const sign = (data: string) => createHmac("sha256", SECRET).update(data).digest("base64url");

/** A compact HS256 JWT. */
export function signToken(payload: Omit<TokenPayload, "exp">): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({
      ...payload,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  );

  return `${header}.${body}.${sign(`${header}.${body}`)}`;
}

/** Returns the payload, or null when the token is forged, malformed or stale. */
export function verifyToken(token: string): TokenPayload | null {
  const [header, body, signature] = token.split(".");
  if (!header || !body || !signature) return null;

  const expected = Buffer.from(sign(`${header}.${body}`));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export const TOKEN_TTL = TOKEN_TTL_SECONDS;
