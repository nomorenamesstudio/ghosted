import type { Metadata } from "next";
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

/**
 * Deliberately session-free, and therefore prerenderable.
 *
 * It used to bounce signed-in visitors straight to `/app`, which meant reading
 * the session here — and reading cookies is what made this page render per
 * request. Two things were wrong with that: someone who wants to look at the
 * landing again should be able to, and the redirect belongs to the sign-in
 * screen, where "I am already signed in" is answered by going to the app.
 *
 * The other deployment decision — whether `/` serves the landing at all — moved
 * to `middleware.ts`, which reads the environment per request. Nothing on this
 * page depends on how the instance is configured, which is what lets one image
 * be built once and deployed anywhere.
 */
export default function HomePage() {
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
