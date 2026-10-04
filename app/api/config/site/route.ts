import { NextResponse } from "next/server";
import { siteIdentity } from "@/lib/site";

/**
 * The public identity the shell needs at runtime: whose name goes in the footer
 * credit, and where "powered by Ghosted" points.
 *
 * It exists because the footer is rendered on prerendered pages, and a credit
 * baked into a build would follow the image: a self-hosted instance would wear
 * the hosted studio's name at the bottom of every page — the exact thing the
 * footer is written to avoid. Nothing here is private; it is the same two
 * strings the footer used to contain.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const { operator, poweredByUrl } = siteIdentity();

  return NextResponse.json(
    {
      operator: operator
        ? { name: operator.name, url: operator.url, legalName: operator.legalName }
        : null,
      poweredByUrl,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
