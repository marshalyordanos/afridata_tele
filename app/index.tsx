import { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import AutoAccessibility from "auto-accessibility";
import { Macro, loadMacros, saveMacros, runMacro, RunResult } from "../lib/macros";
import { TELEBIRR, openKnownApp } from "../lib/apps";
import {
  buildTelebirrLoginMacro,
  buildTelebirrSendMoneyMacro,
  TELEBIRR_RECIPIENT,
} from "../lib/telebirr";

// A couple of ready-made demo macros so you can see it work immediately.
const DEMOS: Macro[] = [
  {
    id: "demo-scrape-settings",
    name: "Open Settings → scrape all text",
    steps: [
      { type: "openApp", pkg: "com.android.settings" },
      { type: "wait", ms: 1500 },
      { type: "scrape", label: "settings_home" },
    ],
  },
  {
    id: "demo-telebirr",
    name: "Open telebirr \u2192 scrape home",
    steps: [
      {
        type: "openApp",
        pkg: TELEBIRR.packages[0],
        alt: TELEBIRR.packages.slice(1),
        label: TELEBIRR.label,
      },
      { type: "wait", ms: 3000 },
      { type: "scrape", label: "telebirr_home" },
    ],
  },
  {
    id: "demo-chrome-search",
    name: "Chrome → tap search → scrape",
    steps: [
      { type: "openApp", pkg: "com.android.chrome" },
      { type: "wait", ms: 2000 },
      { type: "scrape", label: "chrome_home" },
    ],
  },
];

export default function Home() {
  const [enabled, setEnabled] = useState(false);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [amount, setAmount] = useState("");

  const refresh = useCallback(() => {
    try {
      setEnabled(AutoAccessibility.isServiceEnabled());
    } catch {
      setEnabled(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    loadMacros().then((m) => setMacros(m.length ? m : DEMOS));
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [refresh]);

  const run = async (macro: Macro) => {
    setRunning(macro.id);
    setResult(null);
    const r = await runMacro(macro);
    setResult(r);
    setRunning(null);
  };

  const openTelebirr = async () => {
    setOpenError("");
    try {
      await openKnownApp(TELEBIRR);
    } catch (e: any) {
      setOpenError(e?.message ?? String(e));
    }
  };

  // Real money leaves the account at the end of this one, so the amount and the
  // recipient get read back once before the macro starts.
  const sendMoney = () => {
    const value = amount.trim();
    if (!(Number(value) > 0)) {
      Alert.alert("Enter an amount", "Type how much to send first.");
      return;
    }
    Alert.alert(
      "Send money?",
      `${value} to ${TELEBIRR_RECIPIENT.full}.\n\n` +
        "AutoPilot fills the form and taps Send; telebirr will still ask for your PIN.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Send", onPress: () => run(buildTelebirrSendMoneyMacro(value)) },
      ],
    );
  };

  const seedDemos = async () => {
    await saveMacros(DEMOS);
    setMacros(DEMOS);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      {/* Service status */}
      <View style={[styles.card, enabled ? styles.ok : styles.warn]}>
        <Text style={styles.cardTitle}>
          {enabled ? "✅ Accessibility enabled" : "⚠️ Accessibility OFF"}
        </Text>
        <Text style={styles.dim}>
          {enabled
            ? "The engine can now open apps, click, and scrape."
            : "Turn on AutoPilot in Accessibility settings to enable automation."}
        </Text>
        {!enabled && (
          <Pressable
            style={styles.btn}
            onPress={() => AutoAccessibility.openAccessibilitySettings()}
          >
            <Text style={styles.btnText}>Open Accessibility Settings</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>telebirr</Text>
        <Text style={styles.dim}>
          One tap: open telebirr, fill your number, and sign in with your PIN —
          or carry straight on through Send Money → Individual and fill in the
          transfer.
        </Text>
        <Pressable
          style={[styles.btn, styles.btnGreen]}
          onPress={() => run(buildTelebirrLoginMacro())}
          disabled={!!running}
        >
          <Text style={styles.btnText}>
            {running === "telebirr-login" ? "signing in…" : "🔐 Sign in to telebirr"}
          </Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
          placeholder="Amount in birr"
          placeholderTextColor="#5c6f8c"
          editable={!running}
        />
        <Pressable
          style={[styles.btn, styles.btnViolet]}
          onPress={sendMoney}
          disabled={!!running}
        >
          <Text style={styles.btnText}>
            {running === "telebirr-send-money"
              ? "sending…"
              : `💸 Send to ${TELEBIRR_RECIPIENT.full}`}
          </Text>
        </Pressable>
        <Link href="/telebirr" asChild>
          <Pressable style={[styles.btn, styles.btnDark]}>
            <Text style={styles.btnText}>Account & transactions</Text>
          </Pressable>
        </Link>
        <Pressable style={styles.btn} onPress={openTelebirr} disabled={!!running}>
          <Text style={styles.btnText}>Just open telebirr</Text>
        </Pressable>
        <Text style={styles.hint}>
          telebirr blocks login over Wi-Fi — turn on mobile data first.
        </Text>
        {!!openError && <Text style={styles.err}>{openError}</Text>}
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.h2}>Macros</Text>
        <Pressable onPress={seedDemos}>
          <Text style={styles.link}>Reset demos</Text>
        </Pressable>
      </View>

      {macros.map((m) => (
        <Pressable
          key={m.id}
          style={styles.macro}
          onPress={() => run(m)}
          disabled={!!running}
        >
          <Text style={styles.macroName}>{m.name}</Text>
          <Text style={styles.dim}>{m.steps.length} steps</Text>
          <Text style={styles.play}>
            {running === m.id ? "running…" : "▶ run"}
          </Text>
        </Pressable>
      ))}

      <Link href="/scrape" asChild>
        <Pressable style={[styles.macro, { borderColor: "#2b6cff" }]}>
          <Text style={styles.macroName}>🔍 Live Scrape tool</Text>
          <Text style={styles.dim}>Open any app, then dump its screen text</Text>
        </Pressable>
      </Link>

      {result && (
        <View style={styles.card}>
          <Text style={styles.h2}>Result {result.ok ? "✅" : "❌"}</Text>
          {result.log.map((l, i) => (
            <Text key={i} style={styles.logLine}>
              {l}
            </Text>
          ))}
          {Object.entries(result.scraped).map(([label, nodes]) => (
            <View key={label} style={{ marginTop: 10 }}>
              <Text style={styles.h3}>{label} ({nodes.length})</Text>
              {nodes.slice(0, 60).map((n, i) => (
                <Text key={i} style={styles.scrapeLine}>
                  {n.clickable ? "👆" : "•"} {n.text || n.description || "—"}
                  {!!n.viewId && (
                    <Text style={styles.viewId}> {n.viewId.split("/").pop()}</Text>
                  )}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0b0f1a" },
  card: {
    backgroundColor: "#141b2e",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#233047",
  },
  ok: { borderColor: "#1f7a4d" },
  warn: { borderColor: "#7a5a1f" },
  cardTitle: { color: "#e6edf7", fontSize: 16, fontWeight: "700" },
  dim: { color: "#8ba0c0", marginTop: 4, fontSize: 13 },
  h2: { color: "#e6edf7", fontSize: 18, fontWeight: "700", marginVertical: 10 },
  h3: { color: "#c9d6ec", fontSize: 14, fontWeight: "600" },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  link: { color: "#2b6cff", fontSize: 13 },
  btn: {
    backgroundColor: "#2b6cff",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  btnText: { color: "white", fontWeight: "700" },
  macro: {
    backgroundColor: "#141b2e",
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#233047",
  },
  macroName: { color: "#e6edf7", fontSize: 15, fontWeight: "600" },
  play: { color: "#4ade80", marginTop: 6, fontWeight: "700" },
  logLine: { color: "#9fb3d1", fontSize: 12, fontFamily: "monospace", marginTop: 2 },
  scrapeLine: { color: "#c9d6ec", fontSize: 13, marginTop: 2 },
  viewId: { color: "#6f86a8", fontSize: 11, fontFamily: "monospace" },
  err: { color: "#f87171", fontSize: 13, marginTop: 10 },
  btnGreen: { backgroundColor: "#1f7a4d" },
  btnDark: { backgroundColor: "#233047" },
  btnViolet: { backgroundColor: "#5b3fa8" },
  input: {
    backgroundColor: "#0b0f1a",
    borderWidth: 1,
    borderColor: "#233047",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
    color: "#e6edf7",
    fontSize: 15,
  },
  hint: { color: "#c79a3a", fontSize: 12, marginTop: 10 },
});
