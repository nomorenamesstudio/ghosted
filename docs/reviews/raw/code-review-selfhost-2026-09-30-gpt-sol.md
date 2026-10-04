## Verdict

**Not safe to merge for the documented self-hosting path.** The most serious issue is that the recommended Compose setup publishes a Postgres server with a known password on all host interfaces. The branch has strong data-isolation work, but the database exposure and a likely clean-build failure need fixing before release.

## Findings

1. **The self-hosting command exposes Postgres with public, fixed credentials.**  
   The `db` service retains `POSTGRES_PASSWORD: ghosted` and `ports: ["5432:5432"]`, while the new guide tells operators to run that service as part of a self-hosted deployment. Docker’s unqualified port binding publishes on all host interfaces; a host that permits inbound connections therefore exposes the application database behind a password printed in the repository. This is more serious than an application-level authentication bug because it bypasses the application altogether.  
   Evidence: `docker-compose.yml:15-27` (`POSTGRES_PASSWORD: ghosted`, `- "5432:5432"`); `docs/SELFHOST.md:42`  
   Severity: blocker  
   Effort: S

2. **A clean production image build can fail before runtime configuration exists.**  
   `app/layout.tsx` calls `siteIdentity()` at module scope. That calls `runtimeConfig()`, whose `readConfig()` rejects production with open registration and no delivering email transport; Compose supplies the email variables only under the *runtime* `environment:` block, not to `docker build`. Next’s build can load the layout module while collecting route information, so the documented `up -d --build` path needs a clean-environment build test, not just tests run with a configured environment. Move identity-dependent metadata into `generateMetadata()` and validate deployment configuration at runtime startup.  
   Evidence: `app/layout.tsx:34` (`const identity = siteIdentity()`); `lib/config/flags.ts:111-129`; `docker-compose.yml:43-69`  
   Severity: blocker  
   Effort: M

3. **`smtp://` can transmit credentials and account links without TLS.**  
   In `sendSmtpMessage()`, STARTTLS is taken *if advertised*, but the function otherwise proceeds to `authenticateAndSend()` on the plain socket. A server that omits STARTTLS—or a connection whose advertised capabilities are altered—can receive `AUTH PLAIN` or LOGIN credentials and verification or reset mail in cleartext. Refusing an unsuccessful *attempted* upgrade is good, but it does not make an upgrade mandatory. Require TLS for remote SMTP, with a separate, explicit exception if unauthenticated local Postfix is supported.  
   Evidence: `lib/email/smtp.ts:278-294` (`if (!config.secure && capabilities.includes("STARTTLS"))` followed by `authenticateAndSend(...)`); `lib/email/smtp.ts:306-327`  
   Severity: major  
   Effort: S

4. **The new `robots.txt` can be baked for the wrong deployment shape.**  
   `app/robots.ts` reads environment-derived identity but declares no dynamic route configuration. Next 14 metadata routes such as `robots.ts` are cached by default; forcing the *root layout* dynamic does not force this separate route dynamic. A shared image built under hosted defaults can consequently serve permissive robots rules on a self-hosted instance, contrary to the branch’s privacy default. Add `export const dynamic = "force-dynamic"` here and test `/robots.txt` from a built image with runtime-only flags.  
   Evidence: `app/robots.ts:1-26` (`siteIdentity()` in `robots()` with no dynamic export); `app/layout.tsx:18`  
   Severity: major  
   Effort: S

5. **Legacy imports without `createdAt` are not idempotent across requests.**  
   `importUserData()` checks a missing timestamp using `identityKey(company, role, null)`, then inserts the application without `createdAt`, allowing the database to assign a timestamp. On the next import, `existing` contains that assigned timestamp, so it no longer matches the file’s empty-timestamp key and another row is inserted. The legacy test imports only once, while the documentation promises that importing the same file twice changes nothing. Preserve a stable import identity for timestamp-less rows, or define and test a deliberate company-and-role fallback for them.  
   Evidence: `lib/services/import.ts:148-179` (`app.createdAt ? new Date(app.createdAt) : null` and conditional insert of `createdAt`); `lib/services/import.ts:213-225`  
   Severity: major  
   Effort: M

6. **The SMTP reply parser loses multiline state between socket chunks.**  
   `SmtpSession.onData_()` initializes `code` and `lines` on every data event. If an EHLO reply’s continuation lines arrive in one chunk and its final line in another, the earlier capabilities are discarded; the client can miss STARTTLS or AUTH even though the server advertised them. The fake server exercises protocol content, but TCP is free to split that content at any byte. Keep the in-progress reply on the session instance and test deliberately split multiline replies.  
   Evidence: `lib/email/smtp.ts:105-130` (`let code = 0; let lines: string[] = []` inside `onData_`)  
   Severity: major  
   Effort: S

7. **The health endpoint does not establish application readiness.**  
   `GET /api/health` checks only `select 1`, while the new deployment rules reject invalid registration/email configuration elsewhere. Once configuration is evaluated at runtime rather than during build, a process can return 200 to the Compose and Railway probes while ordinary pages fail configuration validation. Keep the database check, but have readiness also validate the deployment configuration; a health request must not disclose its secrets or full validation errors.  
   Evidence: `app/api/health/route.ts:20-45` (`await db.execute(sql\`select 1\`)`); `lib/config/flags.ts:111-132`  
   Severity: major  
   Effort: S

8. **An upgrade does not preserve the hosted instance’s analytics without new variables.**  
   The previous layout always rendered the hosted Umami script. The replacement renders it only when both `UMAMI_SRC` and `UMAMI_WEBSITE_ID` are set, and `readSiteIdentity()` supplies no hosted fallback. The changelog says the hosted instance sets these variables; that may be an operational plan, but it is not backward compatibility for an existing deployment that upgrades without changing its environment. Supply the hosted defaults where appropriate, or make setting and verifying those variables an explicit prerequisite to deploying this branch.  
   Evidence: `app/layout.tsx:143-158` (removed hard-coded script; `{identity.umami && ...}`); `lib/site.ts:94-105`  
   Severity: major  
   Effort: S

9. **A malformed SMTP URL can put its password in an error message.**  
   `parseSmtpUrl()` interpolates the entire `SMTP_URL` into its “not a URL” exception; `readTransportChoice()` includes that exception in the collected configuration problems. An operator’s typo could therefore copy SMTP credentials into startup logs or deployment diagnostics. Report the variable name and the parsing problem, never the supplied URL.  
   Evidence: `lib/email/smtp.ts:34-39` (`SMTP_URL="${raw}" is not a URL`); `lib/email/transport.ts:66-71`  
   Severity: minor  
   Effort: S

## Security and data integrity

The owner bootstrap generates a cryptographically random password, hashes it with bcrypt, and uses `ON CONFLICT (email) DO NOTHING`; a restart does not reset a changed password. “Logged once” accurately describes what the app writes, **not** how long container logs or log shippers retain it. The guide acknowledges that risk and tells the owner to change it. An explicitly supplied `GHOSTED_USER_PASSWORD` is not logged, though it remains a deployment secret.

The deletion guard is server-side, not merely a hidden button: `DELETE /api/auth/account` refuses deletion when registration is closed. Its explanation assumes closed registration means exactly one account, which need not remain true if an operator closes registration after creating several; in that case the guard is conservative rather than a cross-user deletion risk.

The import route authenticates through `requireSessionForWrite("import")` before reading the body. It enforces a five-megabyte limit on streamed bytes rather than trusting `Content-Length`, then parses JSON through a bounded Zod schema. The service uses one database transaction, scopes deletion and duplicate lookup to the authenticated user ID, and generates fresh application and milestone IDs rather than trusting exported IDs. It ignores the file’s `user` block. Those are sound boundaries; the timestamp-less duplicate case above is the concrete integrity exception. The shown import path does not expose another user’s rows, and the changed logo route likewise retains its `application.userId` condition.

SMTP uses Node TLS with normal certificate verification for implicit TLS and STARTTLS; the latter’s full handshake is not covered by the fake-server test. From and To reject CR/LF, non-printable subjects are encoded, and the body is CRLF-normalized and dot-stuffed. Those protections are real, not false alarms. They do not cure optional TLS, the split-reply parser, or the credential-bearing URL error.

## What I would not ship without changing

- Bind self-hosted Postgres to loopback or remove its published port, and require a generated database password.
- Make configuration and identity evaluation runtime-safe; prove a clean `docker compose --profile selfhost up -d --build` works.
- Require TLS before remote SMTP authentication or message delivery, and fix and test chunk-split replies.
- Force `/robots.txt` dynamic and test its output from one image under both runtime deployment shapes.
- Make repeated legacy imports without timestamps idempotent.
- Make health reflect configuration readiness, and preserve or explicitly migrate the hosted analytics setting.

## What is good and should stay

The single current-user seam reduces scattered session handling without weakening the shown per-user logo query. Strict flag parsing, the closed-registration owner requirement, and `ON CONFLICT DO NOTHING` address plausible deployment and restart failures. The import’s bounded read, Zod validation, fresh IDs, user scoping and transaction are the right foundation for portability. The log transport is honestly marked non-delivering; production open registration rejects it. Finally, `.dockerignore` closes a meaningful image-layer secret exposure, and the database-backed health check is better than a process-only probe once configuration readiness is added.