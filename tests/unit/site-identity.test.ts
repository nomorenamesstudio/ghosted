import { describe, expect, it } from "vitest";
import { readConfig } from "@/lib/config/flags";
import { LICENSE_URL, REPO_URL, readSiteIdentity } from "@/lib/site";

/**
 * The identity rules decide whose name appears in the footer and on the legal
 * pages, and whether the instance can be found in a search engine. The case
 * that matters is the default: a self-hosted copy that configures nothing must
 * never credit the studio that wrote the software.
 */
const hosted = readConfig({ SHOW_LANDING: "true" });
const selfHosted = readConfig({
  SHOW_LANDING: "false",
  ALLOW_REGISTRATION: "false",
  GHOSTED_USER_EMAIL: "owner@example.com",
});

describe("readSiteIdentity", () => {
  it("credits the studio on the hosted instance, with no configuration at all", () => {
    const identity = readSiteIdentity(hosted, {});
    expect(identity.operator).toEqual({
      name: "Lost Signals Studio",
      email: "hey@lostsignals.studio",
      url: null,
    });
  });

  it("publishes nobody's name on a self-hosted instance that set none", () => {
    const identity = readSiteIdentity(selfHosted, {});
    expect(identity.operator).toBeNull();
    expect(identity.poweredByUrl).toBe(REPO_URL);
  });

  it("uses the hoster's own details when they publish them", () => {
    const identity = readSiteIdentity(selfHosted, {
      OPERATOR_NAME: "Anna's Ghosted",
      OPERATOR_EMAIL: "anna@example.com",
      OPERATOR_URL: "https://ghosted.example.com",
      POWERED_BY_URL: "https://example.com/about",
    });
    expect(identity.operator).toEqual({
      name: "Anna's Ghosted",
      email: "anna@example.com",
      url: "https://ghosted.example.com",
    });
    expect(identity.poweredByUrl).toBe("https://example.com/about");
  });

  it("tags a self-hosted wordmark DIY, keeps the hosted one bare, and honours an override", () => {
    expect(readSiteIdentity(hosted, {}).brandTag).toBeNull();
    expect(readSiteIdentity(selfHosted, {}).brandTag).toBe("DIY");
    expect(readSiteIdentity(selfHosted, { BRAND_TAG: "beta" }).brandTag).toBe("beta");
    expect(readSiteIdentity(selfHosted, { BRAND_TAG: "none" }).brandTag).toBeNull();
  });

  it("keeps the hosted instance's own tracker with no new configuration", () => {
    // Upgrading an existing deployment must not silently stop its analytics.
    expect(readSiteIdentity(hosted, {}).umami).toMatchObject({
      src: "https://ramen.lostsignals.studio/script.js",
      domains: "ghosted.lostsignals.studio",
    });
    // A self-hosted shape reports nowhere, which is the whole point.
    expect(readSiteIdentity(selfHosted, {}).umami).toBeNull();
  });

  it("renders no tracker unless a source and an id are both given", () => {
    // Half-configured is off, not a partial script tag.
    expect(readSiteIdentity(hosted, { UMAMI_SRC: "https://a.example/s.js" }).umami).toBeNull();
    expect(readSiteIdentity(selfHosted, { UMAMI_WEBSITE_ID: "abc" }).umami).toBeNull();
    expect(
      readSiteIdentity(hosted, {
        UMAMI_SRC: "https://a.example/s.js",
        UMAMI_WEBSITE_ID: "abc",
        UMAMI_DOMAINS: "ghosted.example.com",
      }).umami,
    ).toEqual({
      src: "https://a.example/s.js",
      websiteId: "abc",
      domains: "ghosted.example.com",
    });
  });

  it("exposes the repo and its license for the copy that links them", () => {
    expect(REPO_URL).toBe("https://github.com/krisztianhadi/ghosted");
    expect(LICENSE_URL).toBe(`${REPO_URL}/blob/main/LICENSE`);
  });
});

describe("indexability", () => {
  it("follows the deployment shape unless told otherwise", () => {
    expect(readSiteIdentity(hosted, {}).indexable).toBe(true);
    expect(readSiteIdentity(selfHosted, {}).indexable).toBe(false);
  });

  it("takes an explicit answer in both directions", () => {
    expect(readSiteIdentity(selfHosted, { SITE_INDEXABLE: "true" }).indexable).toBe(true);
    expect(readSiteIdentity(hosted, { SITE_INDEXABLE: "false" }).indexable).toBe(false);
    // A typo must not silently mean anything at all, least of all on a flag
    // that decides whether somebody's job hunt is crawlable.
    expect(() => readSiteIdentity(selfHosted, { SITE_INDEXABLE: "maybe" })).toThrow(
      /SITE_INDEXABLE="maybe" is not a boolean/,
    );
  });
});
