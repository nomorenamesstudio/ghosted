import { describe, expect, it } from "vitest";
import {
  oauthSignInDecision,
  type OAuthSignInOutcome,
} from "@/lib/services/oauth-accounts";

/**
 * The sign-in gate: who is allowed in on a provider sign-in. It is the only
 * thing standing between `ALLOW_REGISTRATION=false` and a stranger walking into
 * a private instance through the LinkedIn button, so each outcome is pinned.
 */
describe("oauthSignInDecision", () => {
  const outcomes: OAuthSignInOutcome[] = [
    { kind: "linked", userId: "user-1" },
    { kind: "attach", userId: "user-1" },
    { kind: "adopt", userId: "user-1" },
    { kind: "create", email: "new@test.dev" },
    { kind: "no-email" },
  ];

  it("always lets an existing account in, however it is signed into", () => {
    for (const outcome of outcomes.filter((o) => o.kind !== "create" && o.kind !== "no-email")) {
      expect(
        oauthSignInDecision(outcome, { registrationOpen: false }),
        `${outcome.kind} must sign in even with registration closed`,
      ).toBe("allow");
    }
  });

  it("treats a new account as registration, not as a sign-in", () => {
    const outcome: OAuthSignInOutcome = { kind: "create", email: "new@test.dev" };
    expect(oauthSignInDecision(outcome, { registrationOpen: true })).toBe("allow");
    expect(oauthSignInDecision(outcome, { registrationOpen: false })).toBe(
      "deny-new-account",
    );
  });

  it("refuses a provider that shared no email, open instance or not", () => {
    const outcome: OAuthSignInOutcome = { kind: "no-email" };
    expect(oauthSignInDecision(outcome, { registrationOpen: true })).toBe(
      "email-required",
    );
    expect(oauthSignInDecision(outcome, { registrationOpen: false })).toBe(
      "email-required",
    );
  });
});
