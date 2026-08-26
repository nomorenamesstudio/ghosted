import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - Ghosted",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-muted-foreground">
        Last updated: 2026. This policy explains which personal data Ghosted
        (&ldquo;we&rdquo;) processes, why, and which rights you have.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. Controller</h2>
        <p>
          Ghosted is operated by <strong>Lost Signals Studio</strong> (legal
          entity to be formalized — operator details are kept minimal to
          protect the operator&rsquo;s privacy).
          <br />
          Contact for privacy matters:{" "}
          <a href="mailto:hey@lostsignals.studio" className="underline">
            hey@lostsignals.studio
          </a>
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. Data we process</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            <strong>Account data:</strong> name, email address and a password
            hash (bcrypt, cost factor 12). OAuth sign-in identifiers if you use
            Google or LinkedIn.
          </li>
          <li>
            <strong>Job application data you enter:</strong> company, role,
            job-posting URL, contact details, notes and your milestone
            timeline. This data is yours and only used to provide the service.
          </li>
          <li>
            <strong>Session data:</strong> one essential session cookie (a
            signed JWT) required to keep you signed in.
          </li>
          <li>
            <strong>Local preferences:</strong> your theme choice and collapsed
            sections are stored in your browser&rsquo;s local storage only and
            never transmitted to us.
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. Purposes and legal bases</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>
            Providing the service (storing your account and applications):
            Art.&nbsp;6(1)(b) GDPR (performance of a contract).
          </li>
          <li>
            Security and abuse prevention (rate limiting, auth logging):
            Art.&nbsp;6(1)(f) GDPR (legitimate interest).
          </li>
          <li>
            Consent, where we explicitly ask for it: Art.&nbsp;6(1)(a) GDPR.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data and do not run tracking or
          advertising cookies.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. Storage and security</h2>
        <p>
          Data is stored in a PostgreSQL database. Connections are encrypted
          (TLS); passwords are never stored in plain text (bcrypt, cost 12);
          session cookies are httpOnly and secure. Access to your data is
          strictly scoped to your account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">5. Retention</h2>
        <p>
          Your data is kept while your account is active. You can delete
          individual applications at any time. On account deletion we erase
          your personal data within 30 days, except where we are legally
          required to keep it.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">6. Your rights</h2>
        <p>
          Under the GDPR you have the right to access (Art.&nbsp;15), rectification
          (Art.&nbsp;16), erasure (Art.&nbsp;17), restriction (Art.&nbsp;18), data
          portability (Art.&nbsp;20) and objection (Art.&nbsp;21) with regard to
          your personal data. To exercise any of these rights, contact{" "}
          <a href="mailto:hey@lostsignals.studio" className="underline">
            hey@lostsignals.studio
          </a>
          . You also have the right to lodge a complaint with your supervisory
          authority (in the EU/EEA, your local data-protection authority).
        </p>
      </section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        This page will be updated as the operator&rsquo;s legal details are
        formalized. It is not legal advice.
      </p>
    </main>
  );
}
