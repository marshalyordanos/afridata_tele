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
export interface TelebirrTransaction {
  id: string;
  /** Group heading this row belongs under ("Today", "Yesterday", "Fri 5 Sep"). */
  day: string;
  name: string;
  /** Secondary line: kind and time, e.g. "Merchant · 18:41". */
  meta: string;
  /** ETB, positive when money came in, negative when it went out. */
  value: number;
  receipt: string;
  charge: string;
  balanceAfter: string;
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
  { id: "cj8k2m4p1q", day: "Today", name: "Hanna Girma", meta: "Received · 10:24", value: 2500, receipt: "CJ8K2M4P1Q", charge: "ETB 0.00", balanceAfter: "ETB 12,480.65" },
  { id: "cj8h9l2k7t", day: "Today", name: "Ethio Telecom · 30GB", meta: "Package · 09:02", value: -499, receipt: "CJ8H9L2K7T", charge: "ETB 0.00", balanceAfter: "ETB 9,980.65" },
  { id: "cj7r4t8w2n", day: "Yesterday", name: "Shoa Supermarket", meta: "Merchant · 18:41", value: -1243.35, receipt: "CJ7R4T8W2N", charge: "ETB 0.00", balanceAfter: "ETB 10,479.65" },
  { id: "cj7b6v3x9d", day: "Yesterday", name: "Abebe Tadesse", meta: "Transfer · 14:05", value: -3000, receipt: "CJ7B6V3X9D", charge: "ETB 0.00", balanceAfter: "ETB 11,723.00" },
  { id: "cj7m1c5z4f", day: "Yesterday", name: "Yonas Kebede", meta: "Received · 11:30", value: 6800, receipt: "CJ7M1C5Z4F", charge: "ETB 0.00", balanceAfter: "ETB 14,723.00" },
  { id: "cj5n7q2h6r", day: "Fri 5 Sep", name: "Airtime top-up", meta: "Self · 20:12", value: -100, receipt: "CJ5N7Q2H6R", charge: "ETB 0.00", balanceAfter: "ETB 7,923.00" },
  { id: "cj5d3g8j1k", day: "Fri 5 Sep", name: "Cash out · Agent 4471", meta: "Withdrawal · 16:48", value: -2000, receipt: "CJ5D3G8J1K", charge: "ETB 12.50", balanceAfter: "ETB 8,023.00" },
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
    [tx.day, tx.name, tx.meta, tx.value.toFixed(2), tx.receipt, tx.charge, tx.balanceAfter]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(",")
  );
  return ["day,name,detail,amount_etb,receipt,service_charge,balance_after", ...rows].join("\n");
}
