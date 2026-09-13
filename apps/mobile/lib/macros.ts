import AsyncStorage from "@react-native-async-storage/async-storage";
import { Dimensions, PixelRatio } from "react-native";
import AutoAccessibility from "auto-accessibility";
import { requireAccessibility } from "./accessibility";
import { resolveFirst } from "./apps";

/** A single automation step. */
export type Step =
  // `alt` holds other package ids for the same app (builds/regions differ) and
  // `label` is a last-resort match on the app's on-device name.
  | { type: "openApp"; pkg: string; alt?: string[]; label?: string }
  | { type: "clickText"; text: string }
  // Clicks the first candidate actually on screen — view ids first, then exact
  // labels. For a control that is identified differently from screen to screen:
  // telebirr's login keypad has view ids, its checkout screens have none at all.
  | { type: "clickAny"; viewIds?: string[]; texts?: string[] }
  | { type: "clickViewId"; viewId: string }
  | { type: "tap"; x: number; y: number }
  // A tap placed as a fraction of the screen (0..1), so it survives a change of
  // resolution the way raw pixels don't. This is the only way to reach a
  // soft-keyboard key: the IME is a separate window, so it never appears in
  // rootInActiveWindow and no amount of clickByText will find it.
  | { type: "tapFraction"; fx: number; fy: number; label?: string }
  | { type: "swipe"; x1: number; y1: number; x2: number; y2: number; dur?: number }
  | { type: "type"; text: string }
  | { type: "back" }
  | { type: "home" }
  | { type: "wait"; ms: number }
  // Polls the screen until something shows up, then moves on immediately, so a
  // slow screen costs what it actually costs instead of a fixed guess.
  // Matching is case-insensitive and exact by default; `contains` loosens it to
  // a substring, matching how clickText finds its target.
  | {
      type: "waitFor";
      text?: string;
      viewId?: string;
      contains?: boolean;
      timeoutMs?: number;
    }
  | { type: "scrape"; label: string }; // captures screen text into results

export interface Macro {
  id: string;
  name: string;
  steps: Step[];
}

export interface RunResult {
  ok: boolean;
  log: string[];
  scraped: Record<
    string,
    { text: string; description: string; viewId: string; clickable: boolean }[]
  >;
}

const KEY = "autopilot.macros";

export async function loadMacros(): Promise<Macro[]> {
  const raw = await AsyncStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveMacros(macros: Macro[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(macros));
}

/** True once a node matching a waitFor step is on the current screen. */
async function onScreen(
  step: Extract<Step, { type: "waitFor" }>,
): Promise<boolean> {
  const nodes = await AutoAccessibility.scrapeScreen();
  if (step.viewId) {
    const id = step.viewId;
    if (nodes.some((n) => n.viewId.split("/").pop() === id)) return true;
  }
  if (!step.text) return !step.viewId;
  const needle = step.text.trim().toLowerCase();
  return nodes.some((n) =>
    [n.text, n.description].some((raw) => {
      const value = raw.trim().toLowerCase();
      return step.contains ? value.includes(needle) : value === needle;
    }),
  );
}

/**
 * Clicks the first label that is on screen *exactly*, and reports which one.
 *
 * Deliberately not clickByText: that matches on a substring, so "OK" would also
 * fire on a word like "Broken" and "Send" on a "Send Money" heading. Here the
 * label has to match a whole node, and the node's own id (or its centre point,
 * for a button that carries no id) is what gets clicked.
 */
async function clickExact(
  step: Extract<Step, { type: "clickAny" }>,
): Promise<string> {
  for (const id of step.viewIds ?? []) {
    if (await AutoAccessibility.clickByViewId(id)) return id;
  }
  if (!step.texts?.length) return "";
  const nodes = await AutoAccessibility.scrapeScreen();
  for (const label of step.texts) {
    const needle = label.trim().toLowerCase();
    const node = nodes.find((n) =>
      [n.text, n.description].some((v) => v.trim().toLowerCase() === needle),
    );
    if (!node) continue;
    if (node.viewId && (await AutoAccessibility.clickByViewId(node.viewId))) return label;
    if (await AutoAccessibility.tap(node.x, node.y)) return label;
  }
  return "";
}

/** Execute a macro step by step, collecting a log and any scraped data. */
export async function runMacro(macro: Macro): Promise<RunResult> {
  const log: string[] = [];
  const scraped: RunResult["scraped"] = {};
  try {
    // An openApp step would launch its app without the service — only the steps
    // after it fail — so the whole macro is refused before anything is opened.
    requireAccessibility();
    for (const [i, step] of macro.steps.entries()) {
      const tag = `#${i + 1} ${step.type}`;
      switch (step.type) {
        case "openApp": {
          const pkg = await resolveFirst([step.pkg, ...(step.alt ?? []), step.label ?? ""]);
          if (!pkg) throw new Error(`${step.pkg} is not installed on this device.`);
          await AutoAccessibility.openApp(pkg);
          await AutoAccessibility.sleep(1500);
          log.push(`${tag} · opened ${pkg}`);
          break;
        }
        case "clickText": {
          const ok = await AutoAccessibility.clickByText(step.text);
          log.push(`${tag} · "${step.text}" ${ok ? "clicked" : "NOT FOUND"}`);
          await AutoAccessibility.sleep(800);
          break;
        }
        case "clickAny": {
          const hit = await clickExact(step);
          const tried = [...(step.viewIds ?? []), ...(step.texts ?? [])];
          log.push(
            hit
              ? `${tag} · "${hit}" clicked`
              : `${tag} · NONE of [${tried.join(", ")}] on screen`,
          );
          await AutoAccessibility.sleep(800);
          break;
        }
        case "clickViewId": {
          const ok = await AutoAccessibility.clickByViewId(step.viewId);
          log.push(`${tag} · ${step.viewId} ${ok ? "clicked" : "NOT FOUND"}`);
          await AutoAccessibility.sleep(800);
          break;
        }
        case "tap":
          await AutoAccessibility.tap(step.x, step.y);
          log.push(`${tag} · (${step.x}, ${step.y})`);
          await AutoAccessibility.sleep(600);
          break;
        case "tapFraction": {
          // Dimensions reports dp; the gesture engine wants physical pixels.
          const screen = Dimensions.get("screen");
          const x = PixelRatio.getPixelSizeForLayoutSize(screen.width * step.fx);
          const y = PixelRatio.getPixelSizeForLayoutSize(screen.height * step.fy);
          await AutoAccessibility.tap(x, y);
          log.push(`${tag} · ${step.label ?? "tap"} at (${x}, ${y})`);
          await AutoAccessibility.sleep(700);
          break;
        }
        case "swipe":
          await AutoAccessibility.swipe(step.x1, step.y1, step.x2, step.y2, step.dur ?? 300);
          log.push(`${tag} · swipe`);
          await AutoAccessibility.sleep(600);
          break;
        case "type":
          await AutoAccessibility.typeText(step.text);
          log.push(`${tag} · typed "${step.text}"`);
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
          log.push(`${tag} · ${step.ms}ms`);
          break;
        case "waitFor": {
          const limit = step.timeoutMs ?? 15000;
          const started = Date.now();
          let found = false;
          while (Date.now() - started < limit) {
            if (await onScreen(step)) {
              found = true;
              break;
            }
            await AutoAccessibility.sleep(200);
          }
          const what = step.text ?? step.viewId ?? "?";
          const took = Date.now() - started;
          log.push(
            found
              ? `${tag} · "${what}" appeared after ${took}ms`
              : `${tag} · "${what}" TIMED OUT after ${limit}ms`,
          );
          break;
        }
        case "scrape": {
          const nodes = await AutoAccessibility.scrapeScreen();
          // viewId and clickable come along because they are what you need to
          // aim a step at a button the labels alone couldn't find.
          scraped[step.label] = nodes.map((n) => ({
            text: n.text,
            description: n.description,
            viewId: n.viewId,
            clickable: n.clickable,
          }));
          log.push(`${tag} · captured ${nodes.length} nodes as "${step.label}"`);
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
