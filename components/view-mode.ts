"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * Which view the dashboard is in — board or list.
 *
 * It lives in a module store rather than in a component because two places need
 * it now: the dashboard renders the view, and the user menu (a sibling in the
 * layout) switches it. A React context would do the same job from further up, but
 * this also has to set `data-view` on <html> for the shell-width rules and read the
 * stored choice after hydration, so one small store keeps the whole rule in one
 * file instead of spreading it across a provider and its consumers.
 *
 * "board" is the default, and the inline script in the root layout paints that
 * before first paint; `hydrateView` then applies the stored choice once, on the
 * client, so the server and client render the same thing first.
 */
export type ViewMode = "list" | "board";

const VIEW_KEY = "ghosted-view";

let current: ViewMode = "board";
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function paint(view: ViewMode): void {
  const root = document.documentElement;
  if (view === "board") {
    root.dataset.view = "board";
  } else {
    delete root.dataset.view;
  }
}

export function setViewMode(view: ViewMode): void {
  current = view;
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage off: the choice still holds for this session.
  }
  paint(view);
  emit();
}

/** Apply the stored choice once, after hydration. */
export function hydrateView(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEW_KEY);
  } catch {
    stored = null;
  }
  const next: ViewMode = stored === "list" ? "list" : "board";
  if (next === current) return;
  current = next;
  paint(next);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ViewMode {
  return current;
}

function getServerSnapshot(): ViewMode {
  return "board";
}

export function useViewMode(): {
  view: ViewMode;
  setView: (view: ViewMode) => void;
} {
  const view = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setView = useCallback((next: ViewMode) => setViewMode(next), []);
  return { view, setView };
}

/** One-time hydration for the shell, so a stored "list" applies after mount. */
export function useHydrateView(): void {
  useEffect(() => {
    hydrateView();
  }, []);
}
