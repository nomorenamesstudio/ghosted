import { describe, it, expect } from "vitest";
import {
  computeInsertShift,
  computeDeleteShift,
  sortByStepOrder,
  totalStepsAfterInsert,
  totalStepsAfterDelete,
  defaultMilestones,
  DEFAULT_MILESTONE_TITLES,
} from "@/lib/utils/reorder";

const ms = (id: string, stepOrder: number) => ({ id, stepOrder });

describe("computeInsertShift", () => {
  it("inserts at the start and shifts everything up", () => {
    const existing = [ms("a", 0), ms("b", 1), ms("c", 2)];
    const { shifts, newStepOrder } = computeInsertShift(existing, 0);
    expect(newStepOrder).toBe(0);
    expect(shifts).toEqual([
      { id: "a", stepOrder: 1 },
      { id: "b", stepOrder: 2 },
      { id: "c", stepOrder: 3 },
    ]);
  });

  it("inserts in the middle", () => {
    const existing = [ms("a", 0), ms("b", 1), ms("c", 2)];
    const { shifts, newStepOrder } = computeInsertShift(existing, 1);
    expect(newStepOrder).toBe(1);
    expect(shifts).toEqual([
      { id: "b", stepOrder: 2 },
      { id: "c", stepOrder: 3 },
    ]);
  });

  it("appends at the end (position === count)", () => {
    const existing = [ms("a", 0), ms("b", 1)];
    const { shifts, newStepOrder } = computeInsertShift(existing, 2);
    expect(newStepOrder).toBe(2);
    expect(shifts).toEqual([]);
  });

  it("clamps negative positions to 0", () => {
    const existing = [ms("a", 0)];
    const { newStepOrder } = computeInsertShift(existing, -5);
    expect(newStepOrder).toBe(0);
  });

  it("handles an empty timeline", () => {
    const { shifts, newStepOrder } = computeInsertShift([], 0);
    expect(shifts).toEqual([]);
    expect(newStepOrder).toBe(0);
  });
});

describe("computeDeleteShift", () => {
  it("removes the milestone and shifts the rest down", () => {
    const existing = [ms("a", 0), ms("b", 1), ms("c", 2)];
    const result = computeDeleteShift(existing, "b");
    expect(result).toEqual({ shifts: [{ id: "c", stepOrder: 1 }] });
  });

  it("deleting the first shifts all others down", () => {
    const existing = [ms("a", 0), ms("b", 1)];
    const result = computeDeleteShift(existing, "a");
    expect(result).toEqual({ shifts: [{ id: "b", stepOrder: 0 }] });
  });

  it("deleting the last shifts nothing", () => {
    const existing = [ms("a", 0), ms("b", 1)];
    const result = computeDeleteShift(existing, "b");
    expect(result).toEqual({ shifts: [] });
  });

  it("returns null when the milestone does not exist", () => {
    expect(computeDeleteShift([ms("a", 0)], "nope")).toBeNull();
  });
});

describe("sortByStepOrder", () => {
  it("sorts ascending without mutating the input", () => {
    const input = [ms("a", 2), ms("b", 0), ms("c", 1)];
    const sorted = sortByStepOrder(input);
    expect(sorted.map((m) => m.stepOrder)).toEqual([0, 1, 2]);
    expect(input.map((m) => m.stepOrder)).toEqual([2, 0, 1]);
  });
});

describe("total steps bookkeeping", () => {
  it("grows on insert and shrinks on delete (min 1)", () => {
    expect(totalStepsAfterInsert(5)).toBe(6);
    expect(totalStepsAfterInsert(0)).toBe(1);
    expect(totalStepsAfterDelete(5)).toBe(4);
    expect(totalStepsAfterDelete(1)).toBe(1);
  });
});

describe("defaultMilestones", () => {
  it("creates 5 milestones with the spec titles, step_order 0..4", () => {
    const appId = "00000000-0000-4000-8000-000000000000";
    const list = defaultMilestones(appId);
    expect(list).toHaveLength(5);
    expect(list.map((m) => m.title)).toEqual([
      "Application",
      "HR Screen",
      "Technical Interview",
      "Test/Homework",
      "Offer/Decision",
    ]);
    expect(list.map((m) => m.stepOrder)).toEqual([0, 1, 2, 3, 4]);
    expect(list.every((m) => m.applicationId === appId)).toBe(true);
    expect(DEFAULT_MILESTONE_TITLES).toHaveLength(5);
  });
});
