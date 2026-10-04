import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { runtimeConfig } from "@/lib/config/flags";
import { Landing } from "@/components/Landing";
import { softwareApplicationJsonLd } from "@/lib/structured-data";

/**
 * The landing is the one page worth consolidating: the app answers on the
 * hosted domain, on whatever domain a self-hoster points at it, and on the
 * Railway hostname, and all three would otherwise compete as duplicates.
 */
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  // Signed-in users go straight to the app — on every shape of the deployment,
  // including one whose `/` is a redirect to the login screen.
  const user = await getCurrentUser();
  if (user) redirect("/app");

  // The landing is the hosted instance's front door. A self-hosted instance
  // turns it off and starts at the login screen instead.
  if (!runtimeConfig().showLanding) redirect("/login");

  return (
    <>
      {/* Structured data, rendered on the server and never from user input.
          Escaped because a JSON string containing "</script>" would end the
          block early. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationJsonLd()).replace(
            /</g,
            "\\u003c",
          ),
        }}
      />
      <Landing />
    </>
  );
}
