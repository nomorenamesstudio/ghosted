import Link from "next/link";

/**
 * What using the service means, stated once under every auth box.
 *
 * One line, and deliberately not a consent checkbox: the privacy policy is
 * information the controller owes (GDPR Art. 13) rather than something to be
 * accepted — a mandatory "I agree to the privacy policy" can suggest consent is
 * the lawful basis when it is contract performance (Art. 6(1)(b)), and has been
 * read as bringing privacy text under terms-and-conditions control. What the
 * terms do need is a pointer where the account is created and a chance to read
 * them: a footer link alone was held insufficient (OLG Frankfurt, 6 U 121/21).
 *
 * It lives in the auth layout so every screen that signs someone in, up or out
 * of an account says the same thing once, from one place.
 */
export function LegalNotice() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      By creating an account or signing in you agree to the{" "}
      <Link href="/terms" className="underline underline-offset-2">
        Terms of Service
      </Link>{" "}
      and the{" "}
      <Link href="/privacy" className="underline underline-offset-2">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
