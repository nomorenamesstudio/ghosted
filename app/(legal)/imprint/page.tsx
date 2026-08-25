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
          [Street, number]
          <br />
          [Postal code, City]
          <br />
          [Country]
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p>
          Email:{" "}
          <a href="mailto:contact@lostsignals.studio" className="underline">
            contact@lostsignals.studio
          </a>
          <br />
          Phone: [phone number]
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Further information</h2>
        <p>
          VAT ID / USt-IdNr.: [if applicable]
          <br />
          Responsible for content per § 18 Abs. 2 MStV / § 5 DDG: [name, if
          applicable]
        </p>
      </section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        Template notice: complete the bracketed operator details before going
        live. Requirements vary by jurisdiction (e.g. the German Impressum
        obligations).
      </p>
    </main>
  );
}
