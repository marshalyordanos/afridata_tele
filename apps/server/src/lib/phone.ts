import { z } from "zod";

/**
 * Ethiopian mobile numbers are stored in one canonical shape: +251 followed by
 * nine digits starting with 7 or 9, e.g. +251986680094.
 */
export const PHONE_PATTERN = /^\+251[79]\d{8}$/;

export const PHONE_HINT = "Use the format +251986680094.";

/**
 * Accept the shapes people actually type — 0986680094, 251986680094,
 * +251 98 668 0094 — and fold them into +251986680094. Returns null when the
 * input cannot be read as an Ethiopian mobile number.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;

  let national: string;
  if (bare.startsWith("251")) national = bare.slice(3);
  else if (bare.startsWith("0")) national = bare.slice(1);
  else national = bare;

  const candidate = `+251${national}`;
  return PHONE_PATTERN.test(candidate) ? candidate : null;
}

/**
 * The phone field as routes accept it: any shape a person types, stored and
 * compared in the one canonical form. Shared so the agent console and the
 * customer-facing routes cannot drift into normalising differently.
 */
export const phoneSchema = z
  .string()
  .trim()
  .min(9)
  .transform((value, ctx) => {
    const normalized = normalizePhone(value);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: `Invalid phone number. ${PHONE_HINT}` });
      return z.NEVER;
    }
    return normalized;
  });
