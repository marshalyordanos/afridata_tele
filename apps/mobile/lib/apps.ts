import AutoAccessibility from "auto-accessibility";

/**
 * Apps we target by identity rather than by a single hardcoded package id.
 * Package ids differ between builds and regions, so each entry lists every id
 * we've seen plus the on-device label to fall back on.
 */
export interface KnownApp {
  id: string;
  label: string;
  packages: string[];
}

export const TELEBIRR: KnownApp = {
  id: "telebirr",
  label: "telebirr",
  // cn.tydic.ethiopay is the current Ethio Telecom build; the older id is kept
  // as a fallback for devices still on it.
  packages: ["cn.tydic.ethiopay", "cn.tydic.ethiotelecom"],
};

export const KNOWN_APPS: KnownApp[] = [TELEBIRR];

/** First candidate that is actually installed and launchable, else null. */
export async function resolveFirst(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const pkg = await AutoAccessibility.resolveApp(candidate);
    if (pkg) return pkg;
  }
  return null;
}

/** Candidate package ids for a known app, most specific first. */
export function candidatesFor(app: KnownApp): string[] {
  return [...app.packages, app.label];
}

/** Opens a known app, resolving whichever build is installed. */
export async function openKnownApp(app: KnownApp): Promise<string> {
  const pkg = await resolveFirst(candidatesFor(app));
  if (!pkg) throw new Error(`${app.label} is not installed on this device.`);
  await AutoAccessibility.openApp(pkg);
  return pkg;
}
