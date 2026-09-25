"use client";

import { useEffect } from "react";

/**
 * The landing follows the operating system, not the theme someone picked inside
 * the app: it is the page strangers see first, and a stored "light" preference
 * should not stop it going dark for a visitor whose whole desktop is dark.
 *
 * The pre-paint script in the root layout already does this for the first paint
 * (it skips the stored value on `/`); this keeps it true while the page is open,
 * in case the OS switches at dusk.
 */
export function LandingThemeFollow() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = (dark: boolean) =>
      document.documentElement.classList.toggle("dark", dark);
    apply(query.matches);
    const onChange = (event: MediaQueryListEvent) => apply(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return null;
}
