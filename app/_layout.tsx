import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

export default function Layout() {
  return (
    <>
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
      </Stack>
    </>
  );
}
