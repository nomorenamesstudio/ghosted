"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

/**
 * Appearance is a setting, not a mode to toggle: three choices, and `system` is
 * the default — the arrangement paddō settled on, because "follow my device" is
 * what people mean and a switch that only knows light and dark has to guess on
 * first paint.
 *
 * `theme` is what the user picked ("system" included). `resolvedTheme` is what it
 * currently means — the only value a component should branch on.
 */
export type Theme = "light" | "dark" | "system";

export const THEMES: Theme[] = ["system", "light", "dark"];

export const DEFAULT_THEME: Theme = "system";

const STORAGE_KEY = "ghosted-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}

interface ThemeContextValue {
  /** The setting: `system`, `light` or `dark`. */
  theme: Theme;
  /** What it resolves to right now. */
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches;
}

/**
 * The landing follows the device whatever is stored: it is the page strangers see
 * first, and a "dark" picked inside the app should not keep it dark for someone
 * whose desktop is light. The pre-paint script in the root layout applies the
 * same rule before first paint.
 */
function themeOnThisRoute(stored: Theme | null): Theme {
  return window.location.pathname === "/"
    ? DEFAULT_THEME
    : (stored ?? DEFAULT_THEME);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeValue] = useState<Theme>(DEFAULT_THEME);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const [hydrated, setHydrated] = useState(false);

  // Read the stored choice once; until this runs the page shows whatever the
  // pre-paint script in the root layout decided.
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial = themeOnThisRoute(isTheme(stored) ? stored : null);
    setThemeValue(initial);
    setResolvedTheme(
      initial === "system" ? (systemPrefersDark() ? "dark" : "light") : initial,
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  // Follow the device while the setting is "system" — and only then.
  useEffect(() => {
    if (!hydrated || theme !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (event: MediaQueryListEvent) =>
      setResolvedTheme(event.matches ? "dark" : "light");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [hydrated, theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeValue(next);
    setResolvedTheme(
      next === "system" ? (systemPrefersDark() ? "dark" : "light") : next,
    );
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
