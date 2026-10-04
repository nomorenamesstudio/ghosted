/**
 * Create the owner account on an instance whose registration is closed.
 *
 * A solo or family instance has nobody to register the first account, so the
 * container start creates it from the environment. Two rules make that safe:
 *
 * - The password is random and printed **once** in the boot log. A fixed demo
 *   credential is the one thing scanners try, and "change it after login" leaves
 *   a window; a generated one has no window at all. `GHOSTED_USER_PASSWORD`
 *   overrides it for scripted setups.
 * - An existing account is never touched, so restarts cannot reset a password
 *   somebody already changed.
 *
 * Plain `.mjs` on purpose: the runtime image prunes dev dependencies, so this
 * runs under bare Node with only `bcryptjs` and `postgres` (both production
 * dependencies) available.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

export const DEFAULT_OWNER_NAME = "Haunty";
/** The retired app icon, kept as the mascot's face (see public/haunty.png). */
export const DEFAULT_OWNER_AVATAR = "/haunty.png";
const BCRYPT_ROUNDS = 12;

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

/** Same reading as `lib/config/flags.ts`: empty counts as unset, typos throw. */
export function readFlag(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const value = String(raw).trim().toLowerCase();
  if (TRUTHY.has(value)) return true;
  if (FALSY.has(value)) return false;
  throw new Error(
    `${name}="${raw}" is not a boolean — use true/false, 1/0, yes/no or on/off`,
  );
}

/** Readable, copy-pasteable, and long enough not to be guessed. */
export function generatePassword() {
  return randomBytes(12).toString("base64url");
}

/**
 * Idempotent. Returns what it did so the caller can log one line and tests can
 * assert the interesting cases.
 *
 * @param {{
 *   sql: import("postgres").Sql;
 *   env?: Record<string, string | undefined>;
 *   log?: (message: string) => void;
 *   hash?: (password: string) => Promise<string>;
 *   randomPassword?: () => string;
 * }} options
 */
export async function ensureOwnerAccount({
  sql,
  env = process.env,
  log = console.log,
  hash = (password) => bcrypt.hash(password, BCRYPT_ROUNDS),
  randomPassword = generatePassword,
}) {
  if (readFlag(env, "ALLOW_REGISTRATION", true)) {
    return { action: "skipped", reason: "registration-open" };
  }

  const email = env.GHOSTED_USER_EMAIL?.trim().toLowerCase();
  if (!email) {
    throw new Error(
      "ALLOW_REGISTRATION=false needs GHOSTED_USER_EMAIL — with sign-ups closed and no owner account there is no way into the instance",
    );
  }

  const name = env.GHOSTED_USER_NAME?.trim() || DEFAULT_OWNER_NAME;

  const supplied = env.GHOSTED_USER_PASSWORD?.trim();
  const password = supplied || randomPassword();
  const passwordHash = await hash(password);

  // One statement, not SELECT-then-INSERT: two replicas starting together would
  // otherwise both find the account missing and one would lose the race with a
  // unique-violation. `DO NOTHING` also makes "already there" and "just created"
  // distinguishable by whether a row came back.
  // A password the operator did not choose is a password that lives in the
  // container log, so the account must replace it at first sign-in. A supplied
  // one is the operator's own choice and stays as it is.
  const [created] = await sql`
    INSERT INTO users (email, password_hash, name, image, provider, email_verified, email_verified_at, must_change_password)
    VALUES (${email}, ${passwordHash}, ${name}, ${DEFAULT_OWNER_AVATAR}, 'email', true, now(), ${!supplied})
    ON CONFLICT (email) DO NOTHING
    RETURNING id
  `;

  if (!created) {
    return { action: "skipped", reason: "exists", email };
  }

  if (supplied) {
    log(`Created the owner account ${name} <${email}>.`);
  } else {
    log(
      `Created the owner account ${name} <${email}> — password: ${password}\n` +
        "You will be asked to choose your own password at first sign-in; this one is shown once and never stored in plain text.",
    );
  }

  return { action: "created", email, id: created.id, generatedPassword: !supplied };
}
