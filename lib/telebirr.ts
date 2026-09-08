import type { Macro, Step } from "./macros";
import { TELEBIRR } from "./apps";

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
 * The PIN that authorises a transfer, on the screen after Send.
 *
 * Held separately from the login PIN even though both are 123789 today: they
 * are two different prompts and only one of them moves money, so the last step
 * should not silently follow a change made to the sign-in screen's PIN.
 */
export const TELEBIRR_PAYMENT_PIN = "123789";

/**
 * The authorisation PIN, digit by digit.
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
  return TELEBIRR_LOGIN.pin.split("").flatMap((digit) => [
    { type: "clickAny", viewIds: [`tv_input_${digit}`], texts: [digit] } as Step,
    { type: "wait", ms: 800 } as Step,
  ]);
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
