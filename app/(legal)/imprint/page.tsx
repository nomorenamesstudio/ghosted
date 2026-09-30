import type { Metadata } from "next";
import { OperatorContact } from "@/components/OperatorContact";
import { siteIdentity } from "@/lib/site";

export const metadata: Metadata = {
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
        {operator && (
          <p className="text-muted-foreground">
            Operator details are kept minimal to protect the
            operator&rsquo;s privacy.
          </p>
        )}
      </section>

      {operator && (
        <section className="space-y-2">
          <h2 className="text-xl font-semibold">Further information</h2>
          <p>
            VAT ID / USt-IdNr.: not yet applicable
            <br />
            Responsible for content: {operator.name}, contactable via the email
            above
          </p>
        </section>
      )}

      <p className="border-t pt-4 text-xs text-muted-foreground">
        This page will be updated as the operator&rsquo;s legal details are
        formalized. Requirements vary by jurisdiction (e.g. the German
        Impressum obligations); this is not legal advice.
      </p>
    </main>
  );
}
