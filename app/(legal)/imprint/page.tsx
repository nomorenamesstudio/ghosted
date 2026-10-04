import type { Metadata } from "next";
import { OperatorContact } from "@/components/OperatorContact";
import { siteIdentity } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/imprint" },
  title: "Imprint - Ghosted",
};

export default function ImprintPage() {
  const { operator } = siteIdentity();
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Imprint</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Operator</h2>
        <OperatorContact label="Contact" />
      </section>

      {operator && (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Further information</h2>
          <p>
            Responsible for content: {operator.legalName ?? operator.name},
            contactable via the email above.
          </p>
        </section>
      )}

      <p className="border-t pt-4 text-xs text-muted-foreground">
        Requirements vary by jurisdiction (e.g. the German Impressum
        obligations, or a trading name registered locally); this page states who
        runs the service, not a claim about every register that might apply. It
        is not legal advice.
      </p>
    </main>
  );
}
