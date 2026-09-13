import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { io } from "socket.io-client";
import { API_URL } from "./api";
import { useAgent } from "./agent";
import {
  fetchHistory,
  markHandled,
  queueLookup,
  type ConfirmStage,
  type StoredRequest,
} from "./autoConfirm";

/**
 * The handset's live link to the server, shared by every screen.
 *
 * The agent's phone holds one socket open while the app is running. When a
 * customer sends this agent a deposit reference or a cash-out request on the
 * web page, the server pushes it here and it lands in the notification list — which the home screen shows
 * as a badge and the notifications screen shows in full. Both read this one
 * provider, so opening the screen and seeing the badge can never disagree.
 */

/**
 * Something a customer asked this agent for.
 *
 * Neither kind carries a verified figure: the server never sees the telebirr
 * payment, so a deposit is only the reference the customer typed, and a
 * withdrawal only the amount they asked for. The agent settles both against
 * their own telebirr account.
 */
export type CustomerRequest = {
  /** Stable key — the same reference or amount can arrive more than once. */
  id: string;
  at: number;
  read: boolean;
} & (
  | {
      kind: "deposit";
      reference: string;
      requestId: string;
      /** How the automatic telebirr lookup is going, and what it found. */
      stage: ConfirmStage;
      amount?: number;
      reason?: string;
    }
  | { kind: "withdrawal"; amount: number; phone: string }
);

export type ConnectionState = "connecting" | "online" | "offline";

/** What the socket puts on the wire; `id` and `read` are ours to add. */
type CustomerRequestEvent = { at: number } & (
  | { kind: "deposit"; reference: string; requestId: string }
  | { kind: "withdrawal"; amount: number; phone: string }
);

/** The server's record of how a check ended — authoritative over local state. */
interface SettledEvent {
  requestId: string;
  reference: string;
  status: "CONFIRMED" | "NOT_FOUND" | "FAILED";
  amount: number | null;
  reason: string | null;
  resolvedAt: string | null;
}

const STAGE_OF: Record<StoredRequest["status"], ConfirmStage> = {
  PENDING: "reading",
  CONFIRMED: "confirmed",
  NOT_FOUND: "not_found",
  FAILED: "failed",
};

/** A stored row as the list holds it. */
function fromStored(row: StoredRequest): CustomerRequest {
  const at = Date.parse(row.createdAt) || Date.now();
  return {
    kind: "deposit",
    id: `deposit-${row.reference}-${at}`,
    requestId: row.requestId,
    reference: row.reference,
    at,
    // History has been seen by definition — it is not new unread news.
    read: true,
    stage: STAGE_OF[row.status],
    amount: row.amount ?? undefined,
    reason: row.reason ?? undefined,
  };
}

/** How many to keep. Older ones fall off the end rather than growing forever. */
const MAX_ALERTS = 50;
const KEY = "autopilot.requests";

async function loadStored(): Promise<CustomerRequest[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CustomerRequest[]) : [];
  } catch {
    return [];
  }
}

interface RealtimeValue {
  alerts: CustomerRequest[];
  unread: number;
  state: ConnectionState;
  markAllRead: () => void;
  dismiss: (id: string) => void;
  clear: () => void;
}

const RealtimeContext = createContext<RealtimeValue>({
  alerts: [],
  unread: 0,
  state: "connecting",
  markAllRead: () => {},
  dismiss: () => {},
  clear: () => {},
});

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { agent } = useAgent();
  const [alerts, setAlerts] = useState<CustomerRequest[]>([]);
  const [state, setState] = useState<ConnectionState>("connecting");
  // Alerts are read from storage before the socket opens, so an event arriving
  // early cannot be overwritten by the load landing after it.
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    loadStored().then((stored) => {
      setAlerts(stored);
      setRestored(true);
    });
  }, []);

  // The server's history wins over the device's copy: it includes checks
  // answered while the app was shut, and it closes off any the phone abandoned.
  // Everything it returns is marked handled so restoring can never set a
  // telebirr lookup running for a check that is already over.
  useEffect(() => {
    if (!restored || !agent) return;
    let alive = true;

    fetchHistory(agent.phone, agent.pin).then((rows) => {
      if (!alive || !rows) return;
      for (const row of rows) markHandled(row.requestId);

      setAlerts((current) => {
        const fromServer = rows.map(fromStored);
        const known = new Set(rows.map((row) => row.requestId));
        // Withdrawals are push-only — the server keeps no row for them — so the
        // local ones are kept and merged in by time.
        const localOnly = current.filter(
          (item) => item.kind !== "deposit" || !known.has(item.requestId),
        );
        return [...fromServer, ...localOnly]
          .sort((a, b) => b.at - a.at)
          .slice(0, MAX_ALERTS);
      });
    });

    return () => {
      alive = false;
    };
  }, [restored, agent?.id, agent?.phone, agent?.pin]);

  useEffect(() => {
    if (!restored) return;
    AsyncStorage.setItem(KEY, JSON.stringify(alerts)).catch(() => {});
  }, [alerts, restored]);

  useEffect(() => {
    if (!restored) return;
    if (!agent || !API_URL) {
      setState("offline");
      return;
    }

    // The socket authenticates with the same credentials the agent enrolled
    // with; the server puts this phone in that agent's room and no other.
    const socket = io(API_URL, {
      transports: ["websocket"], // React Native has no XHR long-polling worth using.
      auth: { phone: agent.phone, pin: agent.pin },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });
    socket.on("connect", () => setState("online"));
    socket.on("disconnect", () => setState("offline"));
    socket.on("connect_error", () => setState("offline"));

    socket.on("customer:request", (event: CustomerRequestEvent) => {
      const key = event.kind === "deposit" ? event.reference : `${event.phone}-${event.amount}`;
      const request: CustomerRequest =
        event.kind === "deposit"
          ? { ...event, id: `deposit-${key}-${event.at}`, read: false, stage: "queued" }
          : { ...event, id: `withdrawal-${key}-${event.at}`, read: false };

      setAlerts((current) => [request, ...current].slice(0, MAX_ALERTS));

      // A deposit answers itself: the phone opens telebirr, finds the receipt
      // and reports the amount back, which is what makes the customer's page
      // succeed. Withdrawals have nothing to look up — the agent pays out.
      if (event.kind === "deposit") {
        queueLookup(event.requestId, event.reference, (progress) => {
          setAlerts((current) =>
            current.map((item) =>
              item.kind === "deposit" && item.requestId === progress.requestId
                ? { ...item, stage: progress.stage, amount: progress.amount, reason: progress.reason }
                : item,
            ),
          );
        });
      }
    });

    // The outcome as the server recorded it. The phone that ran the lookup
    // already knows, but this also reaches a second device and a phone that
    // reconnected mid-check.
    socket.on("deposit:settled", (event: SettledEvent) => {
      setAlerts((current) =>
        current.map((item) =>
          item.kind === "deposit" && item.requestId === event.requestId
            ? {
                ...item,
                stage: STAGE_OF[event.status],
                amount: event.amount ?? undefined,
                reason: event.reason ?? undefined,
              }
            : item,
        ),
      );
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
    // Reconnects when the enrolled agent changes — including to nothing, on
    // sign-out, which drops the socket rather than leaving it open.
  }, [restored, agent?.id, agent?.phone, agent?.pin]);

  const markAllRead = useCallback(() => {
    setAlerts((current) =>
      current.some((a) => !a.read) ? current.map((a) => ({ ...a, read: true })) : current,
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setAlerts((current) => current.filter((a) => a.id !== id));
  }, []);

  const clear = useCallback(() => setAlerts([]), []);

  const value = useMemo<RealtimeValue>(
    () => ({
      alerts,
      unread: alerts.reduce((n, a) => (a.read ? n : n + 1), 0),
      state,
      markAllRead,
      dismiss,
      clear,
    }),
    [alerts, state, markAllRead, dismiss, clear],
  );

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** The shared notification list and socket state. */
export function useRealtime(): RealtimeValue {
  return useContext(RealtimeContext);
}
