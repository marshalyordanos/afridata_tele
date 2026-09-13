/**
 * The app's design tokens.
 *
 * One light palette on a cool grey ground, with a single deep-navy panel for the
 * balance — the figure the agent opens the app to read should not compete with
 * anything else on the screen, and it is the only element that inverts.
 *
 * Names are semantic rather than literal (`text`, `dim`, `faint` rather than
 * `grey700`), so a screen never has to decide what a colour is for.
 */
export const C = {
  /** Page background — cool, a shade off white so white cards lift off it. */
  ground: "#f1f4f9",
  surface: "#ffffff",
  /** Inset fields and quiet rows inside a card. */
  surfaceAlt: "#f6f8fc",
  border: "#e3e8f1",
  borderStrong: "#cbd4e4",
  divider: "#edf1f7",

  /** Deep navy panel, for the balance card only. */
  panel: "#101c33",
  panelAlt: "#1b2947",
  panelBorder: "#26365a",
  onPanel: "#ffffff",
  onPanelDim: "#9bacc9",

  text: "#0b1220",
  dim: "#5a6881",
  faint: "#8a96ad",

  accent: "#2b6cff",
  /** Pressed/active accent, so a tap has somewhere to go. */
  accentDeep: "#1e54d6",
  accentSoft: "#eaf0ff",
  accentBorder: "#c4d5ff",

  green: "#15724a",
  greenSoft: "#e4f3ec",
  red: "#b42318",
  redSoft: "#fdecea",
  amber: "#8a6116",
  amberSoft: "#fdf2e0",
} as const;

/** Corner radii. Bigger than before: 10px corners read as dated at this scale. */
export const R = { btn: 12, row: 14, card: 18, tile: 12, pill: 999 } as const;

/**
 * Spacing scale. Everything is a multiple of 4, and `gutter` is the one value
 * that sets the screen's side margin — change it here, not per screen.
 */
export const SP = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  gutter: 18,
} as const;

/**
 * Type scale. Sizes and weights together, because a size is never chosen
 * independently of its weight, and letter-spacing is negative only on the large
 * sizes where the default tracking looks loose.
 */
export const T = {
  display: { fontSize: 34, fontWeight: "700" as const, letterSpacing: -1 },
  title: { fontSize: 19, fontWeight: "700" as const, letterSpacing: -0.4 },
  heading: { fontSize: 15, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 14, fontWeight: "500" as const },
  bodyDim: { fontSize: 13, fontWeight: "400" as const },
  small: { fontSize: 12, fontWeight: "500" as const },
  micro: { fontSize: 11, fontWeight: "500" as const },
  /** Section label above a group of cards. */
  label: {
    fontSize: 11,
    fontWeight: "700" as const,
    letterSpacing: 0.9,
    textTransform: "uppercase" as const,
  },
  mono: { fontFamily: "monospace" as const, fontSize: 13 },
} as const;

/**
 * Two elevations, not five. `card` lifts a surface off the ground; `raised` is
 * for the one panel that should read as floating above the page.
 */
export const SHADOW = {
  card: {
    shadowColor: "#0b1220",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  raised: {
    shadowColor: "#0b1220",
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
} as const;

/** Kept as its own export: screens still reference CARD_SHADOW by name. */
export const CARD_SHADOW = SHADOW.card;

/** Amounts and receipt numbers line up when the digits are tabular. */
export const TABULAR = { fontVariant: ["tabular-nums" as const] };

/** Hit targets below 44px are hard to tap; used wherever a bare icon is one. */
export const HIT = { top: 8, bottom: 8, left: 8, right: 8 } as const;
