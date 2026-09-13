import { useEffect, useMemo, useState } from "react";
import { View, Text, SectionList, Pressable, TextInput, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import {
  loadSnapshot,
  groupByDay,
  totals,
  money,
  signedMoney,
  relativeTime,
  txMeta,
  TelebirrSnapshot,
  TelebirrTransaction,
  EMPTY_SNAPSHOT,
} from "../lib/telebirrData";
import { C, R, SP, T, TABULAR } from "../lib/theme";
import { ScreenHeader, HeaderButton } from "../components/ScreenHeader";

type Filter = "all" | "in" | "out";

const TABS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "in", label: "Received" },
  { id: "out", label: "Sent" },
];

export default function Transactions() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [snapshot, setSnapshot] = useState<TelebirrSnapshot>(EMPTY_SNAPSHOT);
  const [filter, setFilter] = useState<Filter>("all");
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    loadSnapshot().then(setSnapshot);
  }, []);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return snapshot.transactions.filter((tx) => {
      if (filter === "in" && tx.value <= 0) return false;
      if (filter === "out" && tx.value >= 0) return false;
      if (!needle) return true;
      return (
        tx.name.toLowerCase().includes(needle) ||
        tx.receipt.toLowerCase().includes(needle) ||
        tx.kind.toLowerCase().includes(needle)
      );
    });
  }, [snapshot.transactions, filter, query]);

  const sections = useMemo(() => groupByDay(visible), [visible]);
  const sums = useMemo(() => totals(visible), [visible]);

  const renderRow = (tx: TelebirrTransaction) => {
    const incoming = tx.value > 0;
    return (
      <Pressable
        style={({ pressed }) => [s.card, s.row, pressed && { opacity: 0.7 }]}
        onPress={() => router.push(`/transaction/${tx.id}`)}
      >
        <View style={[s.icon, { backgroundColor: incoming ? C.greenSoft : C.redSoft }]}>
          <Feather
            name={incoming ? "arrow-down-left" : "arrow-up-right"}
            size={18}
            color={incoming ? C.green : C.red}
          />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={s.name} numberOfLines={1}>
            {tx.name}
          </Text>
          <Text style={s.dim}>{txMeta(tx)}</Text>
        </View>
        <Text style={[s.amount, { color: incoming ? C.green : C.text }]}>
          {signedMoney(tx.value)}
        </Text>
        <Feather name="chevron-right" size={14} color="#aab5c9" />
      </Pressable>
    );
  };

  return (
    <View style={s.screen}>
      <ScreenHeader
        title="Transactions"
        subtitle={`${snapshot.transactions.length} held · read ${relativeTime(snapshot.readAt)}`}
        back
        right={
          <HeaderButton
            icon={searching ? "x" : "search"}
            tint={C.text}
            onPress={() => {
              setSearching((v) => !v);
              setQuery("");
            }}
          />
        }
      />

      {searching && (
        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Name or receipt number"
          placeholderTextColor={C.faint}
          autoFocus
          autoCapitalize="none"
        />
      )}

      <View style={s.tabs}>
        {TABS.map((tab) => {
          const on = filter === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={[s.tab, on && { backgroundColor: C.accent }]}
              onPress={() => setFilter(tab.id)}
            >
              <Text style={[s.tabText, on && { color: "#fff", fontWeight: "600" }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={s.summary}>
        <Text style={s.dim}>
          {visible.length} {visible.length === 1 ? "transaction" : "transactions"}
        </Text>
        <View style={s.dot} />
        {sums.in > 0 && <Text style={[s.sumIn, TABULAR]}>in {money(sums.in)}</Text>}
        {sums.out > 0 && <Text style={[s.sumOut, TABULAR]}>out {money(sums.out)}</Text>}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(tx) => tx.id}
        renderItem={({ item }) => renderRow(item)}
        renderSectionHeader={({ section }) => <Text style={s.day}>{section.title}</Text>}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={s.empty}>
            <Feather name="inbox" size={22} color={C.faint} />
            <Text style={s.dim}>Nothing matches that filter.</Text>
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

  search: {
    marginHorizontal: SP.gutter,
    marginBottom: 12,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: R.row,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    color: C.text,
    fontSize: 14,
  },

  tabs: {
    flexDirection: "row",
    gap: 6,
    marginHorizontal: SP.gutter,
    padding: 4,
    borderRadius: R.row,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  tab: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  tabText: { fontSize: 13, fontWeight: "500", color: C.dim },

  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: SP.gutter,
    paddingTop: 16,
  },
  dim: { ...T.small, color: C.dim },
  dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: C.borderStrong },
  sumIn: { fontSize: 12, fontWeight: "600", color: C.green },
  sumOut: { fontSize: 12, fontWeight: "600", color: C.red },

  day: {
    paddingHorizontal: SP.gutter,
    paddingTop: 20,
    paddingBottom: 10,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: C.dim,
  },

  card: {
    marginHorizontal: SP.gutter,
    marginBottom: 8,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.row,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 14, fontWeight: "500", color: C.text },
  amount: { fontSize: 14, fontWeight: "600", ...TABULAR },


  empty: { alignItems: "center", gap: 10, paddingTop: 48 },
});
