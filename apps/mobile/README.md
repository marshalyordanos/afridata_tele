# AutoPilot — Android app automation & scraping (Expo + Kotlin)

An app that can **open other apps, click tabs/buttons in them, and scrape their
on-screen content** — then use that data elsewhere. Built with Expo (React Native
UI) + a native **Kotlin Accessibility Service** (the real engine).

## Why it needs a native build (not Expo Go)
Android only lets one app read/control another through an **Accessibility Service**,
which is native Kotlin. So this uses an Expo **development build**, not Expo Go.

## What it can do
- `openApp(pkg)` — launch any installed app
- `scrapeScreen()` — read EVERY text node on the current screen (the scraping)
- `clickByText` / `clickByViewId` / `tap(x,y)` — press things in other apps
- `swipe`, `typeText`, `pressBack`, `pressHome`
- Macro engine: chain steps into saved automations (see `lib/macros.ts`)

## First-time setup
```bash
cd AutoPilot
npm install
npx expo install expo-router expo-linking expo-constants expo-status-bar \
  react-native-safe-area-context react-native-screens \
  @react-native-async-storage/async-storage
npx expo prebuild --platform android   # generates android/, runs the config plugin
npx expo run:android                   # build + install on a connected device/emulator
```
> Needs Android Studio / SDK + a device (USB debugging) or emulator.

## Using it
1. Launch AutoPilot. It shows **⚠️ Accessibility OFF**.
2. Tap **Open Accessibility Settings** → enable **AutoPilot**.
3. Back in the app it flips to **✅ enabled**.
4. Run a demo macro, or open **Live Scrape** to dump any app's screen text.

## How the pieces fit
```
app/                     Expo Router UI (dashboard, live scrape)
lib/macros.ts            macro types + run engine + storage
modules/auto-accessibility/
  plugin.js              injects the <service> into AndroidManifest
  src/AutoAccessibility.ts   typed JS wrapper
  android/.../AutoAccessibilityService.kt   the engine (read screen, tap, gesture)
  android/.../AutoAccessibilityModule.kt    JS<->Kotlin bridge
```

## Find an app's package name
On a connected device:
```bash
adb shell pm list packages | grep instagram
```

## ⚠️ Notes
- Accessibility automation is powerful; use it only on your own device/accounts and
  respect each app's terms. Banking/finance apps often block accessibility scraping.
- Coordinates from `tap`/`swipe` are device-resolution specific; prefer `clickByText`
  / `clickByViewId` for portability.
