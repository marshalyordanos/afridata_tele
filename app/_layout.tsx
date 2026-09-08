import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { C } from "../lib/theme";

export default function Layout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0b0f1a" },
          headerTintColor: "#e6edf7",
          contentStyle: { backgroundColor: "#0b0f1a" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "AutoPilot" }} />
        <Stack.Screen name="scrape" options={{ title: "Live Scrape" }} />
        {/* The telebirr screens are light and draw their own headers. */}
        <Stack.Screen
          name="telebirr"
          options={{ headerShown: false, contentStyle: { backgroundColor: C.ground } }}
        />
        <Stack.Screen
          name="transactions"
          options={{ headerShown: false, contentStyle: { backgroundColor: C.ground } }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
