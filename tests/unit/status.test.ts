import { describe, it, expect } from "vitest";
import { deriveStatus, isNeedsAction, MANUAL_STATUSES } from "@/lib/utils/status";

const m = (stepOrder: number, status: "pending" | "done" | "skipped") => ({
  stepOrder,
  status,
});

describe("deriveStatus", () => {
  it("stays applied with nothing meaningful done", () => {
    expect(
      deriveStatus("applied", [m(0, "done"), m(1, "pending"), m(2, "pending")]),
    ).toBe("applied");
  });

  it("becomes interviewing once a step_order >= 2 milestone is done", () => {
    expect(
      deriveStatus("applied", [
        m(0, "done"),
        m(1, "done"),
        m(2, "done"),
        m(3, "pending"),
      ]),
    ).toBe("interviewing");
  });

  it("becomes offer when the final milestone is done", () => {
    expect(
      deriveStatus("applied", [
        m(0, "done"),
        m(1, "done"),
        m(2, "done"),
        m(3, "done"),
        m(4, "done"),
      ]),
    ).toBe("offer");
  });

  it("offer requires the LAST milestone specifically", () => {
    // 4 of 5 done, last one pending → interviewing (not offer)
    expect(
      deriveStatus("applied", [
        m(0, "done"),
        m(1, "done"),
        m(2, "done"),
        m(3, "done"),
        m(4, "pending"),
      ]),
    ).toBe("interviewing");
  });

  it("handles an empty timeline as applied", () => {
    expect(deriveStatus("applied", [])).toBe("applied");
  });

  it("never overrides rejected", () => {
    expect(
      deriveStatus("rejected", [m(0, "done"), m(1, "done"), m(2, "done"), m(3, "done"), m(4, "done")]),
    ).toBe("rejected");
  });

  it("never overrides archived", () => {
    expect(
      deriveStatus("archived", [m(0, "done"), m(1, "done"), m(2, "done"), m(3, "done"), m(4, "done")]),
    ).toBe("archived");
  });

  it("skipped steps do not advance the status", () => {
    expect(
      deriveStatus("applied", [m(0, "done"), m(1, "skipped"), m(2, "skipped")]),
    ).toBe("applied");
  });
});

describe("isNeedsAction", () => {
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

  it("true for applied apps not updated in 7 days", () => {
    expect(isNeedsAction("applied", daysAgo(8))).toBe(true);
  });

  it("true for interviewing apps not updated in 7 days", () => {
    expect(isNeedsAction("interviewing", daysAgo(10))).toBe(true);
  });

  it("false for recently updated apps", () => {
    expect(isNeedsAction("applied", daysAgo(1))).toBe(false);
    expect(isNeedsAction("interviewing", new Date())).toBe(false);
  });

  it("true at the 7-day boundary and beyond", () => {
    expect(isNeedsAction("applied", daysAgo(7))).toBe(true);
    expect(isNeedsAction("applied", daysAgo(30))).toBe(true);
  });

  it("false for anything under 7 days", () => {
    // 7 days minus one minute → recent enough.
    const justUnder = new Date(now - 7 * 24 * 60 * 60 * 1000 + 60_000);
    expect(isNeedsAction("applied", justUnder)).toBe(false);
  });

  it("false for offer/rejected/archived regardless of age", () => {
    expect(isNeedsAction("offer", daysAgo(30))).toBe(false);
    expect(isNeedsAction("rejected", daysAgo(30))).toBe(false);
    expect(isNeedsAction("archived", daysAgo(30))).toBe(false);
  });
});

describe("MANUAL_STATUSES", () => {
  it("contains exactly rejected and archived", () => {
    expect(MANUAL_STATUSES).toEqual(["rejected", "archived"]);
  });
});
