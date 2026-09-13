import Constants from "expo-constants";

/**
 * Where the API lives.
 *
 * EXPO_PUBLIC_API_URL is the one to set — put it in apps/mobile/.env, e.g.
 *   EXPO_PUBLIC_API_URL=http://<your-lan-ip>:4000
 * It has to be an address the handset can reach, so localhost only works for
 * the emulator; on a real phone use the machine's LAN IP. When it is unset we
 * fall back to the host that served the JS bundle (the Metro host) on the
 * server's default port, which is right for the usual `expo run:android` setup.
 */
const DEFAULT_PORT = 4000;

function metroHost(): string | null {
  const uri = Constants.expoConfig?.hostUri ?? (Constants as any).expoGoConfig?.debuggerHost;
  const host = typeof uri === "string" ? uri.split(":")[0] : "";
  return host || null;
}

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/+$/, "") ??
  (metroHost() ? `http://${metroHost()}:${DEFAULT_PORT}` : null);

/** An API call that failed with a response — `code` is the server's error slug. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: any = null
  ) {
    super(message);
  }
}

/**
 * POST JSON and parse the reply, turning a non-2xx into an ApiError carrying the
 * server's error slug so callers can match on it rather than on wording.
 */
export async function postJson<T>(path: string, body: unknown, timeoutMs = 15000): Promise<T> {
  if (!API_URL) {
    throw new ApiError(0, "NO_API_URL", "No server address configured (EXPO_PUBLIC_API_URL).");
  }

  // fetch has no timeout of its own, and a handset on a bad connection would
  // otherwise leave the button spinning indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e: any) {
    // Both messages name the address that was tried: the usual cause is an
    // EXPO_PUBLIC_API_URL pointing somewhere the handset cannot reach, and a
    // bare "no answer" gives nobody anything to check.
    const timedOut = e?.name === "AbortError";
    throw new ApiError(
      0,
      timedOut ? "TIMEOUT" : "NETWORK",
      timedOut
        ? `No answer from ${API_URL}. Check the phone is on the same Wi-Fi and that the address is this computer's.`
        : `Could not reach ${API_URL}.`
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const payload = text ? safeJson(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error ?? `HTTP_${response.status}`,
      payload?.error ?? `Request failed (${response.status}).`,
      payload
    );
  }
  return payload as T;
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
