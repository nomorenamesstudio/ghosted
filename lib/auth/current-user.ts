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
  };
}

/**
 * Pages only. A signed-out visitor is sent to `/login` — the starter screen on
 * an instance without a landing page, and the right place on one with it.
 */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
