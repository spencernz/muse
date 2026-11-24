import { useSyncExternalStore } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { native } from "./native";

/** The user's choice; "system" follows the operating system's light/dark setting. */
export type Appearance = "system" | "light" | "dark";
export type Scheme = "light" | "dark";

const KEY = "muse.appearance";
const listeners = new Set<() => void>();
let current: Appearance = read();

function read(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
function query() {
  return typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: light)")
    : null;
}
export function resolveScheme(appearance: Appearance): Scheme {
  if (appearance !== "system") return appearance;
  return query()?.matches ? "light" : "dark";
}
function apply() {
  const scheme = resolveScheme(current);
  const root = document.documentElement;
  if (root.dataset.theme !== scheme) root.dataset.theme = scheme;
  if (native)
    // Keeps the native title bar and window controls in step; null follows the OS.
    void getCurrentWindow()
      .setTheme(current === "system" ? null : current)
      .catch(() => {});
  listeners.forEach((listener) => listener());
}
export function getAppearance() {
  return current;
}
export function setAppearance(value: Appearance) {
  current = value;
  try {
    if (value === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, value);
  } catch {
    /* Storage can be unavailable; the choice still applies for this session. */
  }
  apply();
}
/** Applies the saved appearance and keeps it current. Call before the first render. */
export function installAppearance() {
  current = read();
  apply();
  const media = query();
  const systemChanged = () => {
    if (current === "system") apply();
  };
  const storageChanged = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    current = read();
    apply();
  };
  media?.addEventListener("change", systemChanged);
  window.addEventListener("storage", storageChanged);
  return () => {
    media?.removeEventListener("change", systemChanged);
    window.removeEventListener("storage", storageChanged);
  };
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
const snapshot = () => `${current}:${resolveScheme(current)}`;
export function useAppearance() {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot);
  const [appearance, scheme] = value.split(":") as [Appearance, Scheme];
  return { appearance, scheme, setAppearance };
}
