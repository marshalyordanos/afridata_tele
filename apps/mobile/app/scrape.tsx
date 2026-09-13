import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import AutoAccessibility, { ScrapedNode } from "auto-accessibility";
import { C, R, SP, T } from "../lib/theme";

/**
 * Live scraping playground: type a package, open it, then dump every text node
 * on whatever screen is currently showing. Tap a clickable node to click it.
 */
export default function Scrape() {
  const [pkg, setPkg] = useState("com.android.settings");
  const [nodes, setNodes] = useState<ScrapedNode[]>([]);
  const [current, setCurrent] = useState("");

  const open = async () => {
    try {
      await AutoAccessibility.openApp(pkg.trim());
    } catch (e: any) {
      setCurrent("error: " + e.message);
    }
  };

  const dump = async () => {
    const n = await AutoAccessibility.scrapeScreen();
    setNodes(n);
    setCurrent(await AutoAccessibility.currentApp());
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <TextInput
        value={pkg}
        onChangeText={setPkg}
        placeholder="com.instagram.android"
        placeholderTextColor="#5c6b85"
        style={styles.input}
        autoCapitalize="none"
      />
      <View style={styles.row}>
        <Pressable style={styles.btn} onPress={open}>
          <Text style={styles.btnText}>Open app</Text>
        </Pressable>
        <Pressable style={[styles.btn, styles.btnAlt]} onPress={dump}>
          <Text style={styles.btnText}>Scrape screen</Text>
        </Pressable>
      </View>
      {!!current && <Text style={styles.dim}>on: {current} · {nodes.length} nodes</Text>}

      <ScrollView style={{ flex: 1, marginTop: 12 }}>
        {nodes.map((n, i) => (
          <Pressable
            key={i}
            style={styles.node}
            onPress={() => n.clickable && AutoAccessibility.tap(n.x, n.y)}
          >
            <Text style={styles.nodeText}>{n.text || n.description}</Text>
            <Text style={styles.nodeMeta}>
              {n.clickable ? "clickable · " : ""}
              {n.viewId ? n.viewId.split("/").pop() : `(${n.x},${n.y})`}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.ground, padding: SP.lg },
  input: {
    backgroundColor: C.surface,
    color: C.text,
    borderRadius: R.btn,
    paddingHorizontal: SP.md,
    height: 46,
    borderWidth: 1,
    borderColor: C.border,
    ...T.mono,
    fontSize: 14,
  },
  row: { flexDirection: "row", gap: SP.sm, marginTop: SP.sm },
  btn: {
    flex: 1,
    backgroundColor: C.accent,
    borderRadius: R.btn,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  btnAlt: { backgroundColor: C.green },
  btnText: { ...T.small, fontWeight: "700", color: "#fff" },
  dim: { ...T.small, color: C.dim, marginTop: SP.sm },
  node: {
    backgroundColor: C.surface,
    borderRadius: R.tile,
    padding: SP.md,
    marginBottom: SP.sm,
    borderWidth: 1,
    borderColor: C.border,
  },
  nodeText: { ...T.body, color: C.text },
  nodeMeta: { ...T.mono, fontSize: 10.5, color: C.faint, marginTop: 2 },
});
