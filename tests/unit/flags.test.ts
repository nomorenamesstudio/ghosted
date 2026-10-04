import { describe, expect, it } from "vitest";
import { ConfigError, deploymentProblems, readConfig } from "@/lib/config/flags";

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

  it("reports a closed-registration instance with no owner account", () => {
    // No way in: nobody can register and no account exists to sign into. This is
    // a rule about a *deployment*, so it is reported by `deploymentProblems`
    // (which the health probe and the sign-up route read) rather than thrown
    // while parsing — a build has no deployment to judge.
    expect(deploymentProblems({ ALLOW_REGISTRATION: "false" })).toEqual([
      expect.stringMatching(/needs GHOSTED_USER_EMAIL/),
    ]);

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
    // A typo *and* a deployment rule, in one pass: an operator fixes one list,
    // not one variable per restart.
    const problems = deploymentProblems({
      SHOW_LANDING: "maybe",
      ALLOW_REGISTRATION: "false",
    });
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatch(/SHOW_LANDING="maybe"/);
    expect(problems[1]).toMatch(/needs GHOSTED_USER_EMAIL/);

    // Parsing alone still refuses the typo, and says nothing about the rules it
    // is not responsible for.
    try {
      readConfig({ SHOW_LANDING: "maybe", ALLOW_REGISTRATION: "false" });
      expect.unreachable("expected a ConfigError");
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      expect((error as ConfigError).problems).toHaveLength(1);
    }
  });
});
