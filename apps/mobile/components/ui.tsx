import type { ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { C, R, SP, T, SHADOW } from "../lib/theme";

/**
 * The pieces every screen is built from.
 *
 * Here rather than per screen so a card, a pill and a button cannot drift apart
 * between one screen and the next — which is most of what made the old screens
 * look hand-assembled: four slightly different card paddings and three button
 * heights.
 */

/** A white panel on the page ground. The default container for everything. */
export function Card({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Off for a card whose children are full-bleed rows with their own padding. */
  padded?: boolean;
}) {
  return <View style={[s.card, padded && s.cardPadded, style]}>{children}</View>;
}

/** The label above a group of cards. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.sectionLabelWrap, style]}>
      <Text style={s.sectionLabel}>{children}</Text>
    </View>
  );
}

export type Tone = "accent" | "green" | "red" | "amber" | "neutral";

const TONE: Record<Tone, { fg: string; bg: string }> = {
  accent: { fg: C.accent, bg: C.accentSoft },
  green: { fg: C.green, bg: C.greenSoft },
  red: { fg: C.red, bg: C.redSoft },
  amber: { fg: C.amber, bg: C.amberSoft },
  neutral: { fg: C.dim, bg: C.surfaceAlt },
};

/** A rounded icon tile — the thing that gives every row a consistent left edge. */
export function IconTile({
  icon,
  tone = "accent",
  size = 40,
  busy = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  tone?: Tone;
  size?: number;
  busy?: boolean;
}) {
  const { fg, bg } = TONE[tone];
  return (
    <View
      style={[s.tile, { width: size, height: size, borderRadius: size / 3.2, backgroundColor: bg }]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={fg} />
      ) : (
        <Feather name={icon} size={Math.round(size * 0.46)} color={fg} />
      )}
    </View>
  );
}

/** A small status capsule: a dot and a word. */
export function Pill({
  label,
  tone = "neutral",
  dot = true,
}: {
  label: string;
  tone?: Tone;
  dot?: boolean;
}) {
  const { fg, bg } = TONE[tone];
  return (
    <View style={[s.pill, { backgroundColor: bg }]}>
      {dot && <View style={[s.pillDot, { backgroundColor: fg }]} />}
      <Text style={[s.pillText, { color: fg }]}>{label}</Text>
    </View>
  );
}

/**
 * The one button. `variant` changes its weight, never its height — a row of
 * buttons at different heights is the single most obvious sign of an unplanned UI.
 */
export function Button({
  label,
  onPress,
  icon,
  variant = "primary",
  tone = "accent",
  busy = false,
  disabled = false,
  full = false,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Feather.glyphMap;
  variant?: "primary" | "secondary" | "ghost";
  tone?: Tone;
  busy?: boolean;
  disabled?: boolean;
  full?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { fg, bg } = TONE[tone];
  const off = disabled || busy;

  const fill =
    variant === "primary" ? (tone === "accent" ? C.accent : fg) : variant === "secondary" ? bg : "transparent";
  const text = variant === "primary" ? "#fff" : fg;

  return (
    <Pressable
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: fill },
        variant === "secondary" && { borderWidth: 1, borderColor: tone === "accent" ? C.accentBorder : "transparent" },
        variant === "ghost" && { borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
        full && { alignSelf: "stretch" },
        off && s.btnOff,
        pressed && !off && s.pressed,
        style,
      ]}
      onPress={onPress}
      disabled={off}
    >
      {busy ? (
        <ActivityIndicator size="small" color={text} />
      ) : (
        !!icon && <Feather name={icon} size={16} color={variant === "ghost" ? C.dim : text} />
      )}
      <Text style={[s.btnText, { color: variant === "ghost" ? C.text : text }]}>{label}</Text>
    </Pressable>
  );
}

/** A full-width message block: the one shape for errors, warnings and notes. */
export function Notice({
  text,
  tone = "amber",
  icon,
}: {
  text: string;
  tone?: Tone;
  icon?: keyof typeof Feather.glyphMap;
}) {
  const { fg, bg } = TONE[tone];
  return (
    <View style={[s.notice, { backgroundColor: bg }]}>
      <Feather
        name={icon ?? (tone === "red" ? "alert-triangle" : "info")}
        size={15}
        color={fg}
        style={{ marginTop: 1 }}
      />
      <Text style={[s.noticeText, { color: fg }]}>{text}</Text>
    </View>
  );
}

/** A labelled row inside a card, with the value on the right. */
export function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <View style={s.detailRow}>
      <Text style={s.detailLabel}>{label}</Text>
      {typeof value === "string" ? (
        <Text style={[s.detailValue, mono && { ...T.mono, color: C.text }]} numberOfLines={1}>
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}

/** Empty states: one icon, one line of title, one of explanation. */
export function EmptyState({
  icon,
  title,
  body,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Feather name={icon} size={24} color={C.faint} />
      </View>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  card: {
    marginHorizontal: SP.gutter,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    ...SHADOW.card,
  },
  cardPadded: { padding: SP.lg, gap: SP.md },

  sectionLabelWrap: {
    paddingHorizontal: SP.gutter,
    paddingTop: SP.xl,
    paddingBottom: SP.sm,
  },
  sectionLabel: { ...T.label, color: C.faint },

  tile: { alignItems: "center", justifyContent: "center" },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: R.pill,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11.5, fontWeight: "700" },

  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    height: 46,
    paddingHorizontal: SP.lg,
    borderRadius: R.btn,
  },
  btnText: { fontSize: 14, fontWeight: "600" },
  btnOff: { opacity: 0.45 },
  pressed: { opacity: 0.78 },

  notice: {
    flexDirection: "row",
    gap: SP.sm,
    padding: SP.md,
    borderRadius: R.row,
  },
  noticeText: { flex: 1, fontSize: 12.5, lineHeight: 18 },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SP.md,
    minHeight: 34,
  },
  detailLabel: { ...T.small, color: C.dim },
  detailValue: { ...T.body, color: C.text, flexShrink: 1, textAlign: "right" },

  empty: { alignItems: "center", gap: SP.sm, paddingTop: 60, paddingHorizontal: 44 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: SP.xs,
  },
  emptyTitle: { ...T.heading, color: C.text },
  emptyBody: { ...T.small, color: C.dim, lineHeight: 19, textAlign: "center" },
});
