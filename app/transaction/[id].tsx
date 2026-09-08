import { useEffect, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, Share } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { TELEBIRR, openKnownApp } from "../../lib/apps";
import {
  loadSnapshot,
  findTransaction,
  signedMoney,
  relativeTime,
  TelebirrSnapshot,
  TelebirrTransaction,
  EMPTY_SNAPSHOT,
} from "../../lib/telebirrData";
import { C, R, TABULAR } from "../../lib/theme";

export default function Receipt() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [snapshot, setSnapshot] = useState<TelebirrSnapshot>(EMPTY_SNAPSHOT);
  const [sourceOpen, setSourceOpen] = useState(true);

  useEffect(() => {
    loadSnapshot().then(setSnapshot);
  }, []);

  const tx = findTransaction(snapshot, String(id));

  if (!tx) {
    return (
      <View style={[s.screen, s.missing]}>
        <View style={{ height: insets.top }} />
        <Feather name="file-minus" size={24} color={C.faint} />
        <Text style={s.dim}>That receipt is no longer held.</Text>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={s.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const incoming = tx.value > 0;
  const accent = incoming ? C.green : C.text;

  const share = () => {
    Share.share({
      message: [
        `telebirr receipt ${tx.receipt}`,
        `${tx.kind} · ${tx.day} ${tx.time}`,
        `${tx.name}${tx.counterparty ? ` (${tx.counterparty})` : ""}`,
        `Amount: ETB ${signedMoney(tx.value)}`,
        `Service charge: ${tx.charge}`,
        `Balance after: ${tx.balanceAfter}`,
        `Status: ${tx.status}`,
      ].join("\n"),
    });
  };

  const fields: { label: string; value: string; mono?: boolean }[] = [
    { label: "Date & time", value: `${tx.day} · ${tx.time}` },
    { label: "Type", value: tx.kind },
    ...(tx.counterparty
      ? [{ label: incoming ? "From" : "To", value: tx.counterparty, mono: true }]
      : []),
    { label: "Receipt no.", value: tx.receipt, mono: true },
    { label: "Service charge", value: tx.charge, mono: true },
    { label: "Balance after", value: tx.balanceAfter, mono: true },
  ];

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
      <View style={{ height: insets.top }} />

      <View style={s.header}>
        <Pressable style={s.iconBtn} onPress={() => router.back()} hitSlop={6}>
          <Feather name="chevron-left" size={22} color={C.text} />
        </Pressable>
        <Text style={s.title}>Receipt</Text>
        <Pressable style={[s.iconBtn, { marginLeft: 0, marginRight: -11 }]} onPress={share} hitSlop={6}>
          <Feather name="share" size={19} color={C.text} />
        </Pressable>
      </View>

      {/* Hero */}
      <View style={s.hero}>
        <View style={[s.heroIcon, { backgroundColor: incoming ? C.greenSoft : C.redSoft }]}>
          <Feather
            name={incoming ? "arrow-down-left" : "arrow-up-right"}
            size={28}
            color={incoming ? C.green : C.red}
          />
        </View>
        <View style={s.heroAmount}>
          <Text style={s.currency}>ETB</Text>
          <Text style={[s.amount, { color: accent }]}>{signedMoney(tx.value)}</Text>
        </View>
        <Text style={s.name}>{tx.name}</Text>
        <View style={s.statusPill}>
          <Feather name="check" size={13} color={C.green} />
          <Text style={s.statusText}>{tx.status}</Text>
        </View>
      </View>

      {/* Fields */}
      <View style={s.card}>
        {fields.map((field, index) => (
          <View
            key={field.label}
            style={[s.fieldRow, index > 0 && { borderTopWidth: 1, borderTopColor: C.divider }]}
          >
            <Text style={s.dim}>{field.label}</Text>
            <Text style={[s.fieldValue, field.mono && { fontFamily: "monospace" }]}>
              {field.value}
            </Text>
          </View>
        ))}
      </View>

      {/* Where this row came from */}
      <View style={[s.card, { marginTop: 12, paddingHorizontal: 0, paddingVertical: 0 }]}>
        <Pressable
          style={s.sourceHead}
          onPress={() => tx.sourceNodes && setSourceOpen((v) => !v)}
        >
          <View style={s.sourceIcon}>
            <Feather name="code" size={17} color={C.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.sourceTitle}>Read by AutoPilot</Text>
            <Text style={s.dim}>telebirr receipt · {relativeTime(snapshot.readAt)}</Text>
          </View>
          {!!tx.sourceNodes && (
            <Feather
              name={sourceOpen ? "chevron-up" : "chevron-down"}
              size={14}
              color="#aab5c9"
            />
          )}
        </Pressable>
        {!!tx.sourceNodes && sourceOpen && (
          <View style={s.sourceBody}>
            {tx.sourceNodes.map((node) => (
              <View key={node.id} style={s.sourceRow}>
                <Text style={s.sourceId}>{node.id}</Text>
                <Text style={s.sourceText}>{node.text}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={s.actions}>
        <Pressable style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]} onPress={share}>
          <Feather name="share" size={17} color="#fff" />
          <Text style={s.primaryBtnText}>Share receipt</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [s.secondaryBtn, pressed && s.pressed]}
          onPress={() => openKnownApp(TELEBIRR).catch(() => {})}
        >
          <Feather name="smartphone" size={17} color={C.text} />
          <Text style={s.secondaryBtnText}>Open in telebirr</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground },
  missing: { alignItems: "center", justifyContent: "center", gap: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    marginLeft: -13,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: R.row,
  },
  title: { flex: 1, fontSize: 19, fontWeight: "600", color: C.text, letterSpacing: -0.3 },

  hero: { alignItems: "center", gap: 12, paddingTop: 18, paddingBottom: 26, paddingHorizontal: 20 },
  heroIcon: { width: 60, height: 60, borderRadius: 30, alignItems: "center", justifyContent: "center" },
  heroAmount: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  currency: { fontSize: 15, fontWeight: "600", color: C.dim },
  amount: { fontSize: 36, fontWeight: "600", letterSpacing: -0.9, ...TABULAR },
  name: { fontSize: 15, fontWeight: "500", color: C.text },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 28,
    paddingLeft: 9,
    paddingRight: 12,
    borderRadius: R.pill,
    backgroundColor: C.greenSoft,
  },
  statusText: { fontSize: 12, fontWeight: "600", color: C.green },

  card: {
    marginHorizontal: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.card,
    paddingHorizontal: 16,
    overflow: "hidden",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 13,
  },
  fieldValue: { flexShrink: 1, fontSize: 13, fontWeight: "500", color: C.text, textAlign: "right" },
  dim: { fontSize: 13, color: C.dim },

  sourceHead: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  sourceIcon: {
    width: 34,
    height: 34,
    borderRadius: R.btn,
    backgroundColor: C.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  sourceTitle: { fontSize: 13, fontWeight: "500", color: C.text },
  sourceBody: {
    backgroundColor: C.surfaceAlt,
    borderTopWidth: 1,
    borderTopColor: C.divider,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  sourceRow: { flexDirection: "row", gap: 10 },
  sourceId: { fontSize: 11, color: "#aab5c9", fontFamily: "monospace" },
  sourceText: { flex: 1, fontSize: 11, color: C.dim, fontFamily: "monospace" },

  actions: { gap: 10, marginHorizontal: 20, marginTop: 20 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: R.btn,
    backgroundColor: C.accent,
  },
  primaryBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    height: 48,
    borderRadius: R.btn,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: "600", color: C.text },
  pressed: { opacity: 0.75 },
  link: { fontSize: 13, fontWeight: "600", color: C.accent },
});
