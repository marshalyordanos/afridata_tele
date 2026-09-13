import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import AutoAccessibility from "auto-accessibility";

/**
 * Accessibility access, as the UI needs to talk about it.
 *
 * Three states rather than a boolean, because the settings toggle and a bound
 * service are not the same thing: Android takes a second or two to bind after
 * the switch is flipped, and it rebinds after the app's process restarts. In
 * that gap `isServiceEnabled()` is already true while every scrape, click and
 * type call still fails — which is exactly how a run gets as far as opening
 * telebirr and then dies on the first read.
 *
 *  - "off"       the switch is off; nothing can be driven
 *  - "starting"  switch on, service not bound yet; wait, do not start a run
 *  - "on"        bound and callable
 */
export type AccessState = "checking" | "off" | "starting" | "on";

/** Shown wherever a run is refused, so the wording stays the same everywhere. */
export const ACCESS_OFF_MESSAGE =
  "Accessibility is off, so AutoPilot cannot read or tap telebirr. Turn it on at the top of this screen first.";

export const ACCESS_STARTING_MESSAGE =
  "Accessibility is on but Android has not started the service yet — give it a second and try again.";

/** Reads the live state, treating a missing native module as off. */
export function readAccessState(): Exclude<AccessState, "checking"> {
  try {
    if (!AutoAccessibility.isServiceEnabled()) return "off";
  } catch {
    // No native module at all (Expo Go, or a build without it).
    return "off";
  }
  try {
    return AutoAccessibility.isServiceRunning() ? "on" : "starting";
  } catch {
    // An older native build that predates isServiceRunning: the toggle is all
    // there is to go on, so trust it rather than reporting a permanent "off".
    return "on";
  }
}

/** True only when a macro can actually be driven right now. */
export function canAutomate(): boolean {
  return readAccessState() === "on";
}

/**
 * Throws before a run starts rather than part-way through it. Without this the
 * first thing a macro does — openApp — succeeds whether or not accessibility is
 * on, because it only asks the package manager to launch the app; the failure
 * then lands on the first scrape, after telebirr is already in the foreground.
 */
export function requireAccessibility(): void {
  const state = readAccessState();
  if (state === "on") return;
  throw new Error(state === "starting" ? ACCESS_STARTING_MESSAGE : ACCESS_OFF_MESSAGE);
}

export function openAccessibilitySettings(): void {
  try {
    AutoAccessibility.openAccessibilitySettings();
  } catch {
    // No native module attached (Expo Go, or a build without it) — nothing to open.
  }
}

/**
 * Live accessibility state for a screen. The switch is flipped outside the app,
 * so this polls while mounted and re-reads the moment the app is foregrounded.
 * `returnedWithoutAccess` is set when the user came back from settings with the
 * service still off, so a screen can say so instead of repeating itself.
 */
export function useAccessibility() {
  const [state, setState] = useState<AccessState>("checking");
  const [returnedWithoutAccess, setReturnedWithoutAccess] = useState(false);
  const leftForSettings = useRef(false);

  const refresh = useCallback(() => {
    const next = readAccessState();
    setState(next);
    if (next === "on") {
      leftForSettings.current = false;
      setReturnedWithoutAccess(false);
    }
    return next;
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 1500);
    const sub = AppState.addEventListener("change", (status) => {
      if (status !== "active") return;
      if (refresh() !== "on" && leftForSettings.current) setReturnedWithoutAccess(true);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [refresh]);

  const open = useCallback(() => {
    setReturnedWithoutAccess(false);
    leftForSettings.current = true;
    openAccessibilitySettings();
  }, []);

  return {
    state,
    /** Ready to drive a screen. */
    on: state === "on",
    returnedWithoutAccess,
    open,
    refresh,
  };
}
