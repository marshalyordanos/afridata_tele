import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The shape of a telebirr account as AutoPilot holds it.
 *
 * A snapshot is whatever the last successful read produced. The balance comes
 * from telebirr's home screen (revealed past its ****** mask) and the
 * transactions from its "Transaction History" mini-app — both scraped in
 * ./telebirr (see `parseBalance` and `parseTransactions`). Before the first
 * read the snapshot is blank (balance null, no rows) so nothing invented shows.
 */
/** One line as the accessibility engine saw it, kept for the receipt page. */
export interface TelebirrSourceNode {
  id: string;
  text: string;
}

export interface TelebirrTransaction {
  id: string;
  /** Group heading this row belongs under ("Today", "Yesterday", "Fri 5 Sep"). */
  day: string;
  /** Clock time as telebirr printed it, e.g. "10:24". */
  time: string;
  /** "Received", "Merchant", "Transfer", "Package", "Withdrawal", "Self". */
  kind: string;
  name: string;
  /** Masked number or agent id on the other side, when telebirr shows one. */
  counterparty?: string;
  /** ETB, positive when money came in, negative when it went out. */
  value: number;
  receipt: string;
  charge: string;
  balanceAfter: string;
  status: string;
  /** Raw nodes this row was built from; absent on rows that were never scraped. */
  sourceNodes?: TelebirrSourceNode[];
}

/** The secondary line under a transaction name in the lists. */
export function txMeta(tx: TelebirrTransaction): string {
  return `${tx.kind} · ${tx.time}`;
}

export function findTransaction(
  snapshot: TelebirrSnapshot,
  id: string
): TelebirrTransaction | undefined {
  return snapshot.transactions.find((tx) => tx.id === id);
}

export interface TelebirrSnapshot {
  /** ETB, or null when nothing has been read yet. */
  balance: number | null;
  /** Nine national digits, no +251 prefix — same form telebirr's field wants. */
  phoneNationalDigits: string;
  accountKind: string;
  /** Where the one-tap send goes: nine digits after +251, empty until set. */
  sendRecipientDigits: string;
  /** Epoch ms of the last successful read, or null. */
  readAt: number | null;
  transactions: TelebirrTransaction[];
}

export const EMPTY_SNAPSHOT: TelebirrSnapshot = {
  // Nothing real is known until the first read from telebirr — start blank
  // rather than showing an invented balance or invented receipts.
  balance: null,
  phoneNationalDigits: "986680094",
  accountKind: "Personal",
  // Default recipient (+251 986680093). Must not be the signed-in number
  // above — telebirr refuses a self-transfer.
  sendRecipientDigits: "986680093",
  readAt: null,
  // Filled in by the first telebirr read; no invented rows before that.
  transactions: [],
};

// Bumped to v2 so any snapshot saved while the app still shipped demo balance
// and demo receipts is ignored — the app starts blank and shows only what it
// reads from telebirr.
const KEY = "autopilot.telebirr.snapshot.v2";

export async function loadSnapshot(): Promise<TelebirrSnapshot> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...EMPTY_SNAPSHOT, ...JSON.parse(raw) } : EMPTY_SNAPSHOT;
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export async function saveSnapshot(snapshot: TelebirrSnapshot): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
}

/** 12480.65 -> "12,480.65" */
export function money(value: number): string {
  const [whole, cents] = Math.abs(value).toFixed(2).split(".");
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "." + cents;
}

/** -499 -> "−499.00" (a real minus sign, so it lines up with the plus). */
export function signedMoney(value: number): string {
  return (value >= 0 ? "+" : "−") + money(value);
}

/** "986680094" -> "+251 98 ••• 0094" — enough to recognise, not enough to dial. */
export function maskPhone(nationalDigits: string): string {
  if (nationalDigits.length < 9) return "+251 " + nationalDigits;
  return `+251 ${nationalDigits.slice(0, 2)} ••• ${nationalDigits.slice(-4)}`;
}

export function relativeTime(readAt: number | null): string {
  if (!readAt) return "never";
  const mins = Math.floor((Date.now() - readAt) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

export interface TransactionSection {
  title: string;
  data: TelebirrTransaction[];
}

/** Keeps the incoming order and only breaks it where the day label changes. */
export function groupByDay(transactions: TelebirrTransaction[]): TransactionSection[] {
  const sections: TransactionSection[] = [];
  for (const tx of transactions) {
    const last = sections[sections.length - 1];
    if (last && last.title === tx.day) last.data.push(tx);
    else sections.push({ title: tx.day, data: [tx] });
  }
  return sections;
}

export function totals(transactions: TelebirrTransaction[]): { in: number; out: number } {
  return transactions.reduce(
    (acc, tx) => (tx.value > 0 ? { ...acc, in: acc.in + tx.value } : { ...acc, out: acc.out - tx.value }),
    { in: 0, out: 0 }
  );
}

/** Comma-safe CSV of everything currently held, for the Export action. */
export function toCsv(transactions: TelebirrTransaction[]): string {
  const rows = transactions.map((tx) =>
    [tx.day, tx.time, tx.kind, tx.name, tx.value.toFixed(2), tx.receipt, tx.charge, tx.balanceAfter]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  return ["day,time,kind,name,amount_etb,receipt,service_charge,balance_after", ...rows].join("\n");
}
