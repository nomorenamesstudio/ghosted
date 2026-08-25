import { describe, it, expect } from "vitest";
import {
  dismissBanner,
  DONATE_HIDE_MS,
  DONATE_MAX_DISMISSALS,
  shouldShowBanner,
} from "@/lib/utils/donate-banner";

const now = 1_700_000_000_000;

describe("shouldShowBanner", () => {
  it("never shows without at least one offer", () => {
    expect(shouldShowBanner(null, false, now)).toBe(false);
    expect(shouldShowBanner({ count: 0, hiddenUntil: null }, false, now)).toBe(
      false,
    );
  });

  it("shows for a user with offers and no prior state", () => {
    expect(shouldShowBanner(null, true, now)).toBe(true);
    expect(shouldShowBanner({ count: 0, hiddenUntil: null }, true, now)).toBe(
      true,
    );
  });

  it("hides for a week after dismissal", () => {
    const state = dismissBanner(null, now);
    expect(shouldShowBanner(state, true, now + 1000)).toBe(false);
    expect(shouldShowBanner(state, true, now + DONATE_HIDE_MS - 1)).toBe(false);
  });

  it("reappears after the week passes", () => {
    const state = dismissBanner(null, now);
    expect(shouldShowBanner(state, true, now + DONATE_HIDE_MS + 1)).toBe(true);
  });

  it("never shows again after 3 dismissals", () => {
    let state = null;
    for (let i = 0; i < DONATE_MAX_DISMISSALS; i++) {
      state = dismissBanner(state, now + i * DONATE_HIDE_MS);
    }
    // Even long after the hidden period has passed.
    expect(state!.count).toBe(DONATE_MAX_DISMISSALS);
    expect(
      shouldShowBanner(state, true, now + 100 * DONATE_HIDE_MS),
    ).toBe(false);
  });
});

describe("dismissBanner", () => {
  it("increments the count and sets the hidden window", () => {
    const one = dismissBanner(null, now);
    expect(one.count).toBe(1);
    expect(one.hiddenUntil).toBe(now + DONATE_HIDE_MS);

    const two = dismissBanner(one, now + 1000);
    expect(two.count).toBe(2);
    expect(two.hiddenUntil).toBe(now + 1000 + DONATE_HIDE_MS);
  });
});
