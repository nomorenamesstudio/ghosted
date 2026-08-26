import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Imprint - Ghosted",
};

export default function ImprintPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Imprint</h1>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Operator</h2>
        <p>
          <strong>Lost Signals Studio</strong>
          <br />
          (legal entity to be formalized — operator details are kept minimal
          to protect the operator&rsquo;s privacy)
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Email:{" "}
          <a href="mailto:hey@lostsignals.studio" className="underline">
            hey@lostsignals.studio
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Further information</h2>
        <p>
          VAT ID / USt-IdNr.: not yet applicable
          <br />
          Responsible for content: Lost Signals Studio, contactable via the
          email above
        </p>
      </section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        This page will be updated as the operator&rsquo;s legal details are
        formalized. Requirements vary by jurisdiction (e.g. the German
        Impressum obligations); this is not legal advice.
      </p>
    </main>
  );
}
