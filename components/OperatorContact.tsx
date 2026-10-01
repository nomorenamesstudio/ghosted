import { siteIdentity } from "@/lib/site";

/**
 * Who to contact about this instance, as rendered on the legal pages.
 *
 * The case worth caring about is the one with no operator details: a
 * self-hosted instance must not tell a visitor that Lost Signals Studio
 * controls their data, because it does not. The fallback says what is true —
 * this is somebody's own copy of Ghosted, the software is open source, and the
 * hoster has published no contact of their own.
 */
export function OperatorContact({ label = "Contact" }: { label?: string }) {
  const { operator } = siteIdentity();

  if (!operator) return <SelfHostedNotice />;

  return (
    <>
      <p>
        <strong>{operator.name}</strong>
        {operator.url && (
          <>
            {" — "}
            <a
              href={operator.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              {operator.url.replace(/^https?:\/\//, "")}
            </a>
          </>
        )}
        <br />
        {label}: <OperatorEmail />
      </p>

      {/* The alias is a trading name, not a legal person, and several
          jurisdictions require the identity behind it to be stated: the imprint
          duty, the GDPR's identifiable-controller requirement, and consumer /
          trader-information rules. Both names go together, and a sole trader
          says so — otherwise "no register entry" reads as missing paperwork
          rather than a deliberate structure. */}
      {operator.legalName && (
        <p className="text-muted-foreground">
          <strong>{operator.name}</strong> is the independent development alias
          of {operator.legalName}
          {operator.soleTrader
            ? " — a sole proprietorship, not a registered company, so there is no commercial-register entry."
            : "."}
        </p>
      )}
      {(operator.register || operator.vat) && (
        <p className="text-muted-foreground">
          {operator.register && <>Commercial register: {operator.register}</>}
          {operator.register && operator.vat && <br />}
          {operator.vat && <>VAT ID: {operator.vat}</>}
        </p>
      )}
    </>
  );
}

/**
 * An address to write to, inline. Without an operator address there is nothing
 * honest to link to, so the sentence keeps working with plain words.
 */
export function OperatorEmail({ fallback = "the address this instance gave you" }) {
  const { operator } = siteIdentity();
  if (!operator?.email) return <>{fallback}</>;
  return (
    <a href={`mailto:${operator.email}`} className="underline">
      {operator.email}
    </a>
  );
}

/** Shown on the legal pages of an instance whose operator published nothing. */
export function SelfHostedNotice() {
  const { poweredByUrl } = siteIdentity();
  return (
    <p>
      This is a <strong>self-hosted instance</strong> of Ghosted. The person
      running it has not published their own operator details, so there is no
      separate contact address here.
      <br />
      Ghosted itself is open source and ready to run:{" "}
      <a
        href={poweredByUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        powered by Ghosted
      </a>
      .
    </p>
  );
}
