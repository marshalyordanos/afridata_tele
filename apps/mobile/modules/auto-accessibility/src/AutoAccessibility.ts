import { requireNativeModule } from "expo-modules-core";

const Native = requireNativeModule("AutoAccessibility");

export interface ScrapedNode {
  text: string;
  description: string;
  viewId: string;
  clickable: boolean;
  x: number;
  y: number;
}

export interface InstalledApp {
  package: string;
  label: string;
}

/**
 * High-level, typed wrapper around the native accessibility engine.
 */
const AutoAccessibility = {
  isServiceEnabled(): boolean {
    return Native.isServiceEnabled();
  },
  openAccessibilitySettings(): void {
    Native.openAccessibilitySettings();
  },
  openApp(pkg: string): Promise<void> {
    return Native.openApp(pkg);
  },
  /** Package id for a package/app-name query, or "" when nothing matches. */
  resolveApp(query: string): Promise<string> {
    return Native.resolveApp(query);
  },
  async listApps(): Promise<InstalledApp[]> {
    return JSON.parse(await Native.listApps());
  },
  async scrapeScreen(): Promise<ScrapedNode[]> {
    return JSON.parse(await Native.scrapeScreen());
  },
  clickByText(text: string): Promise<boolean> {
    return Native.clickByText(text);
  },
  clickByViewId(id: string): Promise<boolean> {
    return Native.clickByViewId(id);
  },
  tap(x: number, y: number): Promise<boolean> {
    return Native.tap(x, y);
  },
  swipe(x1: number, y1: number, x2: number, y2: number, durationMs = 300): Promise<boolean> {
    return Native.swipe(x1, y1, x2, y2, durationMs);
  },
  typeText(text: string): Promise<boolean> {
    return Native.typeText(text);
  },
  pressBack(): Promise<boolean> {
    return Native.pressBack();
  },
  pressHome(): Promise<boolean> {
    return Native.pressHome();
  },
  currentApp(): Promise<string> {
    return Native.currentApp();
  },
  sleep(ms: number): Promise<void> {
    return Native.sleep(ms);
  },
};

export default AutoAccessibility;
