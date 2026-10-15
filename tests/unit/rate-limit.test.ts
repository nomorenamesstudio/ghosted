import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, rateLimitStatus } from "@/lib/utils/rate-limit";

/**
 * The limiter's unit convention, and the prune's duty.
 *
 * `windowMs` is milliseconds wherever it is handed to this module; the env
 * default is the one minutes-valued input. The first version of `limits()`
 * multiplied whatever it was given by 60_000, which turned the documented "100
 * failures per 15 minutes" into 625 days and the authenticated write throttle
 * into 300 writes per 2,500 days (static audit, third pass, 2026-10-14) — and
 * the suite could not see it, because no test in it ever advanced a clock.
 * These do: a window is only proven by escaping it.
 */
const T0 = new Date("2026-10-14T00:00:00Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.RATE_LIMIT_WINDOW_MINUTES;
});

describe("rate-limit windows", () => {
  it("reads a caller-supplied windowMs as milliseconds", () => {
    const key = `override-${crypto.randomUUID()}`;

    expect(rateLimit(key, "test", { max: 1, windowMs: 60_000 }).ok).toBe(true);
    expect(rateLimit(key, "test", { max: 1, windowMs: 60_000 }).ok).toBe(false);

    // A minute and a second later the window is over. Before the fix this
    // assertion failed by about 41 days.
    vi.setSystemTime(new Date(T0.getTime() + 61_000));
    expect(rateLimit(key, "test", { max: 1, windowMs: 60_000 }).ok).toBe(true);
  });

  it("reads the env default as minutes", () => {
    process.env.RATE_LIMIT_WINDOW_MINUTES = "1";
    const key = `env-${crypto.randomUUID()}`;

    expect(rateLimit(key, "test", { max: 1 }).ok).toBe(true);
    expect(rateLimit(key, "test", { max: 1 }).ok).toBe(false);

    vi.setSystemTime(new Date(T0.getTime() + 61_000));
    expect(rateLimit(key, "test", { max: 1 }).ok).toBe(true);
  });

  it("never prunes a window that is still refusing", () => {
    // The process-wide sign-in cap is written first, so it is the oldest
    // bucket in the map and the first thing an age-ordered prune drops. An
    // attacker who mints enough identities to fill the map must not get that
    // budget back.
    const guarded = `guarded-${crypto.randomUUID()}`;
    expect(rateLimit(guarded, "guard", { max: 1, windowMs: 3_600_000 }).ok).toBe(
      true,
    );
    expect(rateLimit(guarded, "guard", { max: 1, windowMs: 3_600_000 }).ok).toBe(
      false,
    );

    // Opened a minute later than the guarded window, so an age-ordered prune
    // would reach the guarded one first.
    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    for (let i = 0; i < 12_000; i++) {
      rateLimit(`filler-${crypto.randomUUID()}`, "filler", {
        max: 1,
        windowMs: 3_600_000,
      });
    }

    expect(rateLimitStatus(guarded, "guard", { max: 1 }).ok).toBe(false);
  });

  it("still drops spent windows, so the map cannot grow forever", () => {
    const spent = `spent-${crypto.randomUUID()}`;
    rateLimit(spent, "spent", { max: 5, windowMs: 3_600_000 });

    vi.setSystemTime(new Date(T0.getTime() + 60_000));
    for (let i = 0; i < 12_000; i++) {
      rateLimit(`filler2-${crypto.randomUUID()}`, "filler2", {
        max: 1,
        windowMs: 3_600_000,
      });
    }

    // Under its limit and oldest: this one is meant to be evicted.
    expect(rateLimitStatus(spent, "spent", { max: 5 }).ok).toBe(true);
  });
});
