import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authConfig } from "@/lib/auth";
import { createUser, resetDb } from "@/tests/helpers";

/**
 * The process-wide failure cap.
 *
 * The per-IP counter cannot be trusted while `x-forwarded-for` arrives
 * unverified, so spraying one password across many accounts would otherwise be
 * unlimited — every account's own window starts fresh. This cap is what makes
 * "unlimited" false, and it only works if it refuses attempts *before* looking
 * at them, which is why it can also refuse a correct password for the rest of
 * the window. That cost is the contract this test pins.
 *
 * In its own file on purpose: the counters are in-process memory, and this test
 * needs a known starting state.
 */
function credentialsAuthorize() {
  // @auth/core hangs the caller's config off `options`; the provider's own
  // `authorize` is a `() => null` stub.
  const providers = authConfig.providers as Array<{
    id: string;
    options?: {
      authorize?: (
        credentials: Record<string, unknown>,
        request?: Request,
      ) => Promise<unknown>;
    };
  }>;
  const provider = providers.find((p) => p.id === "credentials");
  if (!provider?.options?.authorize) throw new Error("no credentials provider");
  return provider.options.authorize;
}

const previousMax = process.env.RATE_LIMIT_LOGIN_FAILURES_MAX;
const previousWindow = process.env.RATE_LIMIT_LOGIN_FAILURES_WINDOW_MINUTES;

beforeEach(async () => {
  await resetDb();
  process.env.RATE_LIMIT_LOGIN_FAILURES_MAX = "2";
  process.env.RATE_LIMIT_LOGIN_FAILURES_WINDOW_MINUTES = "1";
});

afterEach(() => {
  if (previousMax === undefined) delete process.env.RATE_LIMIT_LOGIN_FAILURES_MAX;
  else process.env.RATE_LIMIT_LOGIN_FAILURES_MAX = previousMax;
  if (previousWindow === undefined) {
    delete process.env.RATE_LIMIT_LOGIN_FAILURES_WINDOW_MINUTES;
  } else {
    process.env.RATE_LIMIT_LOGIN_FAILURES_WINDOW_MINUTES = previousWindow;
  }
});

describe("process-wide login failure cap", () => {
  it("refuses a correct password on an untouched account once the cap is hit", async () => {
    const victim = await createUser("spray-victim@test.dev");
    await createUser("spray-one@test.dev");
    await createUser("spray-two@test.dev");
    await createUser("spray-three@test.dev");

    const authorize = credentialsAuthorize();

    // One failure past the cap of two, spread across three addresses — the
    // shape of a password spray, where no single account counter ever fires.
    for (const email of [
      "spray-one@test.dev",
      "spray-two@test.dev",
      "spray-three@test.dev",
    ]) {
      expect(await authorize({ email, password: "guessed-password" })).toBeNull();
    }

    // A fourth account that has done nothing at all, with the right password:
    // refused, because the cap cannot know an attempt is good without doing the
    // work it exists to bound.
    expect(
      await authorize({ email: "spray-victim@test.dev", password: victim.password }),
    ).toBeNull();
  });
});
