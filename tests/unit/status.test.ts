import { describe, it, expect } from "vitest";
import { deriveStatus, isNeedsAction, MANUAL_STATUSES } from "@/lib/utils/status";

const m = (stepOrder: number, status: "pending" | "done" | "skipped") => ({
  stepOrder,
  status,
});

describe("deriveStatus", () => {
  it("stays applied with only the first step done", () => {
    expect(
      deriveStatus("applied", [m(0, "done"), m(1, "pending"), m(2, "pending")]),
    ).toBe("applied");
  });

  it("stays applied with nothing done", () => {
    expect(deriveStatus("applied", [m(0, "pending"), m(1, "pending")])).toBe(
      "applied",
    );
  });

  it("becomes interviewing once two milestones are done (order independent)", () => {
    // Done out of order — e.g. Technical Interview before HR Screen.
    expect(
      deriveStatus("applied", [
        m(2, "done"),
        m(0, "done"),
        m(1, "pending"),
        m(3, "pending"),
      ]),
    ).toBe("interviewing");
  });

  it("becomes interviewing with most steps done but not all", () => {
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

  it("becomes offer only when every milestone is done", () => {
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

  it("skipped steps do not count as done", () => {
    expect(
      deriveStatus("applied", [m(0, "done"), m(1, "skipped"), m(2, "skipped")]),
    ).toBe("applied");
    expect(
      deriveStatus("applied", [
        m(0, "done"),
        m(1, "done"),
        m(2, "skipped"),
        m(3, "skipped"),
      ]),
    ).toBe("interviewing");
  });

  it("a single-milestone timeline that is done counts as offer (all done)", () => {
    expect(deriveStatus("applied", [m(0, "done")])).toBe("offer");
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
