import { describe, expect, it } from "vitest";
import { ConfigError, readConfig } from "@/lib/config/flags";

/**
 * The flags decide what a deployment serves — the landing or the login screen,
 * open or closed registration — so the contract worth pinning is the defaults
 * plus the strictness: a deployment that sets nothing must behave exactly as it
 * did before these flags existed, and a typo must never be read as "the
 * default" or as `false`.
 */
describe("readConfig", () => {
  it("defaults to the hosted shape when nothing is set", () => {
    const config = readConfig({});
    expect(config.showLanding).toBe(true);
    expect(config.allowRegistration).toBe(true);
    expect(config.ownerEmail).toBeNull();
    expect(config.ownerName).toBeNull();
  });

  it("reads the documented boolean spellings in both directions", () => {
    for (const on of ["1", "true", "TRUE", "yes", "on"]) {
      expect(readConfig({ SHOW_LANDING: on }).showLanding).toBe(true);
    }
    for (const off of ["0", "false", "No", "off"]) {
      expect(readConfig({ SHOW_LANDING: off }).showLanding).toBe(false);
    }
  });

  it("treats an empty value as unset, not as false", () => {
    // `SHOW_LANDING=` in a compose file is how a deployment says nothing at
    // all; reading it as false would silently remove the landing page.
    expect(readConfig({ SHOW_LANDING: "", ALLOW_REGISTRATION: "  " }).showLanding).toBe(true);
  });

  it("refuses a typo instead of guessing", () => {
    expect(() => readConfig({ ALLOW_REGISTRATION: "flase" })).toThrow(ConfigError);
    expect(() => readConfig({ ALLOW_REGISTRATION: "flase" })).toThrow(
      /ALLOW_REGISTRATION="flase" is not a boolean/,
    );
  });

  it("refuses a closed-registration instance with no owner account", () => {
    // No way in: nobody can register and no account exists to sign into.
    expect(() => readConfig({ ALLOW_REGISTRATION: "false" })).toThrow(
      /needs GHOSTED_USER_EMAIL/,
    );

    const config = readConfig({
      ALLOW_REGISTRATION: "false",
      GHOSTED_USER_EMAIL: "owner@example.com",
      GHOSTED_USER_NAME: "Haunty",
    });
    expect(config.allowRegistration).toBe(false);
    expect(config.ownerEmail).toBe("owner@example.com");
    expect(config.ownerName).toBe("Haunty");
  });

  it("reports every problem at once", () => {
    try {
      readConfig({ SHOW_LANDING: "maybe", ALLOW_REGISTRATION: "false" });
      expect.unreachable("expected a ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).problems).toHaveLength(2);
    }
  });
});
