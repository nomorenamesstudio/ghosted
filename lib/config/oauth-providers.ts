/**
 * Which OAuth providers this build can sign in with, and which of them a given
 * deployment has configured.
 *
 * One reader for three callers — the Auth.js config (`lib/auth.ts`), the login
 * page and Settings — so a provider can never be button-visible in one place
 * and provider-missing in another. Environment only, no database: the login
 * page answers this on every request and it is a deployment fact, not a user
 * fact.
 */

/** Every provider this build implements, in display order. */
export const OAUTH_PROVIDERS = ["google", "linkedin"] as const;

export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** Display names, capitalised the way each brand writes itself. */
export const OAUTH_PROVIDER_NAMES: Record<OAuthProvider, string> = {
  google: "Google",
  linkedin: "LinkedIn",
};

export type EnvRecord = Record<string, string | undefined>;

export interface ConfiguredOAuthProvider {
  provider: OAuthProvider;
  clientId: string;
  clientSecret: string;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/**
 * The providers this deployment has credentials for, in display order.
 *
 * A half-configured provider — id without secret — is not offered: the button
 * would only fail at the callback, which is a worse place to find out. A blank
 * or whitespace-only value counts as unset, so a `.env` line left as
 * `AUTH_LINKEDIN_ID=` does not switch a provider on.
 */
export function configuredOAuthProviders(
  env: EnvRecord = process.env,
): ConfiguredOAuthProvider[] {
  return OAUTH_PROVIDERS.flatMap((provider) => {
    const prefix = `AUTH_${provider.toUpperCase()}`;
    const clientId = env[`${prefix}_ID`]?.trim();
    const clientSecret = env[`${prefix}_SECRET`]?.trim();
    if (!clientId || !clientSecret) return [];
    return [{ provider, clientId, clientSecret }];
  });
}
