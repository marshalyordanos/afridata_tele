import { useEffect, useRef } from "react";
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRealtime, type CustomerRequest } from "../lib/realtime";
import { money, relativeTime } from "../lib/telebirrData";
import { C, R, TABULAR } from "../lib/theme";

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
      return { text: "Checking telebirr…", tone: "dim", busy: true };
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

export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alerts, unread, state, markAllRead, dismiss, clear } = useRealtime();

  // Opening the screen is what marks them read, so the badge clears the moment
  // the agent has actually seen them — not when the push arrived. Their ids are
  // kept first, so the accent edge still shows what is new to this visit after
  // the stored flag has been cleared; one that arrives while the screen is open
  // is marked read too, rather than leaving a badge for something in plain view.
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
    const done = item.kind === "deposit" && item.stage === "confirmed";
    return (
      <View style={[s.card, s.row, newIds.current.has(item.id) && s.rowUnread]}>
        <View style={[s.icon, out && s.iconOut, done && s.iconDone]}>
          <Feather
            name={out ? "arrow-up-right" : done ? "check" : "hash"}
            size={17}
            color={out ? C.red : done ? C.green : C.accent}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          {out ? (
            <>
              <Text style={s.reference}>ETB {money(item.amount)}</Text>
              <Text style={s.time}>
                Cash out to {item.phone} · {relativeTime(item.at)}
              </Text>
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
      <View style={{ height: insets.top }} />

      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={() => router.back()} hitSlop={6}>
          <Feather name="chevron-left" size={24} color={C.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>Notifications</Text>
          <Text style={[s.subtitle, state === "offline" && { color: C.red }]}>
            {STATE_TEXT[state]}
          </Text>
        </View>
        {alerts.length > 0 && (
          <Pressable onPress={clear} hitSlop={8} style={{ marginRight: -4 }}>
            <Text style={s.clear}>Clear all</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        renderItem={renderRow}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 28 }}
        ListHeaderComponent={
          alerts.length > 0 ? (
            <Text style={s.lead}>
              Deposits check themselves: the phone opens telebirr, finds the receipt and
              confirms the amount. Cash-outs are yours to pay.
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
    paddingHorizontal: 20,
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
  title: { fontSize: 19, fontWeight: "600", color: C.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, color: C.dim, marginTop: 1 },
  clear: { fontSize: 13, fontWeight: "600", color: C.accent },

  lead: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    fontSize: 12,
    lineHeight: 18,
    color: C.dim,
  },

  card: {
    marginHorizontal: 20,
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
  statusLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  statusGood: { color: C.green, fontWeight: "600" },
  statusBad: { color: C.red },
  reference: { fontSize: 14, fontWeight: "600", color: C.text, ...TABULAR },
  time: { fontSize: 11, color: C.faint },
  dismiss: { padding: 4 },

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
