import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { C } from "../lib/theme";

/** The telebirr screens are light and draw their own headers. */
const LIGHT = { headerShown: false, contentStyle: { backgroundColor: C.ground } } as const;

export default function Layout() {
  return (
    <SafeAreaProvider>
      {/* Dark status-bar icons: the app now opens on a light screen. */}
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0b0f1a" },
          headerTintColor: "#e6edf7",
          contentStyle: { backgroundColor: C.ground },
        }}
      >
        <Stack.Screen name="index" options={LIGHT} />
        <Stack.Screen name="transactions" options={LIGHT} />
        <Stack.Screen name="transaction/[id]" options={LIGHT} />
        <Stack.Screen name="dashboard" options={{ title: "AutoPilot" }} />
        <Stack.Screen name="scrape" options={{ title: "Live Scrape" }} />
      </Stack>
    </SafeAreaProvider>
  );
}
