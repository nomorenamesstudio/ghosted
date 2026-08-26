import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service - Ghosted",
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="text-muted-foreground">
        Last updated: 2026. By using Ghosted you agree to these terms.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. The service</h2>
        <p>
          Ghosted is a personal job-application tracker: you store your own
          job applications, milestones and notes, and we keep them private to
          your account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. Your account</h2>
        <p>
          You are responsible for the accuracy of the information in your
          account and for keeping your login credentials secure. Notify us
          immediately if you suspect unauthorised use of your account.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3. Acceptable use</h2>
        <ul className="list-disc space-y-1 pl-6">
          <li>Use the service for your own, personal job-hunt tracking.</li>
          <li>
            Do not attempt to access other users&rsquo; data, abuse the API, or
            disrupt the service.
          </li>
          <li>
            Only store data you have the right to store (e.g. contact details
            of recruiters you communicate with).
          </li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">4. Availability</h2>
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We aim for
          high availability but do not guarantee uninterrupted operation, and
          we may modify or discontinue features at any time.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">5. Liability</h2>
        <p>
          To the extent permitted by applicable law, our liability is limited
          to damages caused intentionally or by gross negligence. We are not
          liable for indirect or consequential damages (including loss of
          data) — back up what matters to you.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">6. Changes to these terms</h2>
        <p>
          We may update these terms from time to time. Continued use of the
          service after changes take effect constitutes acceptance of the
          updated terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">7. Governing law</h2>
        <p>
          These terms are governed by the applicable law of your country of
          residence. If you are located in the EU/EEA, the General Data
          Protection Regulation and the laws of your member state apply. For
          any dispute, contact us first at{" "}
          <a href="mailto:hey@lostsignals.studio" className="underline">
            hey@lostsignals.studio
          </a>{" "}
          and we will do our best to resolve it amicably.
        </p>
      </section>

      <p className="border-t pt-4 text-xs text-muted-foreground">
        This page will be updated as the operator&rsquo;s legal details are
        formalized. It is not legal advice.
      </p>
    </main>
  );
}
