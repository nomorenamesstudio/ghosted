import { describe, it, expect } from "vitest";
import { calcProgress, isValidProgress } from "@/lib/utils/progress";

function m(status: "pending" | "done" | "skipped") {
  return { status };
}

describe("calcProgress", () => {
  it("returns 100% for offer status regardless of milestones", () => {
    expect(
      calcProgress({ status: "offer", milestones: [m("pending")], totalSteps: 5 }),
    ).toBe(100);
  });

  it("returns 100% for rejected status", () => {
    expect(
      calcProgress({ status: "rejected", milestones: [], totalSteps: 5 }),
    ).toBe(100);
  });

  it("returns 0% with no milestones", () => {
    expect(
      calcProgress({ status: "applied", milestones: [], totalSteps: 5 }),
    ).toBe(0);
  });

  it("handles zero totalSteps without dividing by zero", () => {
    expect(
      calcProgress({ status: "applied", milestones: [], totalSteps: 0 }),
    ).toBe(0);
  });

  it("returns 0% when nothing is done", () => {
    const milestones = [m("pending"), m("pending"), m("pending"), m("pending"), m("pending")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 5 }),
    ).toBe(0);
  });

  it("returns 20% for 1 of 5 done (default first step)", () => {
    const milestones = [m("done"), m("pending"), m("pending"), m("pending"), m("pending")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 5 }),
    ).toBe(20);
  });

  it("returns 40% for 2 of 5 done", () => {
    const milestones = [m("done"), m("done"), m("pending"), m("pending"), m("pending")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 5 }),
    ).toBe(40);
  });

  it("returns 100% when all steps are done", () => {
    const milestones = [m("done"), m("done"), m("done"), m("done"), m("done")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 5 }),
    ).toBe(100);
  });

  it("caps done count at totalSteps", () => {
    // 3 done but timeline claims only 2 steps.
    const milestones = [m("done"), m("done"), m("done")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 2 }),
    ).toBe(100);
  });

  it("does not count skipped milestones as progress", () => {
    const milestones = [m("done"), m("skipped"), m("pending"), m("pending"), m("pending")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 5 }),
    ).toBe(20);
  });

  it("rounds to the nearest integer", () => {
    // 1 of 3 done → 33.33 → 33
    const milestones = [m("done"), m("pending"), m("pending")];
    expect(
      calcProgress({ status: "applied", milestones, totalSteps: 3 }),
    ).toBe(33);
  });
});

describe("isValidProgress", () => {
  it("accepts 0..100 and rejects out-of-range/NaN", () => {
    expect(isValidProgress(0)).toBe(true);
    expect(isValidProgress(100)).toBe(true);
    expect(isValidProgress(50)).toBe(true);
    expect(isValidProgress(-1)).toBe(false);
    expect(isValidProgress(101)).toBe(false);
    expect(isValidProgress(Number.NaN)).toBe(false);
  });
});
