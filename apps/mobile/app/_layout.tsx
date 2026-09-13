import { View } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import Feather from "@expo/vector-icons/Feather";
import { C } from "../lib/theme";
import { RealtimeProvider } from "../lib/realtime";

/** The telebirr screens are light and draw their own headers. */
const LIGHT = { headerShown: false, contentStyle: { backgroundColor: C.ground } } as const;

export default function Layout() {
  // Every icon in the app is a Feather glyph, and the icon set renders nothing
  // at all until its font is in memory — which showed up as buttons that were
  // there and tappable but invisible. Loaded here so it is in memory before the
  // first screen paints. Deliberately NOT a gate: if the font cannot be loaded
  // the app still has to run, with text-only buttons, rather than never
  // painting at all.
  const [fontsLoaded, fontError] = useFonts(Feather.font);
  if (fontError) console.warn("[fonts] Feather failed to load:", fontError);
  if (!fontsLoaded && !fontError) {
    console.log("[fonts] Feather still loading");
  }

  return (
    <SafeAreaProvider>
      {/* Dark status-bar icons: the app now opens on a light screen. */}
      <StatusBar style="dark" />
      {/* Above the Stack so the socket outlives any one screen: a reference
          pushed while the agent is deep in settings still lands in the list. */}
      <RealtimeProvider>
        <Stack
          screenOptions={{
            // The two developer screens keep a native header; it is the app's
            // light one now, so they no longer arrive under a navy bar that
            // belongs to a palette nothing else uses.
            headerStyle: { backgroundColor: C.ground },
            headerTintColor: C.text,
            headerTitleStyle: { fontWeight: "700" },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: C.ground },
          }}
        >
          <Stack.Screen name="enroll" options={{ ...LIGHT, gestureEnabled: false }} />
          <Stack.Screen name="index" options={LIGHT} />
          <Stack.Screen name="transactions" options={LIGHT} />
          <Stack.Screen name="transaction/[id]" options={LIGHT} />
          <Stack.Screen name="settings" options={LIGHT} />
          <Stack.Screen name="dashboard" options={{ title: "AutoPilot" }} />
          <Stack.Screen name="scrape" options={{ title: "Live Scrape" }} />
          <Stack.Screen name="notifications" options={LIGHT} />
        </Stack>
      </RealtimeProvider>
    </SafeAreaProvider>
  );
}
