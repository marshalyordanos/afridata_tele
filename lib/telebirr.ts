import { Dimensions, PixelRatio } from "react-native";
import Constants from "expo-constants";
import AutoAccessibility, { ScrapedNode } from "auto-accessibility";
import type { Macro, Step } from "./macros";
import type { TelebirrTransaction } from "./telebirrData";
import { TELEBIRR, openKnownApp } from "./apps";

/**
 * telebirr auto-login.
 *
 * Credentials live here so the one-tap "Sign in to telebirr" button can fill
 * them in. This is the user's own device and their own account; the values are
 * only ever passed to telebirr's own login fields and never leave the phone.
 *
 * The number is entered WITHOUT the +251 country code, because telebirr shows
 * +251 as a fixed prefix (tv_area_code) and its input field (et_input) holds
 * only the 9 national digits.
 */
export const TELEBIRR_LOGIN = {
  // +251 986680094  ->  the field only wants the 9 digits after +251.
  phoneNationalDigits: "986680094",
  pin: "123789",
};

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
function loginSteps(): Step[] {
  const { phoneNationalDigits, pin } = TELEBIRR_LOGIN;

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

export function buildTelebirrLoginMacro(): Macro {
  return {
    id: "telebirr-login",
    name: "Sign in to telebirr",
    steps: loginSteps(),
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
 * The authorisation PIN, digit by digit — deliberately TELEBIRR_LOGIN.pin, the
 * same 123789 used to sign in, so the two can never drift apart.
 *
 * Verified against CommonCheckStandActivity: its keypad is plain TextViews "0"
 * to "9" with no resource ids and clickable=false, so clickAny falls through to
 * tapping the centre of the digit's label. The tv_input_* ids are tried first
 * only because the login keypad uses them.
 *
 * 800ms between digits, not the login screen's 350: at 400ms this keypad
 * silently dropped every tap, and at 800ms all six registered.
 */
function paymentPinTaps(): Step[] {
  const digits = TELEBIRR_LOGIN.pin.split("");
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
export function buildTelebirrSendMoneyMacro(amount: string): Macro {
  return {
    id: "telebirr-send-money",
    name: `Send ${amount} to ${TELEBIRR_RECIPIENT.full}`,
    steps: [
      ...loginSteps(),
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
      ...paymentPinTaps(),
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
export function parseBalance(nodes: { text: string; description: string }[]): number | null {
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

/** "DD-MM-YYYY HH:MM" as telebirr's Transaction History prints each row's time. */
const TX_DATETIME = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}:\d{2})$/;
/** "+500.00" / "-1.00" — the signed amount node that follows the date. */
const TX_AMOUNT = /^([+-])\s*([0-9][0-9,]*\.[0-9]{2})$/;

/** A short category from telebirr's transaction label, for the coloured chip. */
function deriveKind(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("cash in")) return "Cash In";
  if (n.includes("cash out") || n.includes("withdraw")) return "Withdrawal";
  if (n.includes("transfer")) return "Transfer";
  if (n.includes("package")) return "Package";
  if (n.includes("merchant")) return "Merchant";
  if (n.includes("bill")) return "Bill";
  if (n.includes("airtime")) return "Airtime";
  if (n.includes("receive")) return "Received";
  return name;
}

/**
 * Transactions out of telebirr's "Transaction History" mini-app screen.
 *
 * Verified live against the macle mini-program (SingleProcessActivity). Its
 * rows come through the accessibility tree in document order as four
 * consecutive text nodes — name, "DD-MM-YYYY HH:MM", signed amount, "ETB" —
 * with month headers ("September", "August") and the Pay/Income/Total summary
 * interleaved. Anchoring on the date node is what keeps the summary figures
 * (which have no date) out of the list.
 *
 * The list screen shows no receipt id, fee or running balance — those live on
 * each receipt's own detail screen — so those fields are left blank here and
 * filled in when a row is opened.
 */
export function parseTransactions(
  nodes: { text: string; description: string }[]
): TelebirrTransaction[] {
  const texts = nodes.map((n) => (n.text || n.description || "").trim());
  const out: TelebirrTransaction[] = [];
  for (let i = 0; i < texts.length; i++) {
    const when = texts[i].match(TX_DATETIME);
    if (!when) continue;
    // The amount is the next signed node within a step or two of the date.
    let value: number | null = null;
    for (let j = i + 1; j < Math.min(i + 3, texts.length); j++) {
      const amt = texts[j].match(TX_AMOUNT);
      if (amt) {
        value = Number(amt[2].replace(/,/g, "")) * (amt[1] === "-" ? -1 : 1);
        break;
      }
    }
    if (value === null) continue;
    // The label sits just before the date; guard against a month/summary node.
    const label = texts[i - 1] ?? "";
    const name = label && !/\(ETB\)$/.test(label) ? label : "Transaction";
    const [, dd, mm, yyyy, hhmm] = when;
    const date = `${dd}-${mm}-${yyyy}`;
    out.push({
      id: `${date}_${hhmm}_${value}_${out.length}`,
      day: date,
      time: hhmm,
      kind: deriveKind(name),
      name,
      value,
      receipt: "",
      charge: "",
      balanceAfter: "",
      status: "",
    });
  }
  return out;
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

/**
 * Open the Transaction History mini-app from home and return its rows.
 *
 * The "Transaction Details" tile is below the fold, so this swipes up and polls
 * for the link before tapping it, then polls for the list — which renders about
 * seven seconds AFTER the mini-app opens, not immediately. The whole thing is
 * retried once, since a swipe or the H5 load can miss on a cold run.
 */
async function readTransactions(): Promise<TelebirrTransaction[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    // Bring the tile into view (up to three swipes) and open it.
    let opened = false;
    for (let s = 0; s < 3 && !opened; s++) {
      await swipeUp();
      await AutoAccessibility.sleep(900);
      opened = await AutoAccessibility.clickByText("Transaction Detail");
    }
    if (opened) {
      // Rows appear ~7s after the mini-app opens; poll up to ~18s.
      for (let i = 0; i < 12; i++) {
        await AutoAccessibility.sleep(1500);
        const rows = parseTransactions(await AutoAccessibility.scrapeScreen());
        if (rows.length) {
          await AutoAccessibility.pressBack(); // leave the mini-app
          await AutoAccessibility.sleep(1500);
          return rows;
        }
      }
      // Opened but nothing rendered — back out and try the whole thing again.
      await AutoAccessibility.pressBack();
      await AutoAccessibility.sleep(2000);
    }
  }
  return [];
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
export async function syncTelebirr(
  onPhase: (phase: SyncPhase) => void
): Promise<{
  balance: number | null;
  transactions: TelebirrTransaction[];
  nodes: ScrapedNode[];
}> {
  const { pin } = TELEBIRR_LOGIN;

  onPhase("opening");
  await openKnownApp(TELEBIRR);
  await AutoAccessibility.sleep(4000);

  // Sign in if asked, and make sure we are actually on home before reading —
  // telebirr may resume on a splash or a mini-app instead of home.
  onPhase("phone");
  const home = await reachHome(pin, onPhase);

  onPhase("reading");
  let nodes = await AutoAccessibility.scrapeScreen();
  // Reveal ONLY when the main balance itself can't be read (masked or absent).
  // Keying off parseBalance — not "is any ****** on screen" — matters: the
  // Endekise/Reward figures are separately masked, so tapping the eye while the
  // main total is already showing would just hide it again.
  if (parseBalance(nodes) === null) {
    await tapFraction(BALANCE_EYE.fx, BALANCE_EYE.fy);
    await AutoAccessibility.sleep(1200);
    nodes = await AutoAccessibility.scrapeScreen();
  }
  const balance = parseBalance(nodes);

  // Then the receipts, from the "Transaction Details" tile (opens telebirr's
  // Transaction History mini-app). Only attempted once we know we are on home.
  const transactions = home ? await readTransactions() : [];

  // The read is done in telebirr; put AutoPilot back in front of the user.
  onPhase("returning");
  await returnToAutoPilot();

  onPhase("done");
  return { balance, transactions, nodes };
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
  const { phoneNationalDigits, pin } = TELEBIRR_LOGIN;
  const log: string[] = [];
  const stop = (phase: SendPhase, message: string): SendResult => {
    log.push(`✗ ${message}`);
    return { ok: false, log, failedAt: phase };
  };

  // telebirr blocks self-transfers, so a send to the signed-in number can never
  // succeed — the recipient screen just refuses to advance. Catch it here.
  if (recipientNationalDigits === phoneNationalDigits) {
    return stop("recipient", "telebirr will not send to your own number — use a different one");
  }

  try {
    onPhase("opening");
    const pkg = await openKnownApp(TELEBIRR);
    log.push(`opened ${pkg}`);
    await AutoAccessibility.sleep(4000);

    // Login is detected by the on-screen text, not a probe for et_input, which
    // does not exist on this build. The number is prefilled, so only Next + PIN.
    onPhase("login");
    if (looksLikeLogin(await AutoAccessibility.scrapeScreen())) {
      if (!(await AutoAccessibility.clickByText("Next"))) {
        return stop("login", "sign-in: Next not found on the login screen");
      }
      await AutoAccessibility.sleep(6000);
      await tapPin(pin);
      await AutoAccessibility.sleep(6000);
      log.push("signed in");
    } else {
      log.push("already signed in");
    }

    onPhase("menu");
    const menu = await clickAnyText(SEND_MENU_LABELS);
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

    onPhase("returning");
    await returnToAutoPilot();

    if (!ok) {
      return stop("pin", "PIN entered but no success screen — wrong PIN, or telebirr is on Wi-Fi");
    }
    onPhase("done");
    log.push(`sent ETB ${amountBirr} to +251${recipientNationalDigits}${receipt ? ` · ${receipt}` : ""}`);
    return { ok: true, log };
  } catch (e: any) {
    return stop("opening", e?.message ?? String(e));
  }
}
