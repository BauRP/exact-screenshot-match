import { useEffect, useSyncExternalStore } from "react";

type Theme = "dark" | "light";
const KEY = "sn.theme";
const listeners = new Set<() => void>();
let current: Theme = "dark";

function read(): Theme {
  if (typeof window === "undefined") return "dark";
  const v = window.localStorage.getItem(KEY);
  return v === "light" ? "light" : "dark";
}

function apply(theme: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function setTheme(theme: Theme) {
  current = theme;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, theme);
  }
  apply(theme);
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => "dark" as Theme,
  );
  return { theme, setTheme };
}

export function ThemeBoot() {
  useEffect(() => {
    current = read();
    apply(current);
    listeners.forEach((l) => l());
  }, []);
  return null;
}
