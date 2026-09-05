import AsyncStorage from "@react-native-async-storage/async-storage";
import AutoAccessibility from "auto-accessibility";

/** A single automation step. */
export type Step =
  | { type: "openApp"; pkg: string }
  | { type: "clickText"; text: string }
  | { type: "clickViewId"; viewId: string }
  | { type: "tap"; x: number; y: number }
  | { type: "swipe"; x1: number; y1: number; x2: number; y2: number; dur?: number }
  | { type: "type"; text: string }
  | { type: "back" }
  | { type: "home" }
  | { type: "wait"; ms: number }
  | { type: "scrape"; label: string }; // captures screen text into results

export interface Macro {
  id: string;
  name: string;
  steps: Step[];
}

export interface RunResult {
  ok: boolean;
  log: string[];
  scraped: Record<string, { text: string; description: string }[]>;
}

const KEY = "autopilot.macros";

export async function loadMacros(): Promise<Macro[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveMacros(macros: Macro[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(macros));
}

/** Execute a macro step by step, collecting a log and any scraped data. */
export async function runMacro(macro: Macro): Promise<RunResult> {
  const log: string[] = [];
  const scraped: RunResult["scraped"] = {};
  try {
    for (const [i, step] of macro.steps.entries()) {
      const tag = `#${i + 1} ${step.type}`;
      switch (step.type) {
        case "openApp":
          await AutoAccessibility.openApp(step.pkg);
          await AutoAccessibility.sleep(1500);
          log.push(`${tag} → opened ${step.pkg}`);
          break;
        case "clickText": {
          const ok = await AutoAccessibility.clickByText(step.text);
          log.push(`${tag} → "${step.text}" ${ok ? "clicked" : "NOT FOUND"}`);
          await AutoAccessibility.sleep(800);
          break;
        }
        case "clickViewId": {
          const ok = await AutoAccessibility.clickByViewId(step.viewId);
          log.push(`${tag} → ${step.viewId} ${ok ? "clicked" : "NOT FOUND"}`);
          await AutoAccessibility.sleep(800);
          break;
        }
        case "tap":
          await AutoAccessibility.tap(step.x, step.y);
          log.push(`${tag} → (${step.x}, ${step.y})`);
          await AutoAccessibility.sleep(600);
          break;
        case "swipe":
          await AutoAccessibility.swipe(step.x1, step.y1, step.x2, step.y2, step.dur ?? 300);
          log.push(`${tag} → swipe`);
          await AutoAccessibility.sleep(600);
          break;
        case "type":
          await AutoAccessibility.typeText(step.text);
          log.push(`${tag} → typed "${step.text}"`);
          break;
        case "back":
          await AutoAccessibility.pressBack();
          log.push(`${tag}`);
          await AutoAccessibility.sleep(500);
          break;
        case "home":
          await AutoAccessibility.pressHome();
          log.push(`${tag}`);
          await AutoAccessibility.sleep(500);
          break;
        case "wait":
          await AutoAccessibility.sleep(step.ms);
          log.push(`${tag} → ${step.ms}ms`);
          break;
        case "scrape": {
          const nodes = await AutoAccessibility.scrapeScreen();
          scraped[step.label] = nodes.map((n) => ({
            text: n.text,
            description: n.description,
          }));
          log.push(`${tag} → captured ${nodes.length} nodes as "${step.label}"`);
          break;
        }
      }
    }
    return { ok: true, log, scraped };
  } catch (e: any) {
    log.push(`ERROR: ${e?.message ?? e}`);
    return { ok: false, log, scraped };
  }
}
