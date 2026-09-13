import { useCallback, useState, type ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { C, R, SP, T, HIT } from "../lib/theme";

/**
 * The bar at the top of every screen.
 *
 * It sits OUTSIDE the screen's scroll view on purpose. With the status-bar inset
 * inside the scroller — which is how these screens used to be built — the title
 * and the rows behind it slide up under the clock and the battery icon as soon
 * as you scroll. Keeping the header fixed, and letting it paint the inset, means
 * the status bar always has the header's own background behind it.
 *
 * The hairline under it appears only once there is content scrolled up behind
 * it, so a screen resting at the top reads as one uninterrupted surface.
 */
export function ScreenHeader({
  title,
  subtitle,
  onBack,
  back = false,
  right,
  scrolled = false,
}: {
  title: string;
  subtitle?: string;
  /** Overrides the default router.back(). */
  onBack?: () => void;
  back?: boolean;
  right?: ReactNode;
  scrolled?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[s.wrap, scrolled && s.wrapScrolled]}>
      <View style={{ height: insets.top }} />
      <View style={s.bar}>
        {back && (
          <Pressable
            style={({ pressed }) => [s.backBtn, pressed && s.pressed]}
            onPress={onBack ?? (() => router.back())}
            hitSlop={HIT}
          >
            <Feather name="chevron-left" size={23} color={C.text} />
          </Pressable>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} numberOfLines={1}>
            {title}
          </Text>
          {!!subtitle && (
            <Text style={s.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>
        {right}
      </View>
    </View>
  );
}

/**
 * Tracks whether a scroller has moved, for the header's hairline.
 *
 * Only flips state at the boundary rather than on every pixel, so a scroll does
 * not re-render the screen on each frame.
 */
export function useScrolled(threshold = 4) {
  const [scrolled, setScrolled] = useState(false);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const past = event.nativeEvent.contentOffset.y > threshold;
      setScrolled((current) => (current === past ? current : past));
    },
    [threshold],
  );

  return { scrolled, onScroll };
}

/** A round icon button for the header's right side. */
export function HeaderButton({
  icon,
  onPress,
  tint = C.dim,
  badge,
}: {
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  tint?: string;
  badge?: number;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.iconBtn, pressed && s.pressed]}
      onPress={onPress}
      hitSlop={HIT}
    >
      <Feather name={icon} size={19} color={tint} />
      {!!badge && badge > 0 && (
        <View style={s.badge}>
          <Text style={s.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

const s = StyleSheet.create({
  // The ground colour, not white: the header is part of the page, and a white
  // bar over a grey page reads as a toolbar the rest of the design does not have.
  wrap: {
    backgroundColor: C.ground,
    borderBottomWidth: 1,
    borderBottomColor: "transparent",
    zIndex: 10,
  },
  // A hairline in the border colour is invisible against the ground, so the
  // scrolled state uses the stronger one plus a shallow shadow — enough to read
  // as an edge with content passing under it, without looking like a toolbar.
  wrapScrolled: {
    borderBottomColor: C.borderStrong,
    shadowColor: "#0b1220",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    paddingHorizontal: SP.gutter,
    paddingTop: SP.sm,
    paddingBottom: SP.md,
    minHeight: 52,
  },
  backBtn: {
    width: 38,
    height: 38,
    marginLeft: -10,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.tile,
  },
  title: { ...T.title, color: C.text },
  subtitle: { ...T.small, color: C.dim },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.pill,
  },
  pressed: { opacity: 0.6, backgroundColor: C.divider },
  badge: {
    position: "absolute",
    top: 4,
    right: 3,
    minWidth: 17,
    height: 17,
    paddingHorizontal: 4,
    borderRadius: R.pill,
    backgroundColor: C.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: C.ground,
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
});
