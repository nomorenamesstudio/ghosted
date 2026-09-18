import { describe, it, expect } from "vitest";
import {
  deriveStatus,
  displayStatusOf,
  isGhosted,
  isStepBack,
  stepBackKind,
  MANUAL_STATUSES,
  BOARD_ORDER,
  STATUS_ORDER,
  PATIENCE_DAYS,
  PATIENCE_LABELS,
  PATIENCE_LEVELS,
  DEFAULT_PATIENCE_LEVEL,
  ghostedAfterDays,
} from "@/lib/utils/status";
import type { Milestone } from "@/lib/db/schema";

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

describe("isGhosted / displayStatusOf", () => {
  const now = Date.now();
  const daysAgo = (d: number) => new Date(now - d * 24 * 60 * 60 * 1000);

  it("true for applied apps untouched for 14+ days", () => {
    expect(isGhosted("applied", daysAgo(15))).toBe(true);
    expect(isGhosted("applied", daysAgo(14))).toBe(true);
  });

  it("true for interviewing apps untouched for 14+ days", () => {
    expect(isGhosted("interviewing", daysAgo(20))).toBe(true);
  });

  it("false for recently updated apps", () => {
    expect(isGhosted("applied", daysAgo(1))).toBe(false);
    expect(isGhosted("interviewing", new Date())).toBe(false);
  });

  it("false just under the threshold", () => {
    // One minute inside the default threshold (realistic, 10 days).
    const days = PATIENCE_DAYS[DEFAULT_PATIENCE_LEVEL];
    const justUnder = new Date(now - days * 24 * 60 * 60 * 1000 + 60_000);
    expect(isGhosted("applied", justUnder)).toBe(false);
  });

  it("false for offer/rejected/archived regardless of age", () => {
    expect(isGhosted("offer", daysAgo(30))).toBe(false);
    expect(isGhosted("rejected", daysAgo(30))).toBe(false);
    expect(isGhosted("archived", daysAgo(30))).toBe(false);
  });

  it("displayStatusOf overlays ghosted only when stale", () => {
    expect(displayStatusOf("applied", daysAgo(15))).toBe("ghosted");
    expect(displayStatusOf("interviewing", daysAgo(15))).toBe("ghosted");
    expect(displayStatusOf("applied", daysAgo(1))).toBe("applied");
    expect(displayStatusOf("offer", daysAgo(15))).toBe("offer");
    expect(displayStatusOf("rejected", daysAgo(15))).toBe("rejected");
  });
});

describe("MANUAL_STATUSES", () => {
  it("holds the states a user owns, ghosted included", () => {
    // Ghosted is both: filed by hand here, and shown by the clock for silent
    // applied/interviewing applications.
    expect(MANUAL_STATUSES).toEqual([
      "rejected",
      "archived",
      "offer",
      "ghosted",
    ]);
  });

  it("does not re-derive a hand-set ghosted application", () => {
    const milestones = [
      { status: "done" as const },
      { status: "pending" as const },
    ] as Milestone[];
    expect(deriveStatus("ghosted", milestones)).toBe("ghosted");
    expect(displayStatusOf("ghosted", new Date())).toBe("ghosted");
  });
});

describe("column orders", () => {
  it("runs the board in pipeline order and the list by importance", () => {
    expect(BOARD_ORDER).toEqual([
      "applied",
      "interviewing",
      "offer",
      "ghosted",
      "rejected",
      "archived",
    ]);
    // The list keeps offers at the top - same statuses, different reading.
    expect(STATUS_ORDER[0]).toBe("offer");
    expect([...STATUS_ORDER].sort()).toEqual([...BOARD_ORDER].sort());
  });
});

describe("isStepBack", () => {
  it("spots a move against the pipeline", () => {
    expect(isStepBack("offer", "interviewing")).toBe(true);
    expect(isStepBack("offer", "applied")).toBe(true);
    expect(isStepBack("interviewing", "applied")).toBe(true);
  });

  it("lets ordinary progress through", () => {
    expect(isStepBack("applied", "interviewing")).toBe(false);
    expect(isStepBack("applied", "offer")).toBe(false);
    expect(isStepBack("interviewing", "offer")).toBe(false);
    expect(isStepBack("interviewing", "interviewing")).toBe(false);
  });

  it("does not treat leaving an outcome as a step back", () => {
    // Un-ghosting or reopening an archived application is progress, not a
    // regression - no extra step should be demanded for it.
    expect(isStepBack("ghosted", "applied")).toBe(false);
    expect(isStepBack("archived", "interviewing")).toBe(false);
    expect(isStepBack("rejected", "offer")).toBe(false);
  });

  it("does not treat filing away as a step back", () => {
    expect(isStepBack("offer", "rejected")).toBe(false);
    expect(isStepBack("offer", "archived")).toBe(false);
  });
});

describe("stepBackKind", () => {
  it("asks to add a step when coming back from Offers", () => {
    expect(stepBackKind("offer", "interviewing")).toBe("add-step");
    expect(stepBackKind("offer", "applied")).toBe("add-step");
  });

  it("asks to reset the timeline when an application starts over", () => {
    expect(stepBackKind("interviewing", "applied")).toBe("reset");
  });

  it("asks nothing for progress, outcomes or the same status", () => {
    expect(stepBackKind("applied", "interviewing")).toBeNull();
    expect(stepBackKind("applied", "offer")).toBeNull();
    expect(stepBackKind("interviewing", "offer")).toBeNull();
    expect(stepBackKind("interviewing", "interviewing")).toBeNull();
    expect(stepBackKind("offer", "rejected")).toBeNull();
    expect(stepBackKind("offer", "archived")).toBeNull();
    expect(stepBackKind("ghosted", "applied")).toBeNull();
    expect(stepBackKind("archived", "interviewing")).toBeNull();
    expect(stepBackKind("rejected", "offer")).toBeNull();
  });
});

describe("patience level", () => {
  it("maps each level to its threshold", () => {
    expect(PATIENCE_DAYS.generous).toBe(14);
    expect(PATIENCE_DAYS.realistic).toBe(10);
    expect(PATIENCE_DAYS.impatient).toBe(7);
    expect(ghostedAfterDays("generous")).toBe(14);
    expect(ghostedAfterDays("realistic")).toBe(10);
    expect(ghostedAfterDays("impatient")).toBe(7);
  });

  it("defaults to realistic when nothing is set", () => {
    expect(DEFAULT_PATIENCE_LEVEL).toBe("realistic");
    expect(ghostedAfterDays(null)).toBe(10);
    expect(ghostedAfterDays(undefined)).toBe(10);
    expect(ghostedAfterDays()).toBe(10);
  });

  it("labels every level, with its day count", () => {
    for (const level of PATIENCE_LEVELS) {
      expect(PATIENCE_LABELS[level]).toContain(String(PATIENCE_DAYS[level]));
    }
  });

  it("moves the ghosted line with the level", () => {
    const nineDaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000);
    const twelveDaysAgo = new Date(Date.now() - 12 * 24 * 60 * 60 * 1000);

    // 9 days old: only the impatient user has given up on it.
    expect(isGhosted("applied", nineDaysAgo, ghostedAfterDays("impatient"))).toBe(true);
    expect(isGhosted("applied", nineDaysAgo, ghostedAfterDays("realistic"))).toBe(false);
    expect(isGhosted("applied", nineDaysAgo, ghostedAfterDays("generous"))).toBe(false);

    // 12 days old: generous still waits, realistic and impatient do not.
    expect(isGhosted("applied", twelveDaysAgo, ghostedAfterDays("generous"))).toBe(false);
    expect(isGhosted("applied", twelveDaysAgo, ghostedAfterDays("realistic"))).toBe(true);
    expect(
      displayStatusOf("interviewing", twelveDaysAgo, ghostedAfterDays("impatient")),
    ).toBe("ghosted");
  });
});
