import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Share,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRealtime, type CustomerRequest } from "../lib/realtime";
import type { SendPhase } from "../lib/telebirr";
import { money, relativeTime } from "../lib/telebirrData";
import { loadLastListScrape } from "../lib/telebirr";
import { C, R, SP, T, TABULAR, HIT } from "../lib/theme";
import { ScreenHeader } from "../components/ScreenHeader";

/** The connection line under the title — the agent's cue that pushes arrive. */
const STATE_TEXT = {
  online: "Connected · requests arrive here instantly",
  connecting: "Connecting…",
  offline: "Offline · you will not receive requests",
} as const;

/** The line under a deposit, and the colour it reads in. */
function depositStatus(item: Extract<CustomerRequest, { kind: "deposit" }>): {
  text: string;
  tone: "dim" | "green" | "red";
  busy: boolean;
} {
  switch (item.stage) {
    case "queued":
      return { text: "Waiting to check telebirr", tone: "dim", busy: true };
    case "reading":
      return {
        text: item.opened
          ? `Opening receipts in telebirr (${item.opened})…`
          : "Checking telebirr…",
        tone: "dim",
        busy: true,
      };
    case "confirmed":
      return {
        text: `Confirmed · ETB ${money(item.amount ?? 0)} credited`,
        tone: "green",
        busy: false,
      };
    case "not_found":
      return { text: "Not in your telebirr history", tone: "red", busy: false };
    case "failed":
      return { text: item.reason ?? "Could not read telebirr", tone: "red", busy: false };
  }
}

/** The line under a cash-out, and the colour it reads in. */
function cashOutStatus(item: Extract<CustomerRequest, { kind: "withdrawal" }>): {
  text: string;
  tone: "dim" | "green" | "red";
  busy: boolean;
} {
  switch (item.stage) {
    case "awaiting":
      return { text: `Cash out to ${item.phone}`, tone: "dim", busy: false };
    case "queued":
      return { text: "Waiting for telebirr", tone: "dim", busy: true };
    case "sending":
      return { text: SEND_PHASE_TEXT[item.phase ?? "opening"], tone: "dim", busy: true };
    case "sent":
      return { text: `Sent to ${item.phone}`, tone: "green", busy: false };
    case "failed":
      return { text: item.reason ?? "The transfer failed", tone: "red", busy: false };
    case "interrupted":
      return { text: item.reason ?? "Interrupted — check telebirr", tone: "red", busy: false };
  }
}

/** What each telebirr step is called, so the agent can follow the payout. */
const SEND_PHASE_TEXT: Record<SendPhase, string> = {
  opening: "Opening telebirr…",
  login: "Signing in…",
  menu: "Opening Send Money…",
  recipient: "Entering the number…",
  amount: "Entering the amount…",
  confirm: "Confirming…",
  pin: "Authorising with PIN…",
  returning: "Finishing up…",
  done: "Sent",
};

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alerts, unread, state, markAllRead, dismiss, clear, payOut } = useRealtime();

  /**
   * Real money leaves the agent's telebirr account here, on the word of a
   * request that arrived over the network, so the amount and the destination are
   * both read back before anything is sent.
   */
  const confirmPayOut = (item: Extract<CustomerRequest, { kind: "withdrawal" }>) => {
    Alert.alert(
      `Send ETB ${money(item.amount)}?`,
      `AutoPilot will sign in to telebirr and send ETB ${money(item.amount)} to ${item.phone}.\n\n` +
        "Only do this once you have the cash from the customer.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", style: "destructive", onPress: () => payOut(item.id) },
      ],
    );
  };

  // Opening the screen is what marks them read, so the badge clears the moment
  // the agent has actually seen them — not when the push arrived. Their ids are
  // kept first, so the accent edge still shows what is new to this visit after
  // the stored flag has been cleared; one that arrives while the screen is open
  // is marked read too, rather than leaving a badge for something in plain view.
  // The headline the agent actually wants: how many went through, how many did
  // not, how many are still running.
  const counts = alerts.reduce(
    (acc, item) => {
      if (item.kind === "withdrawal") {
        if (item.stage === "awaiting") acc.toPay += 1;
        return acc;
      }
      acc.total += 1;
      if (item.stage === "confirmed") acc.confirmed += 1;
      else if (item.stage === "not_found" || item.stage === "failed") acc.failed += 1;
      else acc.working += 1;
      return acc;
    },
    { total: 0, confirmed: 0, failed: 0, working: 0, toPay: 0 },
  );

  // What the last history read actually saw. Shown only when a check could not
  // find any receipt numbers, because that is the one failure whose cause is
  // invisible from the app — the answer is in telebirr's own screen text.
  const [scrape, setScrape] = useState<{ at: number; rows: number; texts: string[] } | null>(null);
  const unreadable = alerts.some(
    (item) =>
      item.kind === "deposit" &&
      item.stage === "failed" &&
      (item.reason ?? "").startsWith("Could not read"),
  );

  useEffect(() => {
    if (unreadable) loadLastListScrape().then(setScrape);
  }, [unreadable]);

  const shareScrape = () => {
    if (!scrape) return;
    Share.share({
      message: [
        `telebirr history scrape · ${scrape.rows} rows · ${relativeTime(scrape.at)}`,
        "",
        ...scrape.texts,
      ].join("\n"),
    });
  };

  const newIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const alert of alerts) if (!alert.read) newIds.current.add(alert.id);
    markAllRead();
  }, [alerts, markAllRead]);

  const renderRow = ({ item }: { item: CustomerRequest }) => {
    // Cash out is money leaving the agent's float, so it reads in the red-tinted
    // arrow the transaction list already uses for outgoing; a deposit reference
    // is just something to look up, and stays neutral accent.
    const out = item.kind === "withdrawal";
    const done =
      item.kind === "deposit" ? item.stage === "confirmed" : item.stage === "sent";
    const bad =
      item.kind === "deposit"
        ? item.stage === "not_found" || item.stage === "failed"
        : item.stage === "failed" || item.stage === "interrupted";
    return (
      <View style={[s.card, s.row, newIds.current.has(item.id) && s.rowUnread]}>
        <View style={[s.icon, out && s.iconOut, done && s.iconDone, bad && s.iconBad]}>
          <Feather
            name={out ? "arrow-up-right" : done ? "check" : bad ? "alert-circle" : "hash"}
            size={17}
            color={out ? C.red : done ? C.green : bad ? C.red : C.accent}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          {item.kind === "withdrawal" ? (
            <>
              <Text style={s.reference}>ETB {money(item.amount)}</Text>
              {(() => {
                const status = cashOutStatus(item);
                return (
                  <View style={s.statusLine}>
                    {status.busy && <ActivityIndicator size="small" color={C.dim} />}
                    <Text
                      style={[
                        s.time,
                        status.tone === "green" && s.statusGood,
                        status.tone === "red" && s.statusBad,
                      ]}
                    >
                      {status.text} · {relativeTime(item.at)}
                    </Text>
                  </View>
                );
              })()}
              {/* The payout itself. Only while it is waiting: once it is running
                  or over, there is nothing to approve. */}
              {item.stage === "awaiting" && (
                <Pressable
                  style={({ pressed }) => [s.payBtn, pressed && { opacity: 0.75 }]}
                  onPress={() => confirmPayOut(item)}
                >
                  <Feather name="send" size={14} color="#fff" />
                  <Text style={s.payBtnText}>Send ETB {money(item.amount)}</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Text style={s.reference}>{item.reference}</Text>
              {(() => {
                const status = depositStatus(item);
                return (
                  <View style={s.statusLine}>
                    {status.busy && <ActivityIndicator size="small" color={C.dim} />}
                    <Text
                      style={[
                        s.time,
                        status.tone === "green" && s.statusGood,
                        status.tone === "red" && s.statusBad,
                      ]}
                    >
                      {status.text} · {relativeTime(item.at)}
                    </Text>
                  </View>
                );
              })()}
            </>
          )}
        </View>
        <Pressable onPress={() => dismiss(item.id)} hitSlop={10} style={s.dismiss}>
          <Feather name="x" size={16} color={C.faint} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        title="Notifications"
        subtitle={STATE_TEXT[state]}
        back
        right={
          alerts.length > 0 ? (
            <Pressable onPress={clear} hitSlop={HIT} style={{ paddingHorizontal: SP.xs }}>
              <Text style={s.clear}>Clear all</Text>
            </Pressable>
          ) : undefined
        }
      />

      {(counts.total > 0 || counts.toPay > 0) && (
        <View style={s.summary}>
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: C.green }]}>{counts.confirmed}</Text>
            <Text style={s.summaryLabel}>confirmed</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: C.red }]}>{counts.failed}</Text>
            <Text style={s.summaryLabel}>failed</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: C.dim }]}>{counts.working}</Text>
            <Text style={s.summaryLabel}>checking</Text>
          </View>
          <View style={s.summaryDivider} />
          <View style={s.summaryItem}>
            <Text style={[s.summaryNum, { color: counts.toPay > 0 ? C.accent : C.dim }]}>
              {counts.toPay}
            </Text>
            <Text style={s.summaryLabel}>to pay</Text>
          </View>
        </View>
      )}

      {unreadable && (
        <View style={s.diag}>
          <Text style={s.diagTitle}>
            {scrape && scrape.rows === 0
              ? "The transaction list could not be read"
              : "No reference numbers in the history"}
          </Text>
          <Text style={s.diagText}>
            {scrape
              ? scrape.rows === 0
                ? `The history opened but none of its ${scrape.texts.length} lines of text looked like a transaction. Send them so the reading can be fixed for this build of telebirr.`
                : `The last read saw ${scrape.rows} transaction${scrape.rows === 1 ? "" : "s"} but no reference numbers among them. Send the screen text so the matching can be fixed for this build.`
              : "Run a check again to capture what telebirr's history screen actually shows."}
          </Text>
          {scrape && (
            <Pressable
              style={({ pressed }) => [s.diagBtn, pressed && { opacity: 0.7 }]}
              onPress={shareScrape}
            >
              <Feather name="share" size={14} color="#fff" />
              <Text style={s.diagBtnText}>Share what telebirr showed</Text>
            </Pressable>
          )}
        </View>
      )}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 28 }}
        ListHeaderComponent={
          alerts.length > 0 ? (
            <Text style={s.lead}>
              Both kinds run on their own. A deposit opens telebirr and confirms the receipt; a
              cash-out opens telebirr and sends the money straight to the customer. Take the cash
              before the transfer lands — nothing here waits for you.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Feather name="bell" size={22} color={C.faint} />
            </View>
            <Text style={s.emptyTitle}>Nothing yet</Text>
            <Text style={s.emptyDim}>
              Deposit references and cash-out requests appear here the moment a customer
              sends them.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SP.gutter,
    paddingTop: 4,
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
  clear: { fontSize: 13, fontWeight: "600", color: C.accent },

  lead: {
    paddingHorizontal: SP.gutter,
    paddingBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    color: C.dim,
  },

  card: {
    marginHorizontal: SP.gutter,
    marginBottom: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.row,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  // Unread keeps the accent edge until the agent has opened this screen.
  rowUnread: { borderColor: "#cfdcff", backgroundColor: C.accentSoft },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#dbe6ff",
  },
  iconOut: { backgroundColor: C.redSoft },
  iconDone: { backgroundColor: C.greenSoft },
  iconBad: { backgroundColor: C.redSoft },

  diag: {
    marginHorizontal: SP.gutter,
    marginBottom: 12,
    padding: 14,
    gap: 8,
    borderRadius: R.card,
    backgroundColor: C.amberSoft,
    borderWidth: 1,
    borderColor: "#f0dcb4",
  },
  diagTitle: { fontSize: 14, fontWeight: "600", color: "#6d4d11" },
  diagText: { fontSize: 12, lineHeight: 18, color: C.amber },
  diagBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 38,
    borderRadius: R.btn,
    backgroundColor: C.accent,
  },
  diagBtnText: { fontSize: 13, fontWeight: "600", color: "#fff" },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: SP.gutter,
    marginBottom: 14,
    paddingVertical: 12,
    borderRadius: R.row,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  summaryItem: { flex: 1, alignItems: "center", gap: 2 },
  summaryNum: { fontSize: 18, fontWeight: "700", ...TABULAR },
  summaryLabel: { fontSize: 11, color: C.dim },
  summaryDivider: { width: 1, alignSelf: "stretch", backgroundColor: C.divider },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusGood: { color: C.green, fontWeight: "600" },
  statusBad: { color: C.red },
  reference: { fontSize: 14, fontWeight: "600", color: C.text, ...TABULAR },
  time: { fontSize: 11, color: C.faint },
  dismiss: { padding: 4 },
  payBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    alignSelf: "flex-start",
    height: 34,
    marginTop: 7,
    paddingHorizontal: 13,
    borderRadius: R.btn,
    backgroundColor: C.accent,
  },
  payBtnText: { fontSize: 12.5, fontWeight: "600", color: "#fff" },

  empty: { alignItems: "center", gap: 8, paddingTop: 64, paddingHorizontal: 48 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    marginBottom: 4,
  },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: C.text },
  emptyDim: { fontSize: 12.5, lineHeight: 19, color: C.dim, textAlign: "center" },
});
