import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import AutoAccessibility from "auto-accessibility";
import { TELEBIRR, openKnownApp } from "../lib/apps";
import { runMacro } from "../lib/macros";
import { buildTelebirrLoginMacro, syncTelebirr, SyncPhase } from "../lib/telebirr";
import {
  loadSnapshot,
  saveSnapshot,
  money,
  signedMoney,
  maskPhone,
  relativeTime,
  txMeta,
  toCsv,
  TelebirrSnapshot,
  EMPTY_SNAPSHOT,
} from "../lib/telebirrData";
import { C, R, CARD_SHADOW, TABULAR } from "../lib/theme";

/** The read, broken into the four things the user can actually watch happen. */
const STEPS: { phase: SyncPhase; label: string; hook: string }[] = [
  { phase: "opening", label: "Opening telebirr", hook: TELEBIRR.packages[0] },
  { phase: "phone", label: "Filling number", hook: "et_input" },
  { phase: "pin", label: "Entering PIN", hook: "tv_input_*" },
  { phase: "reading", label: "Reading balance", hook: "scrapeScreen" },
];

export default function TelebirrAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [snapshot, setSnapshot] = useState<TelebirrSnapshot>(EMPTY_SNAPSHOT);
  const [masked, setMasked] = useState(false);
  const [phase, setPhase] = useState<SyncPhase | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  // Ref to the latest sync so the once-on-open effect can call it without
  // taking sync's changing dependencies as its own.
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const didAutoSync = useRef(false);

  useEffect(() => {
    loadSnapshot().then(setSnapshot);
    return () => {
      alive.current = false;
    };
  }, []);

  // When the app opens, read telebirr once on its own so the balance and
  // receipts on screen are live rather than the last saved snapshot. Held back
  // until accessibility is on (nothing can be read without it) and skipped when
  // the user has turned auto off. Runs a single time per mount.
  useEffect(() => {
    if (didAutoSync.current || !autoSync) return;
    let enabled = false;
    try {
      enabled = AutoAccessibility.isServiceEnabled();
    } catch {
      enabled = false;
    }
    if (!enabled) return;
    didAutoSync.current = true;
    // A beat after mount so the first paint shows the saved snapshot first.
    const t = setTimeout(() => syncRef.current(), 600);
    return () => clearTimeout(t);
  }, [autoSync]);

  const syncing = phase !== null && phase !== "done";
  const stepIndex = phase ? STEPS.findIndex((s) => s.phase === phase) : -1;
  const doneIndex = phase === "done" ? STEPS.length : stepIndex;

  const sync = useCallback(async () => {
    if (syncing) return;
    setError("");
    try {
      const { balance } = await syncTelebirr((p) => alive.current && setPhase(p));
      const next: TelebirrSnapshot = {
        ...snapshot,
        balance: balance ?? snapshot.balance,
        readAt: Date.now(),
      };
      setSnapshot(next);
      await saveSnapshot(next);
      if (balance === null) setError("Signed in, but no balance found on that screen.");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      if (alive.current) setPhase(null);
    }
  }, [snapshot, syncing]);

  // Always call through this, so the auto-sync effect reaches the current sync.
  syncRef.current = sync;

  const signIn = useCallback(async () => {
    setSigningIn(true);
    setError("");
    const result = await runMacro(buildTelebirrLoginMacro());
    if (!result.ok) setError(result.log[result.log.length - 1] ?? "Sign-in failed.");
    setSigningIn(false);
  }, []);

  const openApp = useCallback(async () => {
    setError("");
    try {
      await openKnownApp(TELEBIRR);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    }
  }, []);

  const exportCsv = useCallback(() => {
    Share.share({ message: toCsv(snapshot.transactions) });
  }, [snapshot.transactions]);

  const recent = snapshot.transactions.slice(0, 3);

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: 28 }}>
      <View style={{ height: insets.top }} />

      {/* Header — this is the app's home, so there is nowhere to go back to. */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>telebirr</Text>
          <Text style={s.subtitle}>read by AutoPilot</Text>
        </View>
        <View style={s.badge}>
          <View style={s.badgeDot} />
          <Text style={s.badgeText}>linked</Text>
        </View>
        <Pressable
          style={[s.iconBtn, { marginLeft: 2, marginRight: -11 }]}
          onPress={() => router.push("/dashboard")}
          hitSlop={6}
        >
          <Feather name="sliders" size={19} color={C.dim} />
        </Pressable>
      </View>

      {/* Balance */}
      <View style={s.card}>
        <View style={s.balanceRow}>
          <View style={{ gap: 10 }}>
            <Text style={s.label}>Available balance</Text>
            <View style={s.amountRow}>
              <Text style={s.currency}>ETB</Text>
              <Text style={s.balance}>
                {masked ? "•• ••• ••" : money(snapshot.balance ?? 0)}
              </Text>
            </View>
          </View>
          <Pressable
            style={[s.iconBtn, { marginTop: -12, marginRight: -12 }]}
            onPress={() => setMasked((m) => !m)}
            hitSlop={6}
          >
            <Feather name={masked ? "eye-off" : "eye"} size={21} color={C.dim} />
          </Pressable>
        </View>

        <View style={s.accountRow}>
          <Text style={s.phone}>{maskPhone(snapshot.phoneNationalDigits)}</Text>
          <View style={s.dot} />
          <Text style={s.dim}>{snapshot.accountKind}</Text>
        </View>

        <View style={s.divider} />

        <View style={s.syncRow}>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.syncTitle}>
              {syncing ? "Reading telebirr…" : `Last read ${relativeTime(snapshot.readAt)}`}
            </Text>
            <Text style={s.dim}>{syncing ? "Keep the screen on" : "Balance and receipts"}</Text>
          </View>

          {/* Kept from the dashboard, as a small button. */}
          <Pressable
            style={({ pressed }) => [s.smallBtn, pressed && s.pressed]}
            onPress={signIn}
            disabled={signingIn || syncing}
          >
            <Feather name="lock" size={13} color={C.dim} />
            <Text style={s.smallBtnText}>{signingIn ? "…" : "Sign in"}</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
            onPress={sync}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Feather name="refresh-cw" size={15} color="#fff" />
            )}
            <Text style={s.primaryBtnText}>{syncing ? "Reading" : "Sync now"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Progress while reading, quick actions when idle */}
      {syncing ? (
        <View style={[s.card, s.progressCard]}>
          {STEPS.map((step, i) => {
            const done = i < doneIndex;
            const active = i === stepIndex;
            return (
              <View key={step.phase} style={s.stepRow}>
                <View
                  style={[
                    s.stepDot,
                    {
                      borderColor: done || active ? C.accent : C.border,
                      backgroundColor: done ? C.accent : C.surface,
                    },
                  ]}
                />
                <Text
                  style={[s.stepLabel, { color: done || active ? C.text : C.faint }]}
                  numberOfLines={1}
                >
                  {step.label}
                </Text>
                <Text style={s.stepHook} numberOfLines={1}>
                  {done ? step.hook : ""}
                </Text>
              </View>
            );
          })}
          <View style={s.hintRow}>
            <Feather name="alert-circle" size={15} color={C.amber} />
            <Text style={s.hint}>
              telebirr refuses to sign in over Wi-Fi — AutoPilot needs mobile data.
            </Text>
          </View>
        </View>
      ) : (
        <View style={s.actions}>
          <Pressable style={({ pressed }) => [s.action, pressed && s.pressed]} onPress={openApp}>
            <Feather name="smartphone" size={20} color={C.accent} />
            <Text style={s.actionText}>Open app</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [s.action, pressed && s.pressed]} onPress={exportCsv}>
            <Feather name="download" size={20} color={C.accent} />
            <Text style={s.actionText}>Export CSV</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              s.action,
              autoSync && { backgroundColor: C.accentSoft, borderColor: "#bfd2ff" },
              pressed && s.pressed,
            ]}
            onPress={() => setAutoSync((a) => !a)}
          >
            <Feather name="repeat" size={20} color={autoSync ? C.accent : C.dim} />
            <Text style={[s.actionText, { color: autoSync ? C.accent : C.dim }]}>
              {autoSync ? "Auto · on" : "Auto · off"}
            </Text>
          </Pressable>
        </View>
      )}

      {!!error && (
        <View style={s.errorBox}>
          <Feather name="alert-triangle" size={15} color={C.red} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {/* Recent activity */}
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>Recent activity</Text>
        <Pressable onPress={() => router.push("/transactions")} hitSlop={8}>
          <Text style={s.link}>View all</Text>
        </Pressable>
      </View>

      <View style={{ gap: 8, marginHorizontal: 20 }}>
        {recent.map((tx) => {
          const incoming = tx.value > 0;
          return (
            <Pressable
              key={tx.id}
              style={({ pressed }) => [s.txRow, pressed && s.pressed]}
              onPress={() => router.push(`/transaction/${tx.id}`)}
            >
              <View style={[s.txIcon, { backgroundColor: incoming ? C.greenSoft : C.redSoft }]}>
                <Feather
                  name={incoming ? "arrow-down-left" : "arrow-up-right"}
                  size={18}
                  color={incoming ? C.green : C.red}
                />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.txName} numberOfLines={1}>
                  {tx.name}
                </Text>
                <Text style={s.dim}>{txMeta(tx)}</Text>
              </View>
              <Text style={[s.txAmount, { color: incoming ? C.green : C.text }]}>
                {signedMoney(tx.value)}
              </Text>
              <Feather name="chevron-right" size={14} color="#aab5c9" />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  iconBtn: {
    width: 44,
    height: 44,
    marginLeft: -13,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.row,
  },
  title: { fontSize: 19, fontWeight: "600", color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.dim, marginTop: 1 },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingHorizontal: 11,
    borderRadius: R.pill,
    backgroundColor: C.greenSoft,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.green },
  badgeText: { fontSize: 12, fontWeight: "600", color: C.green },

  card: {
    marginHorizontal: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    padding: 20,
    gap: 16,
    ...CARD_SHADOW,
  },
  balanceRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  label: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: C.dim,
  },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  currency: { fontSize: 15, fontWeight: "600", color: C.dim },
  balance: { fontSize: 34, fontWeight: "600", color: C.text, letterSpacing: -0.8, ...TABULAR },
  accountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  phone: { fontSize: 13, color: C.text, fontFamily: "monospace" },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.borderStrong },
  dim: { fontSize: 12, color: C.dim },
  divider: { height: 1, backgroundColor: C.divider },
  syncRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  syncTitle: { fontSize: 13, fontWeight: "500", color: C.text },

  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 34,
    paddingHorizontal: 11,
    borderRadius: R.btn,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surfaceAlt,
  },
  smallBtnText: { fontSize: 12, fontWeight: "600", color: C.dim },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    paddingHorizontal: 16,
    borderRadius: R.btn,
    backgroundColor: C.accent,
  },
  primaryBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  pressed: { opacity: 0.75 },

  progressCard: { marginTop: 14, padding: 16, gap: 12 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  stepDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  stepLabel: { flex: 1, fontSize: 13, fontWeight: "500" },
  stepHook: { fontSize: 11, color: C.faint, fontFamily: "monospace" },
  hintRow: {
    flexDirection: "row",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingTop: 12,
  },
  hint: { flex: 1, fontSize: 12, color: C.amber, lineHeight: 17 },

  actions: { flexDirection: "row", gap: 10, marginHorizontal: 20, marginTop: 14 },
  action: {
    flex: 1,
    height: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
  },
  actionText: { fontSize: 12, fontWeight: "500", color: C.text },

  errorBox: {
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 12,
    borderRadius: R.row,
    backgroundColor: C.redSoft,
  },
  errorText: { flex: 1, fontSize: 12, color: C.red, lineHeight: 17 },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 12,
  },
  sectionTitle: { fontSize: 15, fontWeight: "600", color: C.text, letterSpacing: -0.2 },
  link: { fontSize: 13, fontWeight: "600", color: C.accent },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.row,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  txIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  txName: { fontSize: 14, fontWeight: "500", color: C.text },
  txAmount: { fontSize: 14, fontWeight: "600", ...TABULAR },
});
