/**
 * Boolean deployment flags, parsed without importing anything.
 *
 * This module exists for one reason: middleware runs in the Edge runtime and
 * cannot import `lib/config/flags.ts`, which pulls in the logger and the email
 * transport (and therefore `node:net`/`node:tls`). But the *rule* for reading a
 * flag must not exist twice — a second parser is how `SHOW_LANDING=false` ends
 * up meaning two different things in two places. So the parse lives here, with
 * no dependencies at all, and both readers share it: the strict one that stops
 * the boot on a typo, and the lenient one middleware uses because a typo there
 * would turn into a 500 for every request instead of one clear error.
 */

export type EnvRecord = Record<string, string | undefined>;

const TRUTHY = new Set(["1", "true", "yes", "on"]);
const FALSY = new Set(["0", "false", "no", "off"]);

export type FlagRead =
  | { kind: "unset" }
  | { kind: "value"; value: boolean }
  /**
   * Not a boolean. An empty value counts as `unset`, not as invalid: `FLAG=` in
   * a compose file is the commonest way to *not* set something, and treating it
   * as `false` is how a deployment silently changes shape.
   */
  | { kind: "invalid"; raw: string };

export function readBooleanFlagRaw(raw: string | undefined): FlagRead {
  if (raw === undefined || raw.trim() === "") return { kind: "unset" };
  const value = raw.trim().toLowerCase();
  if (TRUTHY.has(value)) return { kind: "value", value: true };
  if (FALSY.has(value)) return { kind: "value", value: false };
  return { kind: "invalid", raw };
}
