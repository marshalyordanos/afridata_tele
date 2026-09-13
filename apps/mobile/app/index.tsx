import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Share,
  ActivityIndicator,
} from "react-native";
import { useRouter, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { TELEBIRR, openKnownApp } from "../lib/apps";
import { syncTelebirr, SyncPhase, SendPhase } from "../lib/telebirr";
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
import { C, R, SP, T, SHADOW, TABULAR, HIT } from "../lib/theme";
import { useAccessibility, ACCESS_OFF_MESSAGE } from "../lib/accessibility";
import { useAgent } from "../lib/agent";
import { useRealtime } from "../lib/realtime";
import { withTelebirr } from "../lib/telebirrLock";
import { ScreenHeader, HeaderButton, useScrolled } from "../components/ScreenHeader";
import { Button, Card, IconTile, Notice, Pill, type Tone } from "../components/ui";

interface Step {
  phase: SyncPhase | SendPhase;
  label: string;
  hook: string;
}

/** The read, broken into the four things the user can actually watch happen. */
const STEPS: Step[] = [
  { phase: "opening", label: "Opening telebirr", hook: TELEBIRR.packages[0] },
  { phase: "phone", label: "Filling number", hook: "et_input" },
  { phase: "pin", label: "Entering PIN", hook: "tv_input_*" },
  { phase: "reading", label: "Reading balance & receipts", hook: "scrapeScreen" },
  { phase: "returning", label: "Back to AutoPilot", hook: "openApp" },
];

/**
 * The payout, same idea — every step names the selector it drives. Driven by a
 * customer's cash-out request now rather than a button on this screen.
 */
const SEND_STEPS: Step[] = [
  { phase: "opening", label: "Opening telebirr", hook: TELEBIRR.packages[0] },
  { phase: "login", label: "Signing in", hook: "et_input · tv_input_*" },
  { phase: "menu", label: "Opening Send Money", hook: "by text" },
  { phase: "recipient", label: "Entering the number", hook: "et_input" },
  { phase: "amount", label: "Entering the amount", hook: "et_input" },
  { phase: "confirm", label: "Confirming", hook: "by text" },
  { phase: "pin", label: "Authorising with PIN", hook: "tv_input_*" },
  { phase: "returning", label: "Back to AutoPilot", hook: "openApp" },
];

export default function TelebirrAccount() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { scrolled, onScroll } = useScrolled();

  const [snapshot, setSnapshot] = useState<TelebirrSnapshot>(EMPTY_SNAPSHOT);
  const [masked, setMasked] = useState(false);
  const [phase, setPhase] = useState<SyncPhase | null>(null);
  const [autoSync, setAutoSync] = useState(true);
  const [error, setError] = useState("");
  const access = useAccessibility();
  const { agent, loading: agentLoading } = useAgent();
  // Live requests from customers who picked this agent on the web page.
  // The list itself lives on the notifications screen; here it is just a badge.
  const { unread, state: liveState, alerts } = useRealtime();
  const alive = useRef(true);
  // Ref to the latest sync so the once-on-open effect can call it without
  // taking sync's changing dependencies as its own.
  const syncRef = useRef<() => Promise<void>>(async () => {});
  const didAutoSync = useRef(false);

  useEffect(() => {
    loadSnapshot().then((loaded) => {
      setSnapshot(loaded);
    });
    return () => {
      alive.current = false;
    };
  }, []);

  // Re-read the saved snapshot whenever the app comes back to the front.
  //
  // Driving telebirr happens with this screen still mounted, so its state is
  // whatever it was when the app went away — which after a send is a balance
  // short by exactly the amount just paid out. The send writes the real figure
  // to storage before handing the screen back; this is what puts it on screen,
  // instead of a stale number that looks like money still there.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      loadSnapshot().then((loaded) => {
        if (alive.current) setSnapshot(loaded);
      });
    });
    return () => sub.remove();
  }, []);

  // When the app opens, read telebirr once on its own so the balance and
  // receipts on screen are live rather than the last saved snapshot. Held back
  // until accessibility is on (nothing can be read without it) and skipped when
  // the user has turned auto off. Runs a single time per mount.
  useEffect(() => {
    // Waits for a service that is actually bound, not just switched on: the
    // read's first scrape fails during the gap between the two. Because this
    // watches the live state, the read also runs on its own the moment access
    // is granted, rather than only when the app was opened with it already on.
    if (didAutoSync.current || !autoSync || !access.on) return;
    didAutoSync.current = true;
    // A beat after mount so the first paint shows the saved snapshot first.
    const t = setTimeout(() => syncRef.current(), 600);
    return () => clearTimeout(t);
  }, [autoSync, access.on]);

  const syncing = phase !== null && phase !== "done";
  // The payout the phone is driving right now, if any. It is started from the
  // notifications screen, so this screen only reports on it.
  const cashOut = alerts.find(
    (item) =>
      item.kind === "withdrawal" && (item.stage === "queued" || item.stage === "sending"),
  );
  const payingOut = cashOut?.kind === "withdrawal" ? cashOut : null;
  const sendPhase = payingOut?.phase ?? null;
  const sending = payingOut !== null;
  const busy = syncing || sending;
  const steps = sending ? SEND_STEPS : STEPS;
  const activePhase: SyncPhase | SendPhase | null = sending ? sendPhase : phase;
  const stepIndex = activePhase ? steps.findIndex((step) => step.phase === activePhase) : -1;
  const doneIndex = activePhase === "done" ? steps.length : stepIndex;

  const sync = useCallback(async () => {
    if (busy) return;
    if (!access.on) {
      setError(ACCESS_OFF_MESSAGE);
      return;
    }
    setError("");
    try {
      // Skipped outright when a deposit lookup already has telebirr: this read
      // is a convenience, and starting a second one is what made telebirr open
      // in a loop. `withTelebirr` returns null rather than waiting, because a
      // refresh that happens two minutes late is worth nothing.
      const result = await withTelebirr("screen sync", () =>
        syncTelebirr((p) => alive.current && setPhase(p))
      );
      if (!result) {
        if (alive.current) setPhase(null);
        return;
      }
      const { balance, transactions } = result;
      const next: TelebirrSnapshot = {
        ...snapshot,
        balance: balance ?? snapshot.balance,
        // Keep the last real list if this read came back empty.
        transactions: transactions.length ? transactions : snapshot.transactions,
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
  }, [snapshot, busy, access.on]);

  // Always call through this, so the auto-sync effect reaches the current sync.
  syncRef.current = sync;

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

  // Nothing on this screen means anything until an agent has enrolled: the
  // credentials the automation signs in with are theirs. Held blank for the one
  // frame it takes to read storage, so enrolment does not flash past an agent
  // who is already signed in.
  if (agentLoading) return <View style={s.screen} />;
  if (!agent) return <Redirect href="/enroll" />;

  const liveTone: Tone =
    liveState === "online" ? "green" : liveState === "connecting" ? "amber" : "red";
  const liveLabel =
    liveState === "online" ? "Live" : liveState === "connecting" ? "Linking" : "Offline";

  return (
    <View style={s.screen}>
      {/* Fixed, outside the scroller: the status bar keeps the header's own
          background behind it however far the content below is scrolled. */}
      <ScreenHeader
        title="telebirr"
        subtitle={agent.fullName}
        scrolled={scrolled}
        right={
          <View style={s.headerRight}>
            <Pill label={liveLabel} tone={liveTone} />
            <HeaderButton
              icon="bell"
              badge={unread}
              tint={unread > 0 ? C.accent : C.dim}
              onPress={() => router.push("/notifications")}
            />
            <HeaderButton icon="settings" onPress={() => router.push("/settings")} />
          </View>
        }
      />

      <ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + SP.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Accessibility first: nothing below it can run without the service.
            A full card while it is off, one quiet line once it is on. */}
        {access.on ? (
          <Pressable
            style={({ pressed }) => [s.accessOk, pressed && s.pressedRow]}
            onPress={() => router.push("/settings")}
          >
            <Feather name="shield" size={14} color={C.green} />
            <Text style={s.accessOkText}>Accessibility on</Text>
            <Text style={s.accessOkDim} numberOfLines={1}>
              AutoPilot can drive telebirr
            </Text>
            <Feather name="chevron-right" size={15} color={C.green} />
          </Pressable>
        ) : (
          <Card style={s.accessCard}>
            <View style={s.rowCentre}>
              <IconTile
                icon="shield-off"
                tone="amber"
                size={42}
                busy={access.state === "checking" || access.state === "starting"}
              />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.accessTitle}>
                  {access.state === "starting"
                    ? "Accessibility starting…"
                    : access.state === "checking"
                    ? "Checking accessibility…"
                    : "Accessibility is off"}
                </Text>
                <Text style={s.accessDim}>
                  {access.state === "starting"
                    ? "Android is connecting the service — one moment."
                    : "Nothing can read or tap telebirr without it."}
                </Text>
              </View>
            </View>
            {access.state !== "starting" && (
              <Button
                label="Turn on accessibility"
                icon="unlock"
                onPress={access.open}
                disabled={access.state === "checking"}
                full
              />
            )}
            {access.returnedWithoutAccess && (
              <Text style={s.accessNote}>
                Still off — the AutoPilot switch has to be turned on. This updates by itself.
              </Text>
            )}
          </Card>
        )}

        {/* The balance. The one inverted surface in the app: it is what the
            agent opens the app to read, so nothing else competes with it. */}
        <View style={s.panel}>
          <View style={s.panelTop}>
            <View style={{ gap: SP.md, flex: 1 }}>
              <Text style={s.panelLabel}>Available balance</Text>
              <View style={s.amountRow}>
                <Text style={s.currency}>ETB</Text>
                <Text style={s.balance} numberOfLines={1}>
                  {masked ? "•• •••" : snapshot.balance === null ? "—" : money(snapshot.balance)}
                </Text>
              </View>
            </View>
            <Pressable
              style={({ pressed }) => [s.panelIconBtn, pressed && { opacity: 0.6 }]}
              onPress={() => setMasked((m) => !m)}
              hitSlop={HIT}
            >
              <Feather name={masked ? "eye-off" : "eye"} size={19} color={C.onPanelDim} />
            </Pressable>
          </View>

          <View style={s.accountRow}>
            <Text style={s.panelPhone}>{maskPhone(agent.phoneNationalDigits)}</Text>
            <View style={s.panelDot} />
            <Text style={s.panelDim} numberOfLines={1}>
              {agent.businessName ?? "telebirr agent"}
            </Text>
          </View>

          <View style={s.panelDivider} />

          <View style={s.rowCentre}>
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.panelSyncTitle}>
                {sending
                  ? "Paying out a cash-out…"
                  : syncing
                  ? "Reading telebirr…"
                  : `Last read ${relativeTime(snapshot.readAt)}`}
              </Text>
              <Text style={s.panelDim}>
                {busy ? "Keep the screen on" : "Balance and receipts"}
              </Text>
            </View>
            <Button
              label={syncing ? "Reading" : "Sync"}
              icon="refresh-cw"
              onPress={sync}
              busy={syncing}
              disabled={busy}
            />
          </View>
        </View>

        {/* What the phone is doing right now, or what you can ask it to do. */}
        {busy ? (
          <Card style={{ marginTop: SP.md, gap: SP.md }}>
            {/* A payout is money leaving on a customer's request, so it says so
                plainly — the step list alone would look like an ordinary read. */}
            {payingOut && (
              <View style={s.payingRow}>
                <IconTile icon="arrow-up-right" tone="red" size={34} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.payingText}>Sending ETB {money(payingOut.amount)}</Text>
                  <Text style={s.dim}>to {payingOut.phone}</Text>
                </View>
              </View>
            )}
            <View style={{ gap: SP.md }}>
              {steps.map((step, i) => {
                const done = i < doneIndex;
                const active = i === stepIndex;
                return (
                  <View key={step.phase} style={s.stepRow}>
                    <View
                      style={[
                        s.stepDot,
                        (done || active) && { borderColor: C.accent },
                        done && { backgroundColor: C.accent },
                      ]}
                    >
                      {done && <Feather name="check" size={9} color="#fff" />}
                    </View>
                    <Text
                      style={[s.stepLabel, { color: done || active ? C.text : C.faint }]}
                      numberOfLines={1}
                    >
                      {step.label}
                    </Text>
                    {active && <ActivityIndicator size="small" color={C.accent} />}
                  </View>
                );
              })}
            </View>
            <Notice
              tone="amber"
              icon="wifi"
              text="telebirr refuses to sign in over Wi-Fi — AutoPilot needs mobile data."
            />
          </Card>
        ) : (
          <View style={s.actions}>
            <QuickAction icon="smartphone" label="Open app" onPress={openApp} />
            <QuickAction icon="download" label="Export CSV" onPress={exportCsv} />
            <QuickAction
              icon="repeat"
              label={autoSync ? "Auto · on" : "Auto · off"}
              active={autoSync}
              onPress={() => setAutoSync((a) => !a)}
            />
          </View>
        )}

        {!!error && (
          <View style={{ marginHorizontal: SP.gutter, marginTop: SP.md }}>
            <Notice tone="red" text={error} />
          </View>
        )}

        {/* Recent activity */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>Recent activity</Text>
          {recent.length > 0 && (
            <Pressable onPress={() => router.push("/transactions")} hitSlop={HIT}>
              <Text style={s.link}>View all</Text>
            </Pressable>
          )}
        </View>

        {recent.length === 0 ? (
          <Card style={{ alignItems: "center", paddingVertical: SP.xxl, gap: SP.sm }}>
            <IconTile icon="inbox" tone="neutral" size={46} />
            <Text style={s.emptyTitle}>No receipts yet</Text>
            <Text style={s.emptyBody}>Sync to read your telebirr history onto this phone.</Text>
          </Card>
        ) : (
          <View style={{ gap: SP.sm, marginHorizontal: SP.gutter }}>
            {recent.map((tx) => {
              const incoming = tx.value > 0;
              return (
                <Pressable
                  key={tx.id}
                  style={({ pressed }) => [s.txRow, pressed && s.pressedRow]}
                  onPress={() => router.push(`/transaction/${tx.id}`)}
                >
                  <IconTile
                    icon={incoming ? "arrow-down-left" : "arrow-up-right"}
                    tone={incoming ? "green" : "red"}
                    size={38}
                  />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={s.txName} numberOfLines={1}>
                      {tx.name}
                    </Text>
                    <Text style={s.dim} numberOfLines={1}>
                      {txMeta(tx)}
                    </Text>
                  </View>
                  <Text style={[s.txAmount, { color: incoming ? C.green : C.text }]}>
                    {signedMoney(tx.value)}
                  </Text>
                  <Feather name="chevron-right" size={15} color={C.faint} />
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

/** One of the three squares under the balance. */
function QuickAction({
  icon,
  label,
  onPress,
  active = false,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [s.action, active && s.actionActive, pressed && s.pressedRow]}
      onPress={onPress}
    >
      <Feather name={icon} size={19} color={active ? C.accent : C.dim} />
      <Text style={[s.actionText, active && { color: C.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 2, marginRight: -8 },
  rowCentre: { flexDirection: "row", alignItems: "center", gap: SP.md },
  dim: { ...T.small, color: C.dim },
  pressedRow: { opacity: 0.7 },

  // --- accessibility ---
  accessOk: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.sm,
    marginHorizontal: SP.gutter,
    marginBottom: SP.md,
    paddingVertical: 9,
    paddingHorizontal: SP.md,
    borderRadius: R.row,
    backgroundColor: C.greenSoft,
  },
  accessOkText: { ...T.small, fontWeight: "700", color: C.green },
  accessOkDim: { flex: 1, ...T.micro, color: C.green, opacity: 0.75 },
  accessCard: { marginBottom: SP.md, backgroundColor: C.amberSoft, borderColor: "#f0dcb4" },
  accessTitle: { ...T.body, fontWeight: "700", color: "#6d4d11" },
  accessDim: { ...T.small, color: C.amber, lineHeight: 18 },
  accessNote: { ...T.micro, color: C.amber, lineHeight: 16 },

  // --- balance panel ---
  panel: {
    marginHorizontal: SP.gutter,
    padding: SP.xl,
    gap: SP.lg,
    borderRadius: R.card,
    backgroundColor: C.panel,
    ...SHADOW.raised,
  },
  panelTop: { flexDirection: "row", alignItems: "flex-start" },
  panelLabel: { ...T.label, color: C.onPanelDim },
  amountRow: { flexDirection: "row", alignItems: "baseline", gap: SP.sm },
  currency: { fontSize: 15, fontWeight: "600", color: C.onPanelDim },
  balance: { ...T.display, color: C.onPanel, ...TABULAR, flexShrink: 1 },
  panelIconBtn: {
    width: 38,
    height: 38,
    marginTop: -6,
    marginRight: -8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.pill,
  },
  accountRow: { flexDirection: "row", alignItems: "center", gap: SP.sm },
  panelPhone: { ...T.mono, color: C.onPanel },
  panelDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.onPanelDim },
  panelDim: { ...T.small, color: C.onPanelDim, flexShrink: 1 },
  panelDivider: { height: 1, backgroundColor: C.panelBorder },
  panelSyncTitle: { ...T.body, fontWeight: "600", color: C.onPanel },

  // --- progress ---
  payingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    paddingBottom: SP.md,
    borderBottomWidth: 1,
    borderBottomColor: C.divider,
  },
  payingText: { ...T.body, fontWeight: "700", color: C.text },
  stepRow: { flexDirection: "row", alignItems: "center", gap: SP.md },
  stepDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  stepLabel: { flex: 1, ...T.small, fontWeight: "600" },

  // --- quick actions ---
  actions: {
    flexDirection: "row",
    gap: SP.sm,
    marginHorizontal: SP.gutter,
    marginTop: SP.md,
  },
  action: {
    flex: 1,
    height: 78,
    alignItems: "center",
    justifyContent: "center",
    gap: SP.sm,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    ...SHADOW.card,
  },
  actionActive: { backgroundColor: C.accentSoft, borderColor: C.accentBorder },
  actionText: { ...T.micro, fontWeight: "600", color: C.text },

  // --- recent activity ---
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SP.gutter,
    paddingTop: SP.xxl,
    paddingBottom: SP.md,
  },
  sectionTitle: { ...T.heading, color: C.text },
  link: { ...T.small, fontWeight: "700", color: C.accent },
  emptyTitle: { ...T.body, fontWeight: "700", color: C.text },
  emptyBody: { ...T.small, color: C.dim, textAlign: "center" },

  txRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: SP.md,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.row,
    paddingVertical: SP.md,
    paddingHorizontal: SP.md,
  },
  txName: { ...T.body, fontWeight: "600", color: C.text },
  txAmount: { ...T.body, fontWeight: "700", ...TABULAR },
});
