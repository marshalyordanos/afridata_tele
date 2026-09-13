/**
 * Light theme tokens for the telebirr screens.
 *
 * These are the app's original navy palette re-toned for a light ground: the
 * same accent (#2b6cff), the same green (#1f7a4d) and the same dim text
 * (#5c6b85, previously the placeholder colour), with the radii the dark
 * screens already use (10 buttons / 12 rows / 14 cards).
 */
export const C = {
  ground: "#f2f5fa",
  surface: "#ffffff",
  surfaceAlt: "#f7f9fd",
  border: "#dfe5f0",
  borderStrong: "#cdd6e6",
  divider: "#eef2f8",
  text: "#0f1729",
  dim: "#5c6b85",
  faint: "#8894ab",
  accent: "#2b6cff",
  accentSoft: "#eaf0ff",
  green: "#1f7a4d",
  greenSoft: "#e6f4ec",
  red: "#b42318",
  redSoft: "#fdeceb",
  amber: "#8a6116",
  amberSoft: "#fdf2e0",
} as const;

export const R = { btn: 10, row: 12, card: 14, pill: 999 } as const;

/** Card elevation, kept subtle so rows stay flat against the ground. */
export const CARD_SHADOW = {
  shadowColor: "#0f1729",
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 6 },
  elevation: 1,
} as const;

/** Amounts and receipt numbers line up when the digits are tabular. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };
