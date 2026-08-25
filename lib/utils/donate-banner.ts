/**
 * Donate-banner logic: shown above the stats once the user has at least one
 * offer. "Not now" hides it for a week; after 3 dismissals it never returns.
 * State lives in localStorage (per browser).
 */
export interface DonateState {
  count: number;
  hiddenUntil: number | null;
}

export const DONATE_STORAGE_KEY = "ghosted-donate-banner";
export const DONATE_MAX_DISMISSALS = 3;
export const DONATE_HIDE_MS = 7 * 24 * 60 * 60 * 1000; // one week

/** Where the donate button points (override via NEXT_PUBLIC_DONATE_URL). */
export const DONATE_URL =
  process.env.NEXT_PUBLIC_DONATE_URL ??
  "https://www.buymeacoffee.com/lostsignals";

export function shouldShowBanner(
  state: DonateState | null,
  hasOffers: boolean,
  now: number = Date.now(),
): boolean {
  if (!hasOffers) return false;
  if (!state) return true;
  if (state.count >= DONATE_MAX_DISMISSALS) return false;
  if (state.hiddenUntil !== null && now < state.hiddenUntil) return false;
  return true;
}

export function dismissBanner(
  state: DonateState | null,
  now: number = Date.now(),
): DonateState {
  return {
    count: (state?.count ?? 0) + 1,
    hiddenUntil: now + DONATE_HIDE_MS,
  };
}

export function readDonateState(): DonateState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DONATE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DonateState) : null;
  } catch {
    return null;
  }
}

export function writeDonateState(state: DonateState): void {
  try {
    localStorage.setItem(DONATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore storage errors */
  }
}
