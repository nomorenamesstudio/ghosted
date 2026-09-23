"use client";

import { ThemeProvider } from "@/components/theme-provider";

/**
 * The only provider that has to wrap every route: the theme is applied to
 * `<html>` before first paint by an inline script in the root layout, and the
 * settings page later needs the context to change it. Everything else — session,
 * query cache — lives in `AppProviders`, mounted per route group, so pages that
 * have no session and no queries do not ship that runtime at all.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
