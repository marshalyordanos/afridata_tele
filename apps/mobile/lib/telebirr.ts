import { Dimensions, PixelRatio } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import AutoAccessibility, { ScrapedNode } from "auto-accessibility";
import type { Macro, Step } from "./macros";
import type { TelebirrTransaction } from "./telebirrData";
import { TELEBIRR, openKnownApp } from "./apps";
import { requireAccessibility } from "./accessibility";
import { TX_AMOUNT, matchMoment, parseTransactions } from "./telebirrParse";
import { requireAgent } from "./agent";

/**
 * telebirr auto-login.
 *
 * The credentials are the enrolled agent's, read from the device at the moment
 * a run starts (see lib/agent.ts) rather than baked in here — each handset
 * drives only the account its agent enrolled with. They are passed to
 * telebirr's own login fields and nowhere else.
 *
 * The number is entered WITHOUT the +251 country code, because telebirr shows
 * +251 as a fixed prefix (tv_area_code) and its input field (et_input) holds
 * only the 9 national digits.
 */
export interface TelebirrCredentials {
  /** The field only wants the 9 digits after +251. */
  phoneNationalDigits: string;
  /** The six-digit Telebirr PIN. */
  pin: string;
}

/**
 * Steps verified live against telebirr 1.3.2 (cn.tydic.ethiopay):
 *   et_input  = the phone-number field (area code +251 is a separate label)
 *   btn_next  = the "Next" / sign-in button
 * After Next, telebirr contacts its server and shows the PIN screen. The PIN is
 * typed into that screen's focused input; telebirr submits it automatically once
 * all six digits are entered.
 *
 * The PIN screen (PinOfLoginActivity) is NOT a text field — it's a custom keypad
 * of clickable buttons tv_input_0..tv_input_9. So the PIN is entered by TAPPING
 * each digit's button by view-id, not by typing. telebirr submits automatically
 * once the sixth digit is tapped.
 *
 * NOTE: telebirr refuses to log in over Wi-Fi — the phone must be on mobile data.
 */
function loginSteps({ phoneNationalDigits, pin }: TelebirrCredentials): Step[] {

  // Turn "123789" into a tap on tv_input_1, tv_input_2, ... with a beat between
  // each so the keypad registers every press.
  const pinTaps: Step[] = pin.split("").flatMap((digit) => [
    { type: "clickViewId", viewId: `tv_input_${digit}` } as Step,
    { type: "wait", ms: 350 } as Step,
  ]);

  return [
    {
      type: "openApp",
      pkg: TELEBIRR.packages[0],
      alt: TELEBIRR.packages.slice(1),
      label: TELEBIRR.label,
    },
    { type: "wait", ms: 4000 },
    // Focus the phone field, then SET_TEXT replaces whatever was prefilled.
    { type: "clickViewId", viewId: "et_input" },
    { type: "wait", ms: 500 },
    { type: "type", text: phoneNationalDigits },
    { type: "wait", ms: 500 },
    // Sign in -> server round-trip -> PIN keypad screen.
    { type: "clickViewId", viewId: "btn_next" },
    { type: "wait", ms: 6000 },
    // Tap the PIN digits on the custom keypad; telebirr auto-submits at 6 digits.
    ...pinTaps,
  ];
}

export function buildTelebirrLoginMacro(credentials: TelebirrCredentials): Macro {
  return {
    id: "telebirr-login",
    name: "Sign in to telebirr",
    steps: loginSteps(credentials),
  };
}

/**
 * Who the money goes to: +251 913 629 125.
 *
 * `nationalDigits` is what gets typed, matching the login screen, where +251 is
 * a fixed label beside the field rather than part of the input. If the first
 * run's "recipient_screen" scrape shows a field that wants the whole number
 * instead, type `full` here.
 */
export const TELEBIRR_RECIPIENT = {
  nationalDigits: "913629125",
  full: "+251913629125",
};

/**
 * Two taps that have to be placed by position rather than by label.
 *
 * Measured on a TECNO CD6 (720x1600, Android 10) against telebirr's
 * P2PTransferPayActivity, and stored as fractions of the screen so a different
 * resolution still lands in the right place.
 *
 * KEYPAD_OK is the green OK on the numeric keypad. It cannot be found any other
 * way: the keypad is the input method's own window, and an accessibility
 * service only ever sees rootInActiveWindow — the app's window — so the key is
 * invisible to clickByText and clickByViewId alike. Android's proper answer,
 * ACTION_IME_ENTER, landed in API 30 and this device is API 29.
 *
 * That makes it the fragile step: change keyboards, or use one with a different
 * height, and OK moves. If the run stops with the keypad still up, re-measure
 * with `adb shell uiautomator dump` and a screenshot, and update the fraction.
 */
const AMOUNT_FIELD = { fx: 0.5, fy: 0.307 };
const KEYPAD_OK = { fx: 0.872, fy: 0.846 };

/**
 * The authorisation PIN, digit by digit — deliberately the same PIN used to sign
 * in, threaded through from the enrolled agent so the two cannot drift apart.
 *
 * Verified against CommonCheckStandActivity: its keypad is plain TextViews "0"
 * to "9" with no resource ids and clickable=false, so clickAny falls through to
 * tapping the centre of the digit's label. The tv_input_* ids are tried first
 * only because the login keypad uses them.
 *
 * 800ms between digits, not the login screen's 350: at 400ms this keypad
 * silently dropped every tap, and at 800ms all six registered.
 */
function paymentPinTaps(pin: string): Step[] {
  const digits = pin.split("");
  return digits.flatMap((digit, i) => {
    const steps: Step[] = [
      { type: "clickAny", viewIds: [`tv_input_${digit}`], texts: [digit] },
      { type: "wait", ms: 800 },
    ];
    // Snapshot the field after every digit except the last (the sixth
    // auto-submits, so there is nothing left to read). The PIN box echoes in
    // cleartext, so the log shows exactly what landed: "12378" after five taps
    // means the taps are fine and the keypad is rejecting injected touch, while
    // a short or scrambled value means a tap was dropped or doubled.
    if (i < digits.length - 1) {
      steps.push({ type: "scrape", label: `pin_after_${i + 1}` });
    }
    return steps;
  });
}

/**
 * Sign in, then drive a transfer end to end:
 * home -> "Send Money" -> "Individual" -> recipient -> Next -> amount -> Send.
 *
 * The tiles and buttons are matched by their on-screen label rather than a view
 * id, because telebirr's screens are server-driven — the ids move between builds
 * while the labels don't. clickByText is case-insensitive and matches on a
 * substring, so "Send Money" also hits "Send money" and "Individual" also hits
 * the builds that label the option "To Individual".
 *
 * Neither text field is clicked first: typeText targets the screen's focused
 * input and falls back to its first editable node, which on both of these
 * screens is the field we want.
 *
 * The macro ends on the Send tap. telebirr then asks for the PIN again to
 * authorise the transfer, and that confirmation is left to you.
 */
export function buildTelebirrSendMoneyMacro(
  amount: string,
  credentials: TelebirrCredentials
): Macro {
  return {
    id: "telebirr-send-money",
    name: `Send ${amount} to ${TELEBIRR_RECIPIENT.full}`,
    steps: [
      ...loginSteps(credentials),
      // The sixth PIN tap submits by itself. Home can take anywhere from one to
      // fifteen seconds depending on the network, so wait for the tile rather
      // than guessing — "Send Money" is distinctive enough to match loosely.
      { type: "waitFor", text: "Send Money", contains: true, timeoutMs: 25000 },
      { type: "clickText", text: "Send Money" },
      { type: "waitFor", text: "Individual", contains: true, timeoutMs: 12000 },
      { type: "clickText", text: "Individual" },
      // Captured before anything is typed, so run one shows the real field.
      { type: "waitFor", text: "Next", timeoutMs: 12000 },
      { type: "scrape", label: "recipient_screen" },
      { type: "type", text: TELEBIRR_RECIPIENT.nationalDigits },
      { type: "clickText", text: "Next" },
      // ---- amount screen (P2PTransferPayActivity) ----
      { type: "waitFor", text: "Amount", timeoutMs: 15000 },
      // Focus the amount box, which is what raises the numeric keypad. SET_TEXT
      // on its own never opens a keyboard, and without the keypad there is no
      // OK — the screen carries no other way forward.
      { type: "tapFraction", ...AMOUNT_FIELD, label: "amount field" },
      { type: "type", text: amount },
      { type: "wait", ms: 600 },
      { type: "scrape", label: "amount_screen" },
      { type: "tapFraction", ...KEYPAD_OK, label: "keypad OK" },
      // ---- confirmation sheet ----
      // "Send" is matched exactly so it can't land on the "Send Money to …"
      // heading above it. The button carries no id and isn't flagged clickable,
      // so clickAnyText ends up tapping the centre of its label — which is
      // inside the green button.
      { type: "waitFor", text: "Send", timeoutMs: 15000 },
      { type: "scrape", label: "before_send" },
      { type: "clickAny", texts: ["Send"] },
      // ---- authorisation ----
      // Send raises a PIN screen, and the transfer only happens once it is
      // filled. Same PIN as the login screen. Which keypad appears here is not
      // verified: the login screen's has tv_input_* ids, while the rest of the
      // checkout module carries no ids whatsoever, so each digit tries the id
      // first and falls back to tapping the plain "7" label. The digits are
      // matched exactly, so "1" cannot land on a "1.00ETB" amount.
      { type: "waitFor", text: "1", timeoutMs: 15000 },
      { type: "scrape", label: "payment_pin_screen" },
      ...paymentPinTaps(credentials.pin),
      { type: "wait", ms: 5000 },
      { type: "scrape", label: "after_send" },
    ],
  };
}

/* ------------------------------------------------------------------ *
 * Reading the account (balance), as opposed to just logging in.
 * ------------------------------------------------------------------ */

/** Phases the account screen shows while a read is running. */
export type SyncPhase = "opening" | "phone" | "pin" | "reading" | "returning" | "done";

/**
 * AutoPilot's own package id, read from the Expo config so it follows a rename.
 * Driving telebirr leaves telebirr in front, so every run hands the screen back.
 */
const OWN_PACKAGE =
  (Constants.expoConfig?.android?.package as string | undefined) ?? "com.afridata.autopilot";

/** Brings AutoPilot back to the foreground after a run in telebirr. */
async function returnToAutoPilot(): Promise<void> {
  await AutoAccessibility.openApp(OWN_PACKAGE);
  await AutoAccessibility.sleep(1200);
}

/**
 * Any "1,234.56" in a scraped string, with or without a currency prefix.
 * telebirr renders the balance without a thousands separator on some builds,
 * so the separator group is optional.
 */
const AMOUNT = /([0-9][0-9,]*\.[0-9]{2})/;

/**
 * Best-effort balance out of a screen dump. Nodes that mention "balance" win,
 * because telebirr's home screen also shows package and airtime amounts; if
 * none does, the first amount-shaped string is taken. Returns null rather than
 * guessing when nothing matches.
 *
 * Returns null too when the balance is still masked as "******" — the home
 * screen hides it by default (see BALANCE_EYE), and no amount is on screen
 * until the eye is tapped.
 */
// The list parser lives in ./telebirrParse: pure text handling, no native
// modules, so it can be run against a captured accessibility tree off-device.
export { parseTransactions };

export function parseBalance(
  nodes: { text: string; description: string }[],
  /**
   * Refuse the last-resort guess below.
   *
   * That fallback takes the first amount ANYWHERE on screen, which is only
   * sensible on a screen already known to be home. Off home it is actively
   * dangerous: telebirr's transfer-success screen carries no "Balance" label,
   * so the first amount on it is the sum just sent — and saving that as the
   * balance tells the agent they hold exactly what they just paid away.
   */
  options: { strict?: boolean } = {}
): number | null {
  const texts = nodes.map((n) => (n.text || n.description || "").trim()).filter(Boolean);
  // Target the MAIN balance only. telebirr's home also shows "Endekise (ETB)"
  // and "Reward (ETB)", each separately masked, so the amount is read from the
  // few nodes right after the main "Balance" label and nowhere else — otherwise
  // a masked main balance would be mistaken for a revealed Endekise/Reward one.
  const main = texts.findIndex((t) => /balance|ቀሪ/i.test(t) && !/endekise|reward/i.test(t));
  if (main >= 0) {
    for (const text of texts.slice(main, main + 4)) {
      const match = text.match(AMOUNT);
      if (match) return Number(match[1].replace(/,/g, ""));
    }
    // Label is there but the value beside it is masked (******) or missing:
    // report it as unread so the caller taps the eye and reads again.
    return null;
  }
  if (options.strict) return null;

  // No labelled balance at all — first amount anywhere, as a last resort.
  for (const text of texts) {
    const match = text.match(AMOUNT);
    if (match) return Number(match[1].replace(/,/g, ""));
  }
  return null;
}

/** True while the home screen is still hiding the balance behind asterisks. */
export function balanceIsMasked(nodes: { text: string; description: string }[]): boolean {
  return nodes.some((n) => /^\*{3,}$/.test((n.text || n.description || "").trim()));
}

/**
 * The eye toggle beside "Balance (ETB)" that reveals the hidden amount, as a
 * fraction of the screen. Measured on the TECNO CD6 home (homev6.HomeActivity):
 * the eye sat at (494, 302) on 720x1600. It has no id or text, so a positional
 * tap is the only way to hit it. If a sync keeps reporting a masked balance,
 * re-measure this against a screenshot.
 */
const BALANCE_EYE = { fx: 494 / 720, fy: 302 / 1600 };

/** A screen-fraction tap, in the physical pixels dispatchGesture expects. */
async function tapFraction(fx: number, fy: number): Promise<void> {
  const screen = Dimensions.get("screen");
  const x = PixelRatio.getPixelSizeForLayoutSize(screen.width * fx);
  const y = PixelRatio.getPixelSizeForLayoutSize(screen.height * fy);
  await AutoAccessibility.tap(x, y);
}

/** A short upward swipe, to bring below-the-fold home tiles into view. */
/** The opposite, to get back to the top of a list that has been scrolled. */
async function swipeDown(): Promise<void> {
  const screen = Dimensions.get("screen");
  const px = (v: number) => PixelRatio.getPixelSizeForLayoutSize(v);
  const x = px(screen.width * 0.5);
  await AutoAccessibility.swipe(x, px(screen.height * 0.3), x, px(screen.height * 0.7), 400);
}

async function swipeUp(): Promise<void> {
  const screen = Dimensions.get("screen");
  const px = (v: number) => PixelRatio.getPixelSizeForLayoutSize(v);
  const x = px(screen.width * 0.5);
  await AutoAccessibility.swipe(x, px(screen.height * 0.7), x, px(screen.height * 0.3), 400);
}

/** Text seen only before login, used to decide whether a sign-in is needed. */
function looksLikeLogin(nodes: ScrapedNode[]): boolean {
  return nodes.some((n) =>
    /mobile number|welcome to telebirr|^login$/i.test((n.text || "").trim())
  );
}

/** Taps a digit by its keypad view-id, or by its plain label when there is none. */
async function tapDigit(digit: string): Promise<void> {
  if (await AutoAccessibility.clickByViewId(`tv_input_${digit}`)) return;
  await AutoAccessibility.clickByText(digit);
}

/** Text only telebirr's signed-in home shows. */
function looksLikeHome(nodes: ScrapedNode[]): boolean {
  return nodes.some((n) => /send money|available balance|^balance$/i.test((n.text || "").trim()));
}

/** Enters the six-digit login PIN with the spacing this keypad needs. */
async function enterLoginPin(pin: string): Promise<void> {
  for (const digit of pin.split("")) {
    await tapDigit(digit);
    await AutoAccessibility.sleep(700);
  }
  await AutoAccessibility.sleep(6000); // sixth digit submits; home then loads
}

/**
 * Get telebirr to its signed-in HOME, whatever it opened on.
 *
 * telebirr does not reliably resume to home — a relaunch can land on the login
 * screen, a splash, or the last mini-app it had open. So this loops: sign in
 * when it shows login, back out + relaunch when it shows something that is
 * neither home nor login (a mini-app's Back leaves telebirr entirely, so a
 * clean relaunch is the only way to a known screen), and stop once home shows.
 */
async function reachHome(
  pin: string,
  onPhase: (p: SyncPhase) => void
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const nodes = await AutoAccessibility.scrapeScreen();
    if (looksLikeHome(nodes)) return true;
    if (looksLikeLogin(nodes)) {
      onPhase("phone");
      await AutoAccessibility.clickByText("Next");
      await AutoAccessibility.sleep(6000);
      onPhase("pin");
      await enterLoginPin(pin);
      continue;
    }
    // Some other screen (splash or a resumed mini-app): get back to a known
    // entry by leaving it and relaunching telebirr fresh.
    await AutoAccessibility.pressBack();
    await AutoAccessibility.sleep(1500);
    await openKnownApp(TELEBIRR);
    await AutoAccessibility.sleep(4000);
  }
  return looksLikeHome(await AutoAccessibility.scrapeScreen());
}

/** Raw text of the last transaction-list scrape, for diagnosing a bad read. */
const LAST_LIST_KEY = "autopilot.lastListScrape";

/** A row's identity across scrolls — the list repeats rows as it moves. */
const rowKey = (tx: TelebirrTransaction) => `${tx.day}|${tx.time}|${tx.value}`;

/**
 * Open the Transaction History mini-app from home and return its rows.
 *
 * Opened ONCE. The old shape retried the whole thing — swipe, tap, poll — when
 * a read came back with no rows, so a build whose date format the parser did
 * not recognise made telebirr and the history open twice over before failing:
 * two minutes of the screen being taken over to reach the same answer. A second
 * open cannot succeed where the first failed, because nothing about the screen
 * changed; what was actually needed was a parser that reads more formats, and
 * a saved copy of the screen text when it still cannot.
 *
 * The tap itself is still retried — a swipe can miss, and that IS worth another
 * go — but only until the tile is hit, not after the list is open.
 */
async function readTransactions(seek?: {
  reference: string;
  onFound: (value: number) => void;
  onSearched?: (opened: number, exhausted: boolean) => void;
  onOpened?: (n: number) => void;
}): Promise<TelebirrTransaction[]> {
  // Bring the tile into view and open it. Up to six swipes: this is cheap and
  // it is the one step that genuinely benefits from another attempt.
  let opened = false;
  for (let s = 0; s < 6 && !opened; s++) {
    await swipeUp();
    await AutoAccessibility.sleep(900);
    opened = await AutoAccessibility.clickByText("Transaction Detail");
  }

  if (!opened) return [];

  // Rows appear ~7s after the mini-app opens; poll up to ~27s before giving up.
  let last: ScrapedNode[] = [];
  for (let i = 0; i < 18; i++) {
    await AutoAccessibility.sleep(1500);
    last = await AutoAccessibility.scrapeScreen();
    const firstRows = parseTransactions(last);
    if (firstRows.length) {
      // Opening the receipts is the authority, and the list is only a shortcut
      // past it. Deciding by "does the list seem to have reference numbers"
      // was wrong: a token like CASHIN2026 or ID20260913 passes for one, so a
      // list full of junk looked authoritative and the receipts were never
      // opened at all. An EXACT match on the number being sought is different —
      // junk does not coincidentally equal the reference — so that is trusted,
      // and every other case opens the receipts.
      //
      // This runs before anything scrolls: the list is sitting at the top,
      // which is where a customer who just paid is.
      const wanted = flatten(seek?.reference ?? "");
      const listHit = seek
        ? firstRows.find((row) => row.receipt && flatten(row.receipt) === wanted)
        : undefined;

      if (seek && listHit && listHit.value > 0) {
        seek.onFound(listHit.value);
        seek.onSearched?.(0, true);
      } else if (seek) {
        const walk = await findReferenceByOpening(seek.reference, seek.onOpened);
        if (walk.value !== null) seek.onFound(walk.value);
        seek.onSearched?.(walk.opened, walk.exhausted);

        // Either the answer is already in hand and the customer should not wait
        // on a snapshot, or the history is no longer in front and there is
        // nothing left to scroll. Both end the read here.
        if (walk.value !== null || !walk.listIntact) return firstRows;
      }

      const rows = await collectList(await AutoAccessibility.scrapeScreen());

      // Deliberately NOT pressed Back to leave. Back out of a mini-app goes
      // further than the mini-app — it leaves telebirr — and once the screen in
      // front is no longer telebirr, another Back starts closing whatever is,
      // AutoPilot included. `returnToAutoPilot` brings this app forward by
      // launching it instead, which cannot close anything.
      return rows;
    }
  }

  // Open, rendered, and still nothing the parser recognises. Keep what was on
  // screen — this is the case that needs looking at, and without it there is
  // nothing to go on but guesswork.
  await saveListScrape(last, 0);
  // Same here: leaving is `returnToAutoPilot`'s job, not Back's.
  return [];
}

/**
 * Scrolls the open history and merges every screenful into one list.
 *
 * Stops when a swipe turns up nothing new — the list has bottomed out — or at
 * the swipe cap, so a long history cannot hold telebirr open indefinitely while
 * a customer waits on a page.
 */
async function collectList(firstScrape: ScrapedNode[]): Promise<TelebirrTransaction[]> {
  const MAX_SWIPES = 10;

  const merged: TelebirrTransaction[] = [];
  const seen = new Set<string>();
  const rawTexts: string[] = [];

  const absorb = (nodes: ScrapedNode[]): number => {
    for (const node of nodes) {
      const text = (node.text || node.description || "").trim();
      if (text) rawTexts.push(text);
    }

    let added = 0;
    for (const tx of parseTransactions(nodes)) {
      const key = rowKey(tx);
      if (seen.has(key)) continue;
      seen.add(key);
      // Re-index so ids stay unique once rows from several screens are joined.
      merged.push({ ...tx, id: `${tx.day}_${tx.time}_${tx.value}_${merged.length}` });
      added += 1;
    }
    return added;
  };

  absorb(firstScrape);

  for (let i = 0; i < MAX_SWIPES; i++) {
    await swipeUp();
    await AutoAccessibility.sleep(1200);
    if (absorb(await AutoAccessibility.scrapeScreen()) === 0) break;
  }

  await saveTexts(rawTexts, merged.length);
  return merged;
}

/** A row on the open history, with the point to tap to open its receipt. */
interface RowTarget {
  key: string;
  x: number;
  y: number;
  value: number;
}

/**
 * Where each row sits on screen.
 *
 * The list gives no receipt numbers on most builds, so the only way to read one
 * is to open the row. Scraped nodes carry their coordinates, so the row's date
 * node is the thing to tap — it is the one node every row is guaranteed to have.
 */
function rowTargets(nodes: ScrapedNode[]): RowTarget[] {
  const texts = nodes.map((n) => (n.text || n.description || "").trim());
  const out: RowTarget[] = [];

  for (let i = 0; i < texts.length; i++) {
    const hit = matchMoment(texts[i], texts[i + 1]);
    if (!hit) continue;

    const from = i + hit.used;
    for (let j = from; j < Math.min(from + 3, texts.length); j++) {
      const amount = texts[j].match(TX_AMOUNT);
      if (!amount) continue;
      const value = Number(amount[2].replace(/,/g, "")) * (amount[1] === "-" ? -1 : 1);
      out.push({
        key: `${hit.moment.day}|${hit.moment.time}|${value}`,
        x: nodes[i].x,
        y: nodes[i].y,
        value,
      });
      break;
    }
  }

  return out;
}

/** Loose comparison — people retype receipt numbers by eye. */
const flatten = (value: string) => value.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/**
 * How many receipts one check may open.
 *
 * Twenty, newest first, stopping the moment the reference turns up. Only
 * receipts that actually opened count against it, so a tap that goes nowhere no
 * longer spends the budget it used to. Each one waits for the screen rather
 * than sleeping a fixed spell, which is what makes twenty fit where twelve
 * barely did.
 */
export const MAX_RECEIPTS_OPENED = 20;

/**
 * Looks for a reference by opening receipts, for builds whose list does not
 * print reference numbers.
 *
 * Runs on the already-open history and leaves it open. Only incoming rows are
 * opened: a payment the agent SENT carries a receipt number too, and must never
 * settle someone's deposit.
 */
/**
 * How long the receipt-opening may run.
 *
 * A count alone cannot bound this: twenty receipts on a slow handset would
 * outlast the page the customer is watching, and an answer nobody is still
 * waiting for is no answer. Whichever limit comes first ends the search.
 */
const WALK_BUDGET_MS = 140_000;

interface WalkResult {
  /** The amount on the receipt that carried the reference, when found. */
  value: number | null;
  /** False when Back left the history — nothing more may be driven from here. */
  listIntact: boolean;
  /** How many receipts were actually opened and read. */
  opened: number;
  /** True only when every receipt was seen — not stopped by the cap or clock. */
  exhausted: boolean;
}

async function findReferenceByOpening(
  reference: string,
  onOpened?: (n: number) => void
): Promise<WalkResult> {
  const wanted = flatten(reference);
  const visited = new Set<string>();
  const deadline = Date.now() + WALK_BUDGET_MS;
  let opened = 0;
  const out = (value: number | null, listIntact: boolean, exhausted: boolean): WalkResult => ({
    value,
    listIntact,
    opened,
    exhausted,
  });

  // This runs before anything has scrolled the list, so the top is already in
  // view. Two swipes back anyway, cheaply, in case opening the tile left it
  // part-way down: the newest rows are the ones the budget should be spent on.
  for (let i = 0; i < 2; i++) {
    await swipeDown();
    await AutoAccessibility.sleep(450);
  }

  for (let pass = 0; pass < 8 && opened < MAX_RECEIPTS_OPENED; pass++) {
    if (Date.now() > deadline) return out(null, true, false);
    // Back has left the history — there is no list here any more. Stop rather
    // than tap and Back at whatever is now in front, which is how this used to
    // walk itself out of telebirr and shut AutoPilot down behind it. Patient,
    // because a list that is merely still drawing is not a list that is gone.
    if (!(await waitForList(3000))) return out(null, false, false);

    const listNodes = await AutoAccessibility.scrapeScreen();

    // EVERY row is opened, not just the ones the list called incoming: a row
    // whose amount did not parse would otherwise be skipped silently, and the
    // reference might be on exactly that one. Whether it can settle a deposit
    // is decided after it is found, below.
    const targets = rowTargets(listNodes).filter((row) => !visited.has(row.key));
    const listSignature = screenSignature(listNodes);

    for (const row of targets) {
      if (opened >= MAX_RECEIPTS_OPENED || Date.now() > deadline) break;
      visited.add(row.key);

      await AutoAccessibility.tap(row.x, row.y);
      const detail = await waitForChange(listSignature, 3200);

      // A tap that changed nothing opened nothing: the row was not clickable,
      // or the list had shifted under it. Pressing Back here would leave the
      // mini-app for no reason, and counting it would spend the budget on a
      // receipt that was never read.
      if (!detail.changed) continue;

      opened += 1;
      onOpened?.(opened);

      // Rather than hunt for whichever field holds the receipt on this build,
      // ask the only question that matters: is the number we want on screen?
      const found = await receiptShows(wanted, detail.nodes, 2000);

      await AutoAccessibility.pressBack();
      const intact = await waitForList(4000);

      if (found) {
        // Found — but only money that came IN can settle a deposit. A payment
        // the agent SENT carries a receipt number too, and confirming a deposit
        // against one would credit a customer for the agent's own outgoing
        // transfer. Reported as a miss, which is what it is.
        return out(row.value > 0 ? row.value : null, intact, false);
      }

      // Back went further than the detail screen. Stop: another would take the
      // app with it.
      if (!intact) return out(null, false, false);
    }

    // Nothing yet on this screenful — scroll and carry on.
    await swipeUp();
    await AutoAccessibility.sleep(1100);
  }

  // Ran out of rows rather than out of budget: the reference really is not in
  // the history, as far as this search could reach.
  return out(null, true, opened < MAX_RECEIPTS_OPENED && Date.now() <= deadline);
}

/**
 * Waits for the screen to become something other than `from`, up to `timeoutMs`.
 *
 * Polling beats sleeping a fixed spell twice over: it returns the instant a
 * receipt has rendered instead of always paying the worst case, and it waits
 * longer than a fixed sleep would when the handset is slow. Returns the nodes
 * it settled on, and whether it actually changed.
 */
async function waitForChange(
  from: string,
  timeoutMs: number
): Promise<{ nodes: ScrapedNode[]; changed: boolean }> {
  const STEP = 400;
  let nodes: ScrapedNode[] = [];

  for (let waited = 0; waited < timeoutMs; waited += STEP) {
    await AutoAccessibility.sleep(STEP);
    nodes = await AutoAccessibility.scrapeScreen();
    if (screenSignature(nodes) !== from) return { nodes, changed: true };
  }

  return { nodes, changed: false };
}

/**
 * Waits for the transaction list to be in front again, up to `timeoutMs`.
 *
 * Coming back from a receipt is not instant: for a moment the screen is neither
 * the receipt nor the list. Asking once, immediately, sees that in-between and
 * concludes the history is gone — which ended the search after a single
 * receipt. Waiting for it is the difference between checking one and checking
 * twenty.
 */
async function waitForList(timeoutMs: number): Promise<boolean> {
  const STEP = 400;
  for (let waited = 0; waited < timeoutMs; waited += STEP) {
    if (rowTargets(await AutoAccessibility.scrapeScreen()).length > 0) return true;
    await AutoAccessibility.sleep(STEP);
  }
  return false;
}

/**
 * Looks for `wanted` on the open receipt, allowing for it arriving late.
 *
 * `waitForChange` returns on the first change, which may be a spinner rather
 * than the finished receipt, so judging that frame would miss numbers that were
 * about to appear. It stops early on a match, and also as soon as the screen
 * stops changing — a settled receipt without the number is an answer, and
 * waiting out the full window on each of twenty receipts is not affordable.
 */
async function receiptShows(
  wanted: string,
  first: ScrapedNode[],
  timeoutMs: number
): Promise<boolean> {
  const STEP = 400;
  let previous = "";
  let nodes = first;

  for (let waited = 0; waited <= timeoutMs; waited += STEP) {
    const signature = screenSignature(nodes);
    if (flatten(nodes.map((n) => `${n.text} ${n.description}`).join(" ")).includes(wanted)) {
      return true;
    }
    if (signature === previous) return false; // settled, and not here

    previous = signature;
    await AutoAccessibility.sleep(STEP);
    nodes = await AutoAccessibility.scrapeScreen();
  }

  return false;
}

/** Enough of a screen to tell whether tapping actually went anywhere. */
function screenSignature(nodes: ScrapedNode[]): string {
  return nodes
    .map((n) => (n.text || n.description || "").trim())
    .filter(Boolean)
    .join("|")
    .slice(0, 600);
}

/** Keeps the screen text of a read, so a bad one can be looked at afterwards. */
async function saveTexts(texts: string[], rows: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_LIST_KEY,
      JSON.stringify({ at: Date.now(), rows, texts: texts.slice(0, 400) }),
    );
  } catch {
    // A diagnostic that cannot be saved must not fail the read it describes.
  }
}

async function saveListScrape(nodes: ScrapedNode[], rows: number): Promise<void> {
  const texts = nodes
    .map((node) => (node.text || node.description || "").trim())
    .filter(Boolean);
  await saveTexts(texts, rows);
}

/** The last transaction-list scrape, for the diagnostic on the alerts screen. */
export async function loadLastListScrape(): Promise<{
  at: number;
  rows: number;
  texts: string[];
} | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_LIST_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Opens telebirr, signs in if it asks, reveals the balance, and scrapes home.
 *
 * Rewritten against telebirr 1.3.2 as it actually behaves on-device, where the
 * older assumptions broke:
 *   - LoginFirstActivity's number field and Next button carry NO view-ids, so
 *     login is detected by the on-screen text ("Mobile Number"), not by probing
 *     for et_input. The number is already prefilled, so we only tap Next.
 *   - PinOfLoginActivity's keypad also has no tv_input_* ids on this build; the
 *     digits are plain "1".."9" labels, so tapDigit falls back to clickByText.
 *   - The home balance is masked as ****** until the eye toggle is tapped.
 * `onPhase` drives the progress list on the account screen.
 */
/**
 * The balance from telebirr's home screen, revealing it if it is masked.
 *
 * Reveal ONLY when the main balance itself cannot be read. Keying off
 * parseBalance — not "is any ****** on screen" — matters: the Endekise/Reward
 * figures are separately masked, so tapping the eye while the main total is
 * already showing would just hide it again.
 */
async function readHomeBalance(): Promise<{ balance: number | null; nodes: ScrapedNode[] }> {
  let nodes = await AutoAccessibility.scrapeScreen();

  // Read the balance off the balance screen, or not at all. Any other screen
  // that happens to show a number would be read as one otherwise.
  if (!looksLikeHome(nodes)) return { balance: null, nodes };

  if (parseBalance(nodes, { strict: true }) === null) {
    await tapFraction(BALANCE_EYE.fx, BALANCE_EYE.fy);
    await AutoAccessibility.sleep(1200);
    nodes = await AutoAccessibility.scrapeScreen();
  }

  return { balance: parseBalance(nodes, { strict: true }), nodes };
}

export async function syncTelebirr(
  onPhase: (phase: SyncPhase) => void,
  /**
   * A reference to settle while we are in there.
   *
   * Passed down so a deposit check is ONE journey into telebirr: sign in, read
   * the balance, read the history, and — only if the list carries no reference
   * numbers — open receipts until the number turns up. Opening telebirr a
   * second time to do the looking would double the wait for no benefit.
   */
  seek?: { reference: string; onOpened?: (n: number) => void }
): Promise<{
  balance: number | null;
  transactions: TelebirrTransaction[];
  nodes: ScrapedNode[];
  /** The amount on the receipt that carried `seek.reference`, when found. */
  seekAmount: number | null;
  /** How far the search actually got, so a miss can be reported honestly. */
  seekSearch: { opened: number; exhausted: boolean } | null;
}> {
  // The signed-in agent's own credentials; throws when nobody has enrolled.
  const { pin } = await requireAgent();

  // Nothing here can work without the service, and openApp below would happily
  // launch telebirr regardless, so the read is refused up front.
  requireAccessibility();

  onPhase("opening");
  await openKnownApp(TELEBIRR);
  await AutoAccessibility.sleep(4000);

  // Sign in if asked, and make sure we are actually on home before reading —
  // telebirr may resume on a splash or a mini-app instead of home.
  onPhase("phone");
  const home = await reachHome(pin, onPhase);

  onPhase("reading");
  const { balance, nodes } = await readHomeBalance();

  // Then the receipts, from the "Transaction Details" tile (opens telebirr's
  // Transaction History mini-app). Only attempted once we know we are on home.
  let seekAmount: number | null = null;
  let seekSearch: { opened: number; exhausted: boolean } | null = null;
  const transactions = home
    ? await readTransactions(
        seek && {
          reference: seek.reference,
          onOpened: seek.onOpened,
          onFound: (value) => {
            seekAmount = value;
          },
          onSearched: (opened, exhausted) => {
            seekSearch = { opened, exhausted };
          },
        }
      )
    : [];

  // The read is done in telebirr; put AutoPilot back in front of the user.
  onPhase("returning");
  await returnToAutoPilot();

  onPhase("done");
  return { balance, transactions, nodes, seekAmount, seekSearch };
}

/* ------------------------------------------------------------------ *
 * Sending money.
 *
 * WARNING — this moves real money out of the account. Only the LOGIN
 * selectors below are verified against telebirr 1.3.2; the send screens are
 * driven by on-screen TEXT (clickByText), because their view-ids have not been
 * confirmed on a device yet. Every step reports what it matched, and the run
 * stops at the first step it cannot find rather than blindly tapping on
 * whatever screen happens to be showing — a stray tap on a payment screen is
 * exactly what must not happen. Use Live Scrape on each send screen to read the
 * real labels/ids and tighten these lists.
 * ------------------------------------------------------------------ */

/** The amount the one-tap button sends. */
export const SEND_AMOUNT_BIRR = "1";

/** Label candidates, most likely first — builds and locales differ. */
const SEND_MENU_LABELS = ["Send Money", "Send money", "SendMoney", "Send", "Transfer"];
const NEXT_LABELS = ["Next", "NEXT", "Continue", "CONTINUE", "Proceed"];

export type SendPhase =
  | "opening"
  | "login"
  | "menu"
  | "recipient"
  | "amount"
  | "confirm"
  | "pin"
  | "returning"
  | "done";

export interface SendResult {
  ok: boolean;
  /** Every step, in order, with what it matched — shown to the user on failure. */
  log: string[];
  failedAt?: SendPhase;
  /**
   * telebirr's balance AFTER the transfer, read back before leaving.
   *
   * Null when it could not be read. The figure held in the app is wrong by
   * exactly the amount just sent, and there is no arithmetic that can fix
   * that safely — a send whose amount was altered on telebirr's own screen, or
   * that carried a fee, would leave the app confidently displaying a number
   * that never existed. So it is read, not calculated.
   */
  balance?: number | null;
}

/** Clicks the first candidate that exists on screen; returns which one, or null. */
async function clickAnyText(candidates: string[]): Promise<string | null> {
  for (const label of candidates) {
    if (await AutoAccessibility.clickByText(label)) return label;
  }
  return null;
}

/**
 * Taps a six-digit PIN on whichever keypad is showing.
 *
 * The login keypad (PinOfLoginActivity) and the payment keypad
 * (CommonCheckStandActivity) both come through this build WITHOUT view-ids —
 * the digits are plain "0".."9" TextViews — so tapDigit tries tv_input_* first
 * and falls back to tapping the digit's label. 700ms between taps: faster and
 * the payment keypad silently drops presses.
 */
async function tapPin(pin: string): Promise<void> {
  for (const digit of pin.split("")) {
    await tapDigit(digit);
    await AutoAccessibility.sleep(700);
  }
}

/** Clicks the first candidate whose text matches a WHOLE node (never a substring). */
async function clickExactAny(candidates: string[]): Promise<string | null> {
  const nodes = await AutoAccessibility.scrapeScreen();
  for (const label of candidates) {
    const needle = label.trim().toLowerCase();
    const node = nodes.find((n) =>
      [n.text, n.description].some((v) => (v || "").trim().toLowerCase() === needle)
    );
    if (!node) continue;
    if (node.viewId && (await AutoAccessibility.clickByViewId(node.viewId))) return label;
    if (await AutoAccessibility.tap(node.x, node.y)) return label;
  }
  return null;
}

/**
 * Open telebirr, sign in if it asks, and send `amountBirr` to
 * `recipientNationalDigits` (the nine digits after +251).
 *
 * Rewritten against telebirr 1.3.2 driven end-to-end on-device, where the old
 * view-id assumptions were all wrong and the transfer never left the amount
 * screen:
 *   - LoginFirstActivity / PinOfLoginActivity have NO ids: login is by the
 *     "Next" label and tapPin falls back to digit labels.
 *   - Send Money opens a "To Individual" / "To Group" chooser that the old flow
 *     skipped entirely.
 *   - The recipient and amount fields have no `et_input` id; the recipient is
 *     set with typeText (it targets the only editable node) and the amount is
 *     committed with the keypad's green OK (an IME key, reachable only by a
 *     positional tap — see KEYPAD_OK).
 *   - The confirm sheet's button is an exact "Send", matched whole so it can't
 *     land on the "Send Money to …" heading.
 *   - Sending to your OWN number is refused by telebirr, so it is refused here
 *     up front with a clear message rather than stalling on the recipient screen.
 */
export async function signInAndSend(
  recipientNationalDigits: string,
  amountBirr: string,
  onPhase: (phase: SendPhase) => void
): Promise<SendResult> {
  const log: string[] = [];
  const stop = (phase: SendPhase, message: string): SendResult => {
    log.push(`✗ ${message}`);
    return { ok: false, log, failedAt: phase };
  };

  // Every other failure here comes back as a SendResult, so this one does too
  // rather than rejecting the promise at the caller.
  let phoneNationalDigits: string;
  let pin: string;
  try {
    ({ phoneNationalDigits, pin } = await requireAgent());
  } catch (e: any) {
    return stop("opening", e?.message ?? String(e));
  }

  // telebirr blocks self-transfers, so a send to the signed-in number can never
  // succeed — the recipient screen just refuses to advance. Catch it here.
  if (recipientNationalDigits === phoneNationalDigits) {
    return stop("recipient", "telebirr will not send to your own number — use a different one");
  }

  try {
    // Refused before telebirr is opened: without the service this run could only
    // get as far as the foreground app and then fail on its first read.
    requireAccessibility();

    onPhase("opening");
    const pkg = await openKnownApp(TELEBIRR);
    log.push(`opened ${pkg}`);
    await AutoAccessibility.sleep(4000);

    // Get to HOME before looking for Send Money, rather than assuming that
    // "not the login screen" means home. telebirr resumes wherever it was left,
    // and after a deposit check that is the transaction list — a screen with no
    // Send Money on it, which is what made a payout die at the first menu tap.
    // reachHome signs in when asked and backs out of anything else (list,
    // receipt, splash, mini-app) until home is genuinely on screen.
    onPhase("login");
    const atHome = await reachHome(pin, (p) => onPhase(p === "pin" ? "pin" : "login"));
    if (!atHome) {
      return stop("login", "could not get telebirr back to its home screen");
    }
    log.push("at telebirr home");

    onPhase("menu");
    let menu = await clickAnyText(SEND_MENU_LABELS);
    // A missing Send Money is not fatal on the first look. `looksLikeHome` also
    // accepts a bare "Balance", which the transaction list carries too, so the
    // run can believe it is home while the list is still up. Backing out and
    // relaunching lands on the real home, where the tile exists.
    for (let attempt = 0; !menu && attempt < 2; attempt++) {
      log.push("no Send Money on screen — backing out to home");
      await AutoAccessibility.pressBack();
      await AutoAccessibility.sleep(1500);
      await openKnownApp(TELEBIRR);
      await AutoAccessibility.sleep(3500);
      menu = await clickAnyText(SEND_MENU_LABELS);
    }
    if (!menu) {
      return stop("menu", `no Send Money entry found (tried ${SEND_MENU_LABELS.join(", ")})`);
    }
    log.push(`tapped "${menu}"`);
    await AutoAccessibility.sleep(2500);

    // Send Money opens a chooser; pick the person transfer ("To Individual").
    if (!(await AutoAccessibility.clickByText("Individual"))) {
      return stop("menu", "no 'To Individual' option after Send Money");
    }
    log.push("chose To Individual");
    await AutoAccessibility.sleep(3000);

    onPhase("recipient");
    // The number field has no id; typeText targets the only editable node on
    // the screen and sets the text without raising a keyboard.
    await AutoAccessibility.typeText(recipientNationalDigits);
    log.push(`typed recipient ${recipientNationalDigits}`);
    await AutoAccessibility.sleep(800);
    if (!(await clickAnyText(NEXT_LABELS))) {
      return stop("recipient", "no Next button after the recipient");
    }
    await AutoAccessibility.sleep(3500);

    onPhase("amount");
    // Focus the amount box to raise the numeric keypad, fill it, then commit
    // with the keypad's green OK — there is no on-screen Next here.
    await tapFraction(AMOUNT_FIELD.fx, AMOUNT_FIELD.fy);
    await AutoAccessibility.sleep(600);
    await AutoAccessibility.typeText(amountBirr);
    log.push(`typed amount ${amountBirr}`);
    await AutoAccessibility.sleep(600);
    await tapFraction(KEYPAD_OK.fx, KEYPAD_OK.fy);
    await AutoAccessibility.sleep(3000);

    onPhase("confirm");
    const confirm = await clickExactAny(["Send", "Confirm", "Pay", "OK"]);
    if (!confirm) {
      return stop("confirm", "no Send button on the confirmation sheet");
    }
    log.push(`tapped "${confirm}"`);
    await AutoAccessibility.sleep(3000);

    // telebirr asks for the PIN again to authorise the transfer.
    onPhase("pin");
    await tapPin(pin);
    log.push("entered PIN");
    await AutoAccessibility.sleep(6000);

    // Confirm it actually went through before claiming success.
    const after = await AutoAccessibility.scrapeScreen();
    const ok = after.some((n) => /success/i.test(n.text || n.description || ""));
    const receipt = after
      .map((n) => (n.text || "").trim())
      .find((t) => /^[A-Z0-9]{8,}$/.test(t));

    if (!ok) {
      onPhase("returning");
      await returnToAutoPilot();
      return stop("pin", "PIN entered but no success screen — wrong PIN, or telebirr is on Wi-Fi");
    }

    // Read the new balance while still inside telebirr. Doing it here is what
    // keeps it to one trip: going back for it afterwards would mean opening
    // telebirr and signing in all over again.
    let balance: number | null = null;
    try {
      // The success screen sits in front of home until it is dismissed, and
      // it shows the sum just sent. Dismissing it is what puts the real
      // balance on screen; reading without doing so reads the transfer amount.
      const dismissed = await clickAnyText([
        "Finished",
        "Finish",
        "Done",
        "Complete",
        "Completed",
        "Back to Home",
        "OK",
      ]);
      if (dismissed) {
        log.push(`tapped "${dismissed}"`);
        await AutoAccessibility.sleep(3000);
      }

      // `reachHome` still runs: it confirms home is really in front, and
      // relaunches telebirr if the success screen led somewhere else instead.
      if (await reachHome(pin, () => {})) {
        balance = (await readHomeBalance()).balance;
        log.push(balance === null ? "could not re-read the balance" : `balance now ${balance}`);
      } else {
        log.push("could not get back to home to re-read the balance");
      }
    } catch {
      // The transfer already succeeded; failing to re-read the balance must not
      // turn a sent payment into a reported failure.
    }

    onPhase("returning");
    await returnToAutoPilot();

    onPhase("done");
    log.push(`sent ETB ${amountBirr} to +251${recipientNationalDigits}${receipt ? ` · ${receipt}` : ""}`);
    return { ok: true, log, balance };
  } catch (e: any) {
    return stop("opening", e?.message ?? String(e));
  }
}
