import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
} from "react-native";
import AutoAccessibility, { ScrapedNode } from "auto-accessibility";

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
  screen: { flex: 1, backgroundColor: "#0b0f1a", padding: 16 },
  input: {
    backgroundColor: "#141b2e",
    color: "#e6edf7",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#233047",
  },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },
  btn: {
    flex: 1,
    backgroundColor: "#2b6cff",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnAlt: { backgroundColor: "#1f7a4d" },
  btnText: { color: "white", fontWeight: "700" },
  dim: { color: "#8ba0c0", marginTop: 10, fontSize: 12 },
  node: {
    backgroundColor: "#141b2e",
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: "#233047",
  },
  nodeText: { color: "#e6edf7", fontSize: 14 },
  nodeMeta: { color: "#6f83a3", fontSize: 11, marginTop: 2 },
});
