import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_OWNER_AVATAR,
  DEFAULT_OWNER_NAME,
  ensureOwnerAccount,
} from "@/scripts/ensure-owner.mjs";
import { createRawClient } from "@/lib/db/client";
import { resetDb } from "@/tests/helpers";

/**
 * The boot step is the only way into a closed-registration instance, so the two
 * things that must never happen are pinned here at the real database boundary:
 * a second boot resetting a password the owner already changed, and a boot that
 * creates an account with no way to sign in.
 */
const OWNER_EMAIL = "owner@selfhost.test";

let sql: ReturnType<typeof createRawClient>;

beforeEach(async () => {
  await resetDb();
  sql = createRawClient();
});

afterEach(async () => {
  await sql.end();
});

const run = (env: Record<string, string | undefined>, hash?: () => Promise<string>) =>
  ensureOwnerAccount({
    sql,
    env,
    log: () => {},
    hash: hash ?? (async () => "first-hash"),
  });

describe("ensureOwnerAccount", () => {
  it("creates the owner with the mascot's name, the alt-icon avatar and a verified email", async () => {
    const result = await run({
      ALLOW_REGISTRATION: "false",
      GHOSTED_USER_EMAIL: OWNER_EMAIL,
    });
    expect(result.action).toBe("created");

    const [row] = await sql`
      SELECT email, name, image, provider, email_verified FROM users WHERE email = ${OWNER_EMAIL}
    `;
    expect(row).toMatchObject({
      email: OWNER_EMAIL,
      name: DEFAULT_OWNER_NAME,
      image: DEFAULT_OWNER_AVATAR,
      provider: "email",
      email_verified: true,
    });
  });

  it("never touches an account that already exists", async () => {
    await run({ ALLOW_REGISTRATION: "false", GHOSTED_USER_EMAIL: OWNER_EMAIL });

    // A later boot — with a different generated password — must not overwrite.
    const second = await run(
      { ALLOW_REGISTRATION: "false", GHOSTED_USER_EMAIL: OWNER_EMAIL },
      async () => "second-hash",
    );
    expect(second).toMatchObject({ action: "skipped", reason: "exists" });

    const [row] = await sql`
      SELECT password_hash FROM users WHERE email = ${OWNER_EMAIL}
    `;
    expect(row.password_hash).toBe("first-hash");
  });

  it("does nothing while registration is open", async () => {
    const result = await run({ ALLOW_REGISTRATION: "true", GHOSTED_USER_EMAIL: OWNER_EMAIL });
    expect(result).toMatchObject({ action: "skipped", reason: "registration-open" });

    const rows = await sql`SELECT id FROM users`;
    expect(rows).toHaveLength(0);
  });

  it("refuses a closed instance with no owner address, rather than booting a dead end", async () => {
    await expect(run({ ALLOW_REGISTRATION: "false" })).rejects.toThrow(
      /needs GHOSTED_USER_EMAIL/,
    );
  });

  it("marks a generated password as needing a change, and a supplied one as final", async () => {
    // The generated password is in the container log; the supplied one is the
    // operator's own choice. Only the first must be replaced at first sign-in.
    await run({
      ALLOW_REGISTRATION: "false",
      GHOSTED_USER_EMAIL: OWNER_EMAIL,
    });
    const [generated] = await sql`
      SELECT must_change_password FROM users WHERE email = ${OWNER_EMAIL}
    `;
    expect(generated.must_change_password).toBe(true);

    await sql`DELETE FROM users WHERE email = ${OWNER_EMAIL}`;
    await run({
      ALLOW_REGISTRATION: "false",
      GHOSTED_USER_EMAIL: OWNER_EMAIL,
      GHOSTED_USER_PASSWORD: "chosen-by-the-operator",
    });
    const [supplied] = await sql`
      SELECT must_change_password FROM users WHERE email = ${OWNER_EMAIL}
    `;
    expect(supplied.must_change_password).toBe(false);
  });

  it("takes the password from the environment when one is supplied", async () => {
    const result = await run({
      ALLOW_REGISTRATION: "false",
      GHOSTED_USER_EMAIL: OWNER_EMAIL,
      GHOSTED_USER_PASSWORD: "supplied-by-the-operator",
    });
    expect(result).toMatchObject({ action: "created", generatedPassword: false });
  });
});
