import { beforeEach, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { SESSION_ABSOLUTE_SECONDS, authConfig } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { passwordResetTokens, users } from "@/lib/db/schema";
import {
  changePassword,
  deleteAccount,
  setPassword,
} from "@/lib/services/account";
import { resolveOAuthUser } from "@/lib/services/oauth-accounts";
import { POST as RESET_PASSWORD } from "@/app/api/auth/reset-password/route";
import { createUser, jsonRequest, resetDb } from "@/tests/helpers";

/**
 * Session revocation on a credential change.
 *
 * The 2026-10-14 pentest found the gap: two live sessions for one account, one
 * changes the password, the other kept answering `200` on
 * `GET /api/applications`. Root cause was the JWT strategy with nothing to
 * revoke — a token stayed valid until the 7-day absolute cap. The fix is the
 * `session_epoch` column, compared in the `jwt` callback, so these tests drive
 * that callback rather than the column: what matters is whether a token that
 * was already issued still resolves to a session.
 *
 * `account` is deliberately left undefined in the sign-in call. A credentials
 * sign-in would make the callback probe Gravatar, and that is a network call a
 * unit of this kind should not be waiting on.
 */
type JwtCallback = (params: Record<string, unknown>) => Promise<unknown>;

function jwtCallback(): JwtCallback {
  const callback = authConfig.callbacks?.jwt as unknown as JwtCallback;
  if (!callback) throw new Error("no jwt callback");
  return callback;
}

/** A token as the callback would issue it at sign-in. */
async function signIn(userId: string, email: string) {
  return (await jwtCallback()({
    token: { sub: userId, email },
    user: { id: userId, email },
  })) as Record<string, unknown> | null;
}

/** The same token as the callback sees it on the next request. */
async function resolve(token: Record<string, unknown> | null) {
  if (!token) throw new Error("no token to resolve");
  return (await jwtCallback()({ token })) as Record<string, unknown> | null;
}

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

beforeEach(async () => {
  await resetDb();
});

describe("jwt callback session revocation", () => {
  it("keeps a session that has not been revoked", async () => {
    const user = await createUser("steady@test.dev");
    const token = await signIn(user.id, user.email);

    expect(token?.sessionEpoch).toBe(0);
    expect(await resolve(token)).not.toBeNull();
  });

  it("mirrors the account on an update, ignoring what the client claimed", async () => {
    // The `update` trigger is client-supplied, and it used to write `name`,
    // `email` and `emailVerified` straight into the token — so a session could
    // assert anything about itself. Every one of those claims now comes from the
    // row the client cannot edit.
    // Unverified in the row, so a payload claiming `emailVerified: true` is
    // distinguishable from the truth.
    const user = await createUser("claims@test.dev", "Real Name", "password123", {
      emailVerified: false,
    });
    const token = await signIn(user.id, user.email);

    const updated = (await jwtCallback()({
      token,
      trigger: "update",
      session: {
        name: "Spoofed Name",
        email: "attacker@example.dev",
        emailVerified: true,
      },
    })) as Record<string, unknown>;

    expect(updated.name).toBe("Real Name");
    expect(updated.email).toBe("claims@test.dev");
    expect(updated.emailVerified).toBe(false);
  });

  it("refuses a session issued before a password change", async () => {
    const user = await createUser("rotates@test.dev");
    const token = await signIn(user.id, user.email);

    await changePassword(user.id, user.password, "a-new-password-1");

    expect(await resolve(token)).toBeNull();
  });

  it("refuses a session issued before a password reset", async () => {
    const user = await createUser("resets@test.dev");
    const token = await signIn(user.id, user.email);

    // The reset flow, end to end: a token issued by the request path, then the
    // route the emailed link posts to.
    const raw = randomBytes(32).toString("hex");
    await db.insert(passwordResetTokens).values({
      userId: user.id,
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const res = await RESET_PASSWORD(
      jsonRequest("http://localhost/api/auth/reset-password", "POST", {
        token: raw,
        password: "after-the-reset-1",
      }),
    );
    expect(res.status).toBe(200);

    expect(await resolve(token)).toBeNull();
  });

  it("refuses a session issued before the first password is set", async () => {
    // A provider-only account: setting a password adds a way in, and the
    // sessions that predate it re-authenticate.
    const user = await createUser("provider-only@test.dev");
    await db
      .update(users)
      .set({ passwordHash: null, provider: "google" })
      .where(eq(users.id, user.id));
    const token = await signIn(user.id, user.email);

    await setPassword(user.id, "first-password-1");

    expect(await resolve(token)).toBeNull();
  });

  it("refuses a session issued before a provider sign-in dropped the password", async () => {
    // The adopt rule: an unverified account is taken over by a verified
    // provider email and its password is cleared. A session that authenticated
    // with that password must not survive the event.
    const squatted = await createUser(
      "squatted@test.dev",
      "Whoever Typed It",
      "password123",
      { emailVerified: false },
    );
    const token = await signIn(squatted.id, squatted.email);

    const { adopted } = await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-revocation",
      email: "squatted@test.dev",
      name: "Real Owner",
    });
    expect(adopted).toBe(true);

    expect(await resolve(token)).toBeNull();
  });

  it("refuses every session once the account is deleted", async () => {
    const user = await createUser("deleted@test.dev");
    const token = await signIn(user.id, user.email);

    await deleteAccount(user.id);

    expect(await resolve(token)).toBeNull();
  });

  it("keeps a pre-revocation token working until something is changed", async () => {
    // Tokens minted before the claim existed (a deploy, not a compromise). With
    // nothing revoked yet they keep working and are pinned from here on…
    const user = await createUser("upgraded@test.dev");
    const legacy = { sub: user.id, email: user.email };

    const pinned = await resolve({ ...legacy });
    expect(pinned).not.toBeNull();
    expect(pinned?.sessionEpoch).toBe(0);

    // …and the next credential change ends them, which is the whole point.
    await changePassword(user.id, user.password, "after-the-upgrade-1");
    expect(await resolve({ ...legacy })).toBeNull();
  });

  it("refuses a session whose credential changed while it was being minted", async () => {
    // The race a static audit found in the first version of this: authorize
    // reads the counter, then the jwt callback awaits a Gravatar lookup and
    // re-read the row, so a password change committing in that window was
    // absorbed by the token it should have evicted. The pin now comes from the
    // value authorize observed — here, the pre-change 0 while the row says 1.
    const user = await createUser("racy@test.dev");
    await changePassword(user.id, user.password, "changed-mid-sign-in-1");

    const raced = await jwtCallback()({
      token: { sub: user.id, email: user.email },
      user: { id: user.id, email: user.email, sessionEpoch: 0 },
    });
    expect(raced).toBeNull();
  });

  it("still lets the OAuth adoption pin its own new session", async () => {
    // The same branch is correct for the provider path, which must keep it:
    // adoption bumps the counter *during* the sign-in callback, so the session
    // that just proved the provider identity has to be pinned to the value
    // after the bump, not refused by it.
    const squatted = await createUser(
      "squatted@test.dev",
      "Whoever Typed It",
      "password123",
      { emailVerified: false },
    );
    const { userId } = await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-adopt-pin",
      email: "squatted@test.dev",
      name: "Real Owner",
    });

    const token = (await jwtCallback()({
      token: { sub: userId },
      user: { id: userId, email: "squatted@test.dev" },
      account: { provider: "google", providerAccountId: "google-sub-adopt-pin" },
    })) as Record<string, unknown> | null;

    expect(token).not.toBeNull();
    expect(token?.sessionEpoch).toBe(1);
  });

  it("stamps the absolute cap on a token that arrives without one", async () => {
    // A session minted before the `authTime` claim shipped had no absolute
    // bound at all: encode() re-signs it with a fresh 30-day window on every
    // use, so an actively used pre-upgrade cookie never expired (static audit
    // 2026-10-14). It gets the claim on first read, and seven days from then.
    const user = await createUser("legacy@test.dev");
    const token = (await resolve({ sub: user.id, email: user.email })) as Record<
      string,
      unknown
    > | null;

    expect(token).not.toBeNull();
    expect(typeof token?.authTime).toBe("number");
  });

  it("refuses a token whose absolute cap has passed", async () => {
    const user = await createUser("expired@test.dev");
    const old = Math.floor(Date.now() / 1000) - SESSION_ABSOLUTE_SECONDS - 1;

    expect(
      await resolve({ sub: user.id, email: user.email, authTime: old }),
    ).toBeNull();
  });
});
