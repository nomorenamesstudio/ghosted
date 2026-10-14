import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authConfig } from "@/lib/auth";
import { accountThrottle } from "@/lib/auth/login-throttle";
import { createUser, resetDb } from "@/tests/helpers";

/**
 * The sign-in throttle, driven through the Credentials provider itself.
 *
 * That is the point of the test: the limit has to hold for the credential check
 * *wherever* it is reached from, and Auth.js reaches it from
 * `/api/auth/callback/credentials` without ever running `/api/auth/login`. The
 * 2026-10-14 pentest measured 20 consecutive failures through the callback
 * while the route was answering `429`, because both counters lived in the route.
 *
 * These calls pass no request and no headers at all, which is the strongest
 * form of the same statement: an attacker who controls `x-forwarded-for`
 * cannot control these counters.
 *
 * `RATE_LIMIT_MAX` is lowered for the whole file: the limit is read per call
 * (`limits()` in lib/utils/rate-limit.ts), and a boundary of three makes the
 * arithmetic in each test visible. An earlier version of this file left the
 * default and asserted only `toBeNull()`, which a wrong password and a refusal
 * both satisfy — it could not fail. Every case below asserts something that
 * distinguishes the two.
 */
type Authorize = (
  credentials: Record<string, unknown>,
  request?: Request,
) => Promise<unknown>;

/**
 * @auth/core keeps the caller's config under `options` (the provider object's
 * own `authorize` is a `() => null` stub), so the real function is one level
 * down.
 */
function credentialsAuthorize(): Authorize {
  const providers = authConfig.providers as Array<{
    id: string;
    options?: { authorize?: Authorize };
  }>;
  const provider = providers.find((p) => p.id === "credentials");
  if (!provider?.options?.authorize) throw new Error("no credentials provider");
  return provider.options.authorize;
}

async function attempt(email: string, password: string): Promise<unknown> {
  return credentialsAuthorize()({ email, password });
}

const previousMax = process.env.RATE_LIMIT_MAX;

beforeEach(async () => {
  await resetDb();
  process.env.RATE_LIMIT_MAX = "3";
});

afterEach(() => {
  if (previousMax === undefined) delete process.env.RATE_LIMIT_MAX;
  else process.env.RATE_LIMIT_MAX = previousMax;
});

describe("credentials authorize() throttle", () => {
  it("refuses the address once its failures reach the limit", async () => {
    const user = await createUser("throttled@test.dev");

    // Three guesses are allowed at this boundary; the fourth is refused.
    for (let i = 0; i < 3; i++) {
      expect(await attempt("throttled@test.dev", "wrong-password")).toBeNull();
    }
    expect(accountThrottle("throttled@test.dev").ok).toBe(true);
    expect(await attempt("throttled@test.dev", "wrong-password")).toBeNull();

    // The window is per account and header-independent, so the attempt that
    // would otherwise succeed is refused too — that is what makes guessing
    // bounded rather than merely slowed.
    expect(accountThrottle("throttled@test.dev").ok).toBe(false);
    expect(await attempt("throttled@test.dev", user.password)).toBeNull();
  });

  it("never spends an account's budget on its own successful sign-ins", async () => {
    // The regression a static audit caught the same day this shipped: the
    // counter was consumed before the password was proven, so six *correct*
    // sign-ins by one person ended with that person refused entry to their own
    // account. Nothing is counted now until a compare fails.
    const user = await createUser("busy@test.dev");

    for (let i = 0; i < 6; i++) {
      expect(await attempt("busy@test.dev", user.password)).toMatchObject({
        id: user.id,
      });
    }
    expect(accountThrottle("busy@test.dev").ok).toBe(true);
  });

  it("starts the account's window over after a successful sign-in", async () => {
    // Three failures fill the window, a correct password clears it, and the
    // next three failures are a fresh window. Without the clear the count would
    // be six, and the last sign-in below would be refused — which is what makes
    // this a test rather than a restatement.
    const user = await createUser("resets@test.dev");

    for (let i = 0; i < 3; i++) {
      await attempt("resets@test.dev", "wrong-password");
    }
    expect(await attempt("resets@test.dev", user.password)).toMatchObject({
      id: user.id,
    });
    expect(accountThrottle("resets@test.dev").ok).toBe(true);

    for (let i = 0; i < 3; i++) {
      await attempt("resets@test.dev", "wrong-password");
    }
    expect(await attempt("resets@test.dev", user.password)).toMatchObject({
      id: user.id,
    });
  });

  it("leaves other accounts alone", async () => {
    const other = await createUser("bystander@test.dev");
    await createUser("target@test.dev");

    for (let i = 0; i < 4; i++) {
      await attempt("target@test.dev", "wrong-password");
    }

    // The account-keyed counter must not become a lockout for everyone: the
    // same provider check, the same process, a different address.
    expect(await attempt("bystander@test.dev", other.password)).toMatchObject({
      id: other.id,
    });
  });

  it("normalizes the email before keying the account", async () => {
    const user = await createUser("mixed@test.dev");

    for (let i = 0; i < 4; i++) {
      await attempt("MIXED@test.dev", "wrong-password");
    }

    // Same account, different spelling: a per-account limit that a capital
    // letter walks around is not a limit.
    expect(accountThrottle("mixed@test.dev").ok).toBe(false);
    expect(await attempt("mixed@test.dev", user.password)).toBeNull();
  });
});
