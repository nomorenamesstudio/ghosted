import type { Metadata } from "next";
import Link from "next/link";
import { OperatorEmail } from "@/components/OperatorContact";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { siteIdentity } from "@/lib/site";

/**
 * Where a deleted account lands.
 *
 * The old ending was the login screen, which reads like a mistake: the person
 * just deleted their account on purpose and was handed a form to sign back into
 * it. This says what happened, offers the one thing that is genuinely useful to
 * whoever runs the instance — a sentence about why — and then gets out of the
 * way.
 *
 * Per request rather than prerendered, like every page that names the operator:
 * a self-hosted build must not bake in somebody else's address.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account deleted - Ghosted",
  alternates: { canonical: "/account-deleted" },
  // Reached only by deleting an account; nothing about it belongs in an index.
  robots: { index: false, follow: false },
};

export default function AccountDeletedPage() {
  const { operator } = siteIdentity();

  return (
    <Card>
      <CardHeader>
        <CardTitle>It&rsquo;s gone.</CardTitle>
        <CardDescription>
          The account, every application, every milestone and note — deleted, and
          not coming back.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* No operator address means no invitation to write: a self-hosted
            instance should not point a departing user at a stranger. */}
        {operator?.email && (
          <p className="text-sm text-muted-foreground">
            If you feel like saying why you left — or what would have kept you —
            write to <OperatorEmail />. It gets read.
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          If the hunt is ever on again, the door is open. Your export file will
          walk straight back in.
        </p>
        {/* A way back, not a nudge: the person just asked to be forgotten, and
            a call to sign up again is pressure they did not ask for. */}
        <p>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
          >
            Back to the homepage
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
