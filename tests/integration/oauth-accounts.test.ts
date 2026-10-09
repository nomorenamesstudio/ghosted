import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { oauthAccounts, users } from "@/lib/db/schema";
import {
  OAuthEmailRequiredError,
  classifyOAuthSignIn,
  listLinkedAccounts,
  resolveOAuthUser,
} from "@/lib/services/oauth-accounts";
import { createUser, resetDb } from "@/tests/helpers";

/** Row counts, to prove the reading side of the gate writes nothing. */
async function rowCounts() {
  return {
    users: (await db.select().from(users)).length,
    identities: (await db.select().from(oauthAccounts)).length,
  };
}

/**
 * The OAuth linking rules, at the service boundary Auth.js calls into. The JWT
 * callback that used to hold them is not reachable from a test, which is why
 * they live here (see lib/auth.ts).
 */
describe("OAuth account linking", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("keeps every provider linked to one account", async () => {
    const first = await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-1",
      email: "same@test.dev",
      name: "Same Person",
    });
    const second = await resolveOAuthUser({
      provider: "linkedin",
      providerId: "linkedin-sub-1",
      email: "same@test.dev",
      name: "Same Person",
    });

    expect(second.userId).toBe(first.userId);
    expect(await listLinkedAccounts(first.userId)).toMatchObject([
      { provider: "google" },
      { provider: "linkedin" },
    ]);
  });

  it("leaves the origin provider describing how the account was created", async () => {
    const { userId } = await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-2",
      email: "origin@test.dev",
      name: "Origin",
    });
    await resolveOAuthUser({
      provider: "linkedin",
      providerId: "linkedin-sub-2",
      email: "origin@test.dev",
      name: "Origin",
    });

    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.provider).toBe("google");
    expect(row.providerId).toBe("google-sub-2");
  });

  it("adopts an unverified account and drops its password", async () => {
    const existing = await createUser(
      "squatted@test.dev",
      "Whoever Typed It",
      "password123",
      { emailVerified: false },
    );

    const { userId, adopted } = await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-3",
      email: "squatted@test.dev",
      name: "Real Owner",
    });

    expect(userId).toBe(existing.id);
    expect(adopted).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.emailVerified).toBe(true);
    expect(row.passwordHash).toBeNull();
    // The dashboard tells them once; dismissing it clears this.
    expect(row.passwordDroppedAt).not.toBeNull();
  });

  it("does not claim a password was dropped when it was not", async () => {
    const verified = await createUser("untouched@test.dev", "Verified");
    const { userId: linkedId } = await resolveOAuthUser({
      provider: "linkedin",
      providerId: "linkedin-sub-11",
      email: verified.email,
      name: verified.name,
    });
    const { userId: createdId } = await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-11",
      email: "brand-new@test.dev",
      name: "Brand New",
    });

    const rows = await db.select().from(users);
    for (const id of [linkedId, createdId]) {
      expect(rows.find((r) => r.id === id)?.passwordDroppedAt).toBeNull();
    }
  });

  it("keeps the password of an account that already proved its email", async () => {
    const existing = await createUser("verified@test.dev", "Verified");

    const { userId, linked, adopted } = await resolveOAuthUser({
      provider: "linkedin",
      providerId: "linkedin-sub-4",
      email: "verified@test.dev",
      name: "Verified",
    });

    expect(userId).toBe(existing.id);
    expect(linked).toBe(true);
    expect(adopted).toBe(false);
    const [row] = await db.select().from(users).where(eq(users.id, userId));
    expect(row.passwordHash).not.toBeNull();
  });

  it("creates the account once for a provider that shares an email", async () => {
    const first = await resolveOAuthUser({
      provider: "linkedin",
      providerId: "linkedin-sub-5",
      email: "new@test.dev",
      name: "New Person",
    });
    expect(first).toMatchObject({ created: true, linked: true });

    const again = await resolveOAuthUser({
      provider: "linkedin",
      providerId: "linkedin-sub-5",
      email: "new@test.dev",
      name: "New Person",
    });
    expect(again).toMatchObject({ userId: first.userId, created: false });

    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, "new@test.dev"));
    expect(row.provider).toBe("linkedin");
    const identities = await db
      .select()
      .from(oauthAccounts)
      .where(eq(oauthAccounts.userId, first.userId));
    expect(identities).toHaveLength(1);
  });

  it("classifies every sign-in the gate has to judge, without writing", async () => {
    const verified = await createUser("known@test.dev", "Known");
    const unverified = await createUser(
      "unverified@test.dev",
      "Unverified",
      "password123",
      { emailVerified: false },
    );
    await resolveOAuthUser({
      provider: "google",
      providerId: "google-sub-6",
      email: verified.email,
      name: verified.name,
    });
    const before = await rowCounts();

    await expect(
      classifyOAuthSignIn({
        provider: "google",
        providerId: "google-sub-6",
        email: verified.email,
      }),
    ).resolves.toEqual({ kind: "linked", userId: verified.id });
    await expect(
      classifyOAuthSignIn({
        provider: "linkedin",
        providerId: "linkedin-sub-6",
        email: verified.email,
      }),
    ).resolves.toEqual({ kind: "attach", userId: verified.id });
    await expect(
      classifyOAuthSignIn({
        provider: "linkedin",
        providerId: "linkedin-sub-7",
        email: unverified.email,
      }),
    ).resolves.toEqual({ kind: "adopt", userId: unverified.id });
    // Normalized on the way in: the email column is unique and case-sensitive,
    // so " Stranger@Test.dev " must not become a second account.
    await expect(
      classifyOAuthSignIn({
        provider: "linkedin",
        providerId: "linkedin-sub-8",
        email: " Stranger@Test.dev ",
      }),
    ).resolves.toEqual({ kind: "create", email: "stranger@test.dev" });
    await expect(
      classifyOAuthSignIn({
        provider: "linkedin",
        providerId: "linkedin-sub-9",
        email: null,
      }),
    ).resolves.toEqual({ kind: "no-email" });

    expect(await rowCounts()).toEqual(before);
  });

  it("refuses to invent an address for a provider that shared none", async () => {
    await expect(
      resolveOAuthUser({
        provider: "google",
        providerId: "google-sub-10",
        email: null,
        name: "No Mail",
      }),
    ).rejects.toThrow(OAuthEmailRequiredError);

    expect(await rowCounts()).toEqual({ users: 0, identities: 0 });
  });
});
