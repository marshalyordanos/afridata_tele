export type AdminRole = "SUPER_ADMIN" | "ADMIN";

export type AdminProfile = {
  id: string;
  phone: string;
  name: string;
  role: AdminRole;
};

const TOKEN_KEY = "afridata.admin.token";
const PROFILE_KEY = "afridata.admin.profile";

/** Fired when a request is rejected, so the app can drop back to the login page. */
export const SESSION_EXPIRED = "afridata:session-expired";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/** The cached profile paints the shell before /auth/me confirms the token. */
export function getProfile(): AdminProfile | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as AdminProfile) : null;
  } catch {
    return null;
  }
}

export function saveSession(token: string, profile: AdminProfile) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // A blocked storage just means the session lasts until the tab closes.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch {
    // Nothing to clear.
  }
}
