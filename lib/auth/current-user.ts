import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

/**
 * The one place a signed-in user is resolved.
 *
 * Every page, route handler and API guard reads the session through here rather
 * than calling `auth()` directly. The self-hosted shapes of the app change what
 * a deployment *serves* — the landing or the login screen, open or closed
 * registration — never who the caller is, so the seam stays single: when the
 * session strategy moves (database sessions, an SSO provider), it moves here.
 */
export interface CurrentUser {
  id: string;
  email: string | null;
  name: string | null;
  image: string | null;
  /**
   * True while the account still holds a password the operator did not choose
   * (the boot-seeded owner). The account may sign in and change it, and do
   * nothing else: see `requireUser` and `requireSessionForWrite`.
   */
  mustChangePassword: boolean;
}

/** The signed-in user, or null. Never redirects, so API routes can decide. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id) return null;
  return {
    id: user.id,
    email: user.email ?? null,
    name: user.name ?? null,
    image: user.image ?? null,
    mustChangePassword: user.mustChangePassword === true,
  };
}

/** Where a signed-in user is sent while that flag is set. */
export const CHANGE_PASSWORD_PATH = "/change-password";

/**
 * Pages only. A signed-out visitor is sent to `/login` — the starter screen on
 * an instance without a landing page, and the right place on one with it.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // The password in the container log is not a working credential for the app:
  // until it is replaced, the only page this account can reach is the one that
  // replaces it. The API says the same thing (see `requireSessionForWrite`), so
  // this is not a redirect a client can walk around.
  if (user.mustChangePassword) redirect(CHANGE_PASSWORD_PATH);
  return user;
}
