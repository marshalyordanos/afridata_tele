import type { TelebirrTransaction } from "./telebirrData";

/**
 * Reading telebirr's Transaction History list.
 *
 * Pure text in, rows out — no native modules — so it can be exercised against a
 * captured accessibility tree without a handset.
 *
 * The rows arrive as consecutive text nodes in document order, with month
 * headings ("September") and the Pay/Income/Total summary interleaved. The
 * date node is the anchor: it is the one thing every row has and nothing else
 * does, which is what keeps the summary figures out of the list.
 */

/**
 * The date-and-time node a row is anchored on.
 *
 * Deliberately loose. A strict "DD-MM-YYYY HH:MM" matched the one build this
 * was written against and nothing else, and when it fails to match NO rows are
 * produced at all — which looks like an empty history rather than a parsing
 * problem, and sends the whole read into a retry that reopens telebirr. So:
 * day-first or year-first, one or two digits, separated by - / . or a space,
 * seconds optional.
 */
const DMY = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/;
const YMD = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/;
const TIME = /^(\d{1,2}:\d{2})(?::\d{2})?$/;

export interface TxMoment {
  day: string;
  time: string;
}

/** "08-09-2026" or "2026-09-08" in either order, as DD-MM-YYYY. */
function matchDate(text: string): string | null {
  const dmy = text.match(DMY);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }

  const ymd = text.match(YMD);
  if (ymd) {
    const [, y, m, d] = ymd;
    return `${d.padStart(2, "0")}-${m.padStart(2, "0")}-${y}`;
  }

  return null;
}

/**
 * A row's moment, from one node or two.
 *
 * Some builds print "08-09-2026 16:28" as a single node and others split the
 * date and the time into neighbours, so both are accepted — `next` is consumed
 * only when this node carries no time of its own.
 */
export function matchMoment(text: string, next?: string): { moment: TxMoment; used: number } | null {
  const parts = text.trim().split(/\s+/);

  if (parts.length >= 2) {
    const day = matchDate(parts[0]);
    const time = parts[1].match(TIME);
    if (day && time) return { moment: { day, time: time[1] }, used: 1 };
  }

  if (parts.length === 1) {
    const day = matchDate(parts[0]);
    if (day) {
      // Date alone: the time is the neighbouring node, when there is one.
      const time = next?.trim().match(TIME);
      if (time) return { moment: { day, time: time[1] }, used: 2 };
      return { moment: { day, time: "" }, used: 1 };
    }
  }

  return null;
}

/**
 * "+500.00" / "-1.00" / "+18,000" — the signed amount node.
 *
 * The decimals are optional because not every build prints them; the sign is
 * not, and it is what keeps this from matching a receipt number or a count.
 */
export const TX_AMOUNT = /^([+-])\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)$/;

/**
 * A telebirr receipt number, e.g. DI95LETFC9.
 *
 * Upper-case letters and digits, and it must contain BOTH — that single rule is
 * what separates it from everything else on the row without having to know
 * where the build puts it: "ETB" has no digit, "18000" has no letter, the date
 * and the amount carry punctuation, and month headings are not upper-case.
 */
export const TX_RECEIPT = /^(?=.*[A-Z])(?=.*[0-9])[A-Z0-9]{6,24}$/;

/**
 * The same token, but found INSIDE a longer node.
 *
 * Some builds do not give the number a node of its own — it arrives as
 * "Transaction No. DI95LETFC9" or with the label glued on — and a whole-node
 * test finds nothing at all on those. Scanning for the token handles both, and
 * the letters-and-digits rule still does the discriminating: the date splits
 * into digit-only pieces, the amount has no letters, and a label has no digits.
 */
const RECEIPT_IN_TEXT = /[A-Z0-9]{6,24}/g;

export function extractReceipt(text: string): string {
  if (!text) return "";
  if (TX_RECEIPT.test(text)) return text;

  for (const candidate of text.match(RECEIPT_IN_TEXT) ?? []) {
    if (TX_RECEIPT.test(candidate)) return candidate;
  }
  return "";
}

/** A short category from telebirr's transaction label, for the coloured chip. */
export function deriveKind(name: string): string {
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

interface Anchor {
  at: number;
  amountAt: number;
  value: number;
  moment: TxMoment;
}

/** Every row's date node, with the signed amount that belongs to it. */
function anchors(texts: string[]): Anchor[] {
  const found: Anchor[] = [];

  for (let i = 0; i < texts.length; i++) {
    const hit = matchMoment(texts[i], texts[i + 1]);
    if (!hit) continue;

    // The amount is the next signed node within a step or two of the date —
    // measured from the end of whatever the date consumed.
    const from = i + hit.used;
    for (let j = from; j < Math.min(from + 3, texts.length); j++) {
      const amount = texts[j].match(TX_AMOUNT);
      if (amount) {
        found.push({
          at: i,
          amountAt: j,
          value: Number(amount[2].replace(/,/g, "")) * (amount[1] === "-" ? -1 : 1),
          moment: hit.moment,
        });
        break;
      }
    }
  }

  return found;
}

/**
 * Where this build puts the receipt number, as an offset from the date node.
 *
 * Decided once for the whole list rather than searched for per row, and that is
 * the whole point. Searching outwards from a single row will happily find the
 * NEXT row's receipt when the build prints it before the label instead of after
 * the amount — handing back a real reference paired with the wrong row's
 * amount, which for a deposit check means confirming money nobody sent. A list
 * is laid out the same way for every row, so the offset that holds across all
 * of them is the true one, and a stray match in one row cannot outvote it.
 *
 * Returns null when no offset holds for at least half the rows: better to read
 * no receipts, and say so, than to read them from the wrong place.
 */
function receiptOffset(texts: string[], list: Anchor[]): number | null {
  if (list.length === 0) return null;

  const NEAR = 6;
  let best: { offset: number; hits: number } | null = null;

  for (let offset = -NEAR; offset <= NEAR; offset++) {
    if (offset === 0) continue; // the date node itself

    let hits = 0;
    for (const row of list) {
      if (row.amountAt === row.at + offset) continue; // that is the amount
      if (extractReceipt(texts[row.at + offset] ?? "")) hits += 1;
    }

    if (!best || hits > best.hits) best = { offset, hits };
  }

  if (!best || best.hits * 2 < list.length) return null;
  return best.offset;
}

export function parseTransactions(
  nodes: { text: string; description: string }[],
): TelebirrTransaction[] {
  const texts = nodes.map((n) => (n.text || n.description || "").trim());
  const list = anchors(texts);
  const offset = receiptOffset(texts, list);

  return list.map((row, index) => {
    // The label sits just before the date; guard against a month/summary node,
    // and against a receipt number that sits there on some builds.
    const label = texts[row.at - 1] ?? "";
    const usable = label && !/\(ETB\)$/.test(label) && !TX_RECEIPT.test(label);
    const name = usable ? label : "Transaction";

    const date = row.moment.day;
    const hhmm = row.moment.time;
    // Only ever from the offset the list as a whole agrees on.
    const receipt = offset === null ? "" : extractReceipt(texts[row.at + offset] ?? "");

    return {
      id: `${date}_${hhmm}_${row.value}_${index}`,
      day: date,
      time: hhmm,
      kind: deriveKind(name),
      name,
      value: row.value,
      receipt,
      // Still only on the detail screen — the list shows neither.
      charge: "",
      balanceAfter: "",
      status: "",
    };
  });
}
