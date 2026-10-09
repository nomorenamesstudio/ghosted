import { describe, expect, it } from "vitest";
import { configuredOAuthProviders } from "@/lib/config/oauth-providers";

/**
 * What the login page and Settings treat as "available". A provider that is
 * half-configured would render a button whose flow dies at the callback, and a
 * blank `.env` line (`AUTH_LINKEDIN_ID=`) is not a configured provider.
 */
describe("configuredOAuthProviders", () => {
  it("offers nothing when no credentials are set", () => {
    expect(configuredOAuthProviders({})).toEqual([]);
  });

  it("offers a provider whose id and secret are both set", () => {
    const providers = configuredOAuthProviders({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "google-secret",
      AUTH_LINKEDIN_ID: "linkedin-id",
      AUTH_LINKEDIN_SECRET: "linkedin-secret",
    });

    expect(providers).toEqual([
      { provider: "google", clientId: "google-id", clientSecret: "google-secret" },
      {
        provider: "linkedin",
        clientId: "linkedin-id",
        clientSecret: "linkedin-secret",
      },
    ]);
  });

  it("withholds a provider whose secret is missing or blank", () => {
    const providers = configuredOAuthProviders({
      AUTH_GOOGLE_ID: "google-id",
      AUTH_GOOGLE_SECRET: "   ",
      AUTH_LINKEDIN_ID: "linkedin-id",
    });

    expect(providers).toEqual([]);
  });
});
