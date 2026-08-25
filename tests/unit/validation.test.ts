import { describe, it, expect } from "vitest";
import {
  changePasswordSchema,
  createApplicationSchema,
  updateApplicationSchema,
  createMilestoneSchema,
  updateMilestoneSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  listApplicationsQuerySchema,
} from "@/lib/utils/validation";

describe("createApplicationSchema", () => {
  it("accepts a valid payload", () => {
    const r = createApplicationSchema.safeParse({
      company: "Acme",
      role: "Engineer",
      url: "https://acme.example/jobs/1",
    });
    expect(r.success).toBe(true);
  });

  it("rejects missing company/role", () => {
    expect(createApplicationSchema.safeParse({ role: "X" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({ company: "X" }).success).toBe(false);
    expect(createApplicationSchema.safeParse({}).success).toBe(false);
  });

  it("rejects javascript: URLs", () => {
    const r = createApplicationSchema.safeParse({
      company: "Acme",
      role: "Engineer",
      url: "javascript:alert(1)",
    });
    expect(r.success).toBe(false);
  });

  it("rejects data: URLs", () => {
    const r = createApplicationSchema.safeParse({
      company: "Acme",
      role: "Engineer",
      url: "data:text/html,<script>alert(1)</script>",
    });
    expect(r.success).toBe(false);
  });

  it("rejects ftp: URLs", () => {
    const r = createApplicationSchema.safeParse({
      company: "Acme",
      role: "Engineer",
      url: "ftp://example.com",
    });
    expect(r.success).toBe(false);
  });

  it("allows null/absent optional url", () => {
    expect(
      createApplicationSchema.safeParse({ company: "A", role: "B", url: null })
        .success,
    ).toBe(true);
  });

  it("rejects oversized notes", () => {
    const r = createApplicationSchema.safeParse({
      company: "A",
      role: "B",
      notes: "x".repeat(10_001),
    });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid contact email", () => {
    const r = createApplicationSchema.safeParse({
      company: "A",
      role: "B",
      contactEmail: "not-an-email",
    });
    expect(r.success).toBe(false);
  });

  it("accepts valid contact fields", () => {
    const r = createApplicationSchema.safeParse({
      company: "A",
      role: "B",
      contactName: "Jane Doe",
      contactEmail: "jane@acme.example",
      contactPhone: "+1-555-0100",
    });
    expect(r.success).toBe(true);
  });
});

describe("updateApplicationSchema", () => {
  it("rejects an empty patch", () => {
    expect(updateApplicationSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial patch", () => {
    expect(updateApplicationSchema.safeParse({ status: "offer" }).success).toBe(true);
    expect(updateApplicationSchema.safeParse({ notes: "hi" }).success).toBe(true);
  });

  it("rejects an invalid status value", () => {
    expect(
      updateApplicationSchema.safeParse({ status: "not-a-status" }).success,
    ).toBe(false);
  });
});

describe("createMilestoneSchema", () => {
  it("accepts a valid payload with optional fields", () => {
    expect(
      createMilestoneSchema.safeParse({ title: "Phone call" }).success,
    ).toBe(true);
    expect(
      createMilestoneSchema.safeParse({
        title: "Phone call",
        position: 2,
        date: "2025-01-15T10:00:00.000Z",
        comment: "Went well",
      }).success,
    ).toBe(true);
  });

  it("rejects missing title", () => {
    expect(createMilestoneSchema.safeParse({}).success).toBe(false);
  });

  it("rejects negative position", () => {
    expect(
      createMilestoneSchema.safeParse({ title: "X", position: -1 }).success,
    ).toBe(false);
  });

  it("rejects invalid dates", () => {
    expect(
      createMilestoneSchema.safeParse({ title: "X", date: "not-a-date" }).success,
    ).toBe(false);
  });
});

describe("updateMilestoneSchema", () => {
  it("rejects empty patch and accepts valid ones", () => {
    expect(updateMilestoneSchema.safeParse({}).success).toBe(false);
    expect(updateMilestoneSchema.safeParse({ status: "done" }).success).toBe(true);
    expect(
      updateMilestoneSchema.safeParse({ title: "New", date: null }).success,
    ).toBe(true);
  });
});

describe("auth schemas", () => {
  it("loginSchema accepts valid and rejects short passwords", () => {
    expect(
      loginSchema.safeParse({ email: "a@b.dev", password: "x".repeat(8) }).success,
    ).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.dev", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "not-an-email", password: "x".repeat(8) }).success).toBe(false);
  });

  it("registerSchema enforces password length and name", () => {
    expect(
      registerSchema.safeParse({
        email: "a@b.dev",
        password: "short",
        name: "A",
      }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({
        email: "a@b.dev",
        password: "x".repeat(8),
        name: "",
      }).success,
    ).toBe(false);
  });

  it("resetPasswordSchema requires a token and a strong password", () => {
    expect(
      resetPasswordSchema.safeParse({ token: "t".repeat(20), password: "x".repeat(8) })
        .success,
    ).toBe(true);
    expect(
      resetPasswordSchema.safeParse({ token: "short", password: "x".repeat(8) })
        .success,
    ).toBe(false);
  });

  it("changePasswordSchema requires matching confirmation", () => {
    const base = {
      currentPassword: "current123",
      newPassword: "newpassword1",
    };
    expect(
      changePasswordSchema.safeParse({ ...base, confirmPassword: "newpassword1" })
        .success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ ...base, confirmPassword: "mismatch1" })
        .success,
    ).toBe(false);
  });
});

describe("listApplicationsQuerySchema", () => {
  it("coerces string page/limit into numbers with defaults", () => {
    const r = listApplicationsQuerySchema.safeParse({ page: "2", limit: "50" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(2);
      expect(r.data.limit).toBe(50);
    }
  });

  it("applies defaults for empty input", () => {
    const r = listApplicationsQuerySchema.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.page).toBe(1);
      expect(r.data.limit).toBe(20);
    }
  });

  it("rejects bad status and out-of-range limit", () => {
    expect(listApplicationsQuerySchema.safeParse({ status: "nope" }).success).toBe(false);
    expect(listApplicationsQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(listApplicationsQuerySchema.safeParse({ page: "0" }).success).toBe(false);
  });
});
