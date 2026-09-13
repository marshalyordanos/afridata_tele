import { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useRouter } from "expo-router";
import { C, R, SP, T, SHADOW } from "../lib/theme";
import { Macro, loadMacros, saveMacros, runMacro, RunResult } from "../lib/macros";
import { useAccessibility } from "../lib/accessibility";
import { useAgent } from "../lib/agent";
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
    name: "Open Settings · scrape all text",
    steps: [
      { type: "openApp", pkg: "com.android.settings" },
      { type: "wait", ms: 1500 },
      { type: "scrape", label: "settings_home" },
    ],
  },
  {
    id: "demo-telebirr",
    name: "Open telebirr · scrape home",
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
    name: "Chrome · tap search · scrape",
    steps: [
      { type: "openApp", pkg: "com.android.chrome" },
      { type: "wait", ms: 2000 },
      { type: "scrape", label: "chrome_home" },
    ],
  },
];

export default function Dashboard() {
  const router = useRouter();
  // Same live state as the home banner: bound-and-callable, not just switched on.
  const access = useAccessibility();
  const enabled = access.on;
  // Macros sign in as whoever enrolled on this handset.
  const { agent } = useAgent();
  const [macros, setMacros] = useState<Macro[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [openError, setOpenError] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    loadMacros().then((m) => setMacros(m.length ? m : DEMOS));
  }, []);

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
    if (!agent) {
      Alert.alert("Not signed in", "Enrol with your agent number and PIN first.");
      return;
    }
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
        { text: "Send", onPress: () => agent && run(buildTelebirrSendMoneyMacro(value, agent)) },
      ],
    );
  };

  const seedDemos = async () => {
    await saveMacros(DEMOS);
    setMacros(DEMOS);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: 16 }}>
      <StatusBar style="dark" />
      {/* Service status */}
      <View style={[styles.card, enabled ? styles.ok : styles.warn]}>
        <Text style={styles.cardTitle}>
          {enabled
            ? "✅ Accessibility enabled"
            : access.state === "starting"
            ? "⏳ Accessibility starting"
            : "⚠️ Accessibility OFF"}
        </Text>
        <Text style={styles.dim}>
          {enabled
            ? "The engine can now open apps, click, and scrape."
            : access.state === "starting"
            ? "Switched on — Android is still connecting the service."
            : "Turn on AutoPilot in Accessibility settings to enable automation."}
        </Text>
        {!enabled && (
          <Pressable
            style={styles.btn}
            onPress={access.open}
          >
            <Text style={styles.btnText}>Open Accessibility Settings</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>telebirr</Text>
        <Text style={styles.dim}>
          One tap: open telebirr, fill your number, and sign in with your PIN —
          or carry straight on through Send Money · Individual and fill in the
          transfer.
        </Text>
        <Pressable
          style={[styles.btn, styles.btnGreen]}
          onPress={() => agent && run(buildTelebirrLoginMacro(agent))}
          disabled={!!running || !agent}
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
        <Pressable
          style={[styles.btn, styles.btnDark]}
          onPress={() => router.push("/")}
        >
          <Text style={[styles.btnText, styles.btnDarkText]}>Account & transactions</Text>
        </Pressable>
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

      <Pressable
        style={[styles.macro, { borderColor: C.accentBorder, backgroundColor: C.accentSoft }]}
        onPress={() => router.push("/scrape")}
      >
        <Text style={styles.macroName}>Live Scrape tool</Text>
        <Text style={styles.dim}>Open any app, then dump its screen text</Text>
      </Pressable>

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
  screen: { flex: 1, backgroundColor: C.ground },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.card,
    padding: SP.lg,
    marginBottom: SP.lg,
    borderWidth: 1,
    borderColor: C.border,
    ...SHADOW.card,
  },
  ok: { backgroundColor: C.greenSoft, borderColor: "#bfe0cd" },
  warn: { backgroundColor: C.amberSoft, borderColor: "#f0dcb4" },
  cardTitle: { ...T.heading, color: C.text },
  dim: { ...T.small, color: C.dim, marginTop: SP.xs, lineHeight: 18 },
  h2: { ...T.title, color: C.text, marginVertical: SP.sm },
  h3: { ...T.body, fontWeight: "600", color: C.text },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  link: { ...T.small, fontWeight: "700", color: C.accent },
  btn: {
    backgroundColor: C.accent,
    borderRadius: R.btn,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    marginTop: SP.md,
  },
  btnText: { ...T.body, fontWeight: "600", color: "#fff" },
  macro: {
    backgroundColor: C.surface,
    borderRadius: R.row,
    padding: SP.md,
    marginBottom: SP.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  macroName: { ...T.body, fontWeight: "600", color: C.text },
  play: { ...T.small, fontWeight: "700", color: C.green, marginTop: SP.xs },
  logLine: { ...T.mono, fontSize: 11.5, color: C.dim, marginTop: 2 },
  scrapeLine: { ...T.small, color: C.text, marginTop: 2 },
  viewId: { ...T.mono, fontSize: 10.5, color: C.faint },
  err: { ...T.small, color: C.red, marginTop: SP.sm },
  btnGreen: { backgroundColor: C.green },
  btnDark: { backgroundColor: C.surfaceAlt, borderWidth: 1, borderColor: C.border },
  btnDarkText: { color: C.text },
  btnViolet: { backgroundColor: "#5b3fa8" },
  input: {
    backgroundColor: C.surfaceAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.btn,
    paddingHorizontal: SP.md,
    height: 46,
    marginTop: SP.md,
    color: C.text,
    fontSize: 15,
  },
  hint: { ...T.small, color: C.amber, marginTop: SP.sm, lineHeight: 18 },
});
