import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The shape of a telebirr account as AutoPilot holds it.
 *
 * A snapshot is whatever the last successful read produced. The balance comes
 * from scraping telebirr's home screen (see `parseBalance` in ./telebirr);
 * the transaction list is still SAMPLE data — telebirr's receipt list has not
 * been mapped to view-ids yet, so `transactions` is seeded with realistic
 * placeholders and replaced wholesale once a receipt scraper exists.
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
  /** Epoch ms of the last successful read, or null. */
  readAt: number | null;
  transactions: TelebirrTransaction[];
}

const SAMPLE_TRANSACTIONS: TelebirrTransaction[] = [
  {
    id: "cj8k2m4p1q", day: "Today", time: "10:24", kind: "Received", name: "Hanna Girma",
    counterparty: "+251 91 ••• 4472", value: 2500, receipt: "CJ8K2M4P1Q",
    charge: "ETB 0.00", balanceAfter: "ETB 12,480.65", status: "Completed",
    sourceNodes: [
      { id: "tv_title", text: "Receive Money" },
      { id: "tv_amount", text: "2,500.00" },
      { id: "tv_trans_id", text: "CJ8K2M4P1Q" },
      { id: "tv_balance", text: "ETB 12,480.65" },
    ],
  },
  {
    id: "cj8h9l2k7t", day: "Today", time: "09:02", kind: "Package", name: "Ethio Telecom · 30GB",
    counterparty: "Self", value: -499, receipt: "CJ8H9L2K7T",
    charge: "ETB 0.00", balanceAfter: "ETB 9,980.65", status: "Completed",
  },
  {
    id: "cj7r4t8w2n", day: "Yesterday", time: "18:41", kind: "Merchant", name: "Shoa Supermarket",
    counterparty: "Merchant 220145", value: -1243.35, receipt: "CJ7R4T8W2N",
    charge: "ETB 0.00", balanceAfter: "ETB 10,479.65", status: "Completed",
  },
  {
    id: "cj7b6v3x9d", day: "Yesterday", time: "14:05", kind: "Transfer", name: "Abebe Tadesse",
    counterparty: "+251 92 ••• 1180", value: -3000, receipt: "CJ7B6V3X9D",
    charge: "ETB 0.00", balanceAfter: "ETB 11,723.00", status: "Completed",
  },
  {
    id: "cj7m1c5z4f", day: "Yesterday", time: "11:30", kind: "Received", name: "Yonas Kebede",
    counterparty: "+251 93 ••• 7708", value: 6800, receipt: "CJ7M1C5Z4F",
    charge: "ETB 0.00", balanceAfter: "ETB 14,723.00", status: "Completed",
  },
  {
    id: "cj5n7q2h6r", day: "Fri 5 Sep", time: "20:12", kind: "Self", name: "Airtime top-up",
    counterparty: "+251 98 ••• 0094", value: -100, receipt: "CJ5N7Q2H6R",
    charge: "ETB 0.00", balanceAfter: "ETB 7,923.00", status: "Completed",
  },
  {
    id: "cj5d3g8j1k", day: "Fri 5 Sep", time: "16:48", kind: "Withdrawal", name: "Cash out · Agent 4471",
    counterparty: "Agent 4471", value: -2000, receipt: "CJ5D3G8J1K",
    charge: "ETB 12.50", balanceAfter: "ETB 8,023.00", status: "Completed",
  },
];

export const EMPTY_SNAPSHOT: TelebirrSnapshot = {
  balance: 12480.65,
  phoneNationalDigits: "986680094",
  accountKind: "Personal",
  readAt: null,
  transactions: SAMPLE_TRANSACTIONS,
};

const KEY = "autopilot.telebirr.snapshot";

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
