import { afterEach, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { verifyCsrfToken } from "@/lib/utils/csrf";

/**
 * The double-submit check the account-deletion route asks for.
 *
 * Auth.js mints `token|sha256(token + AUTH_SECRET)` in a cookie and expects the
 * bare token back, so a hostile origin cannot produce a pair the server will
 * accept: it cannot read the cookie, and it cannot forge the hash without the
 * secret.
 */
const SECRET = process.env.AUTH_SECRET ?? "";

/**
 * The cookie exactly as Next serialises it: the value carries a `|`, and the
 * serializer percent-encodes it (`…%7C…`). Building it with a literal `|` is
 * what let a green unit test sit next to a "Missing or invalid CSRF token" in a
 * real browser — the test created the input in the shape the code expected.
 */
function cookieValue(token: string, secret = SECRET): string {
  const hash = createHash("sha256").update(`${token}${secret}`).digest("hex");
  return encodeURIComponent(`${token}|${hash}`);
}

function requestWith(cookie: string | null, body: unknown): Request {
  return new Request("http://localhost/api/auth/account", {
    method: "DELETE",
    headers: cookie ? { cookie } : {},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

afterEach(() => {
  process.env.AUTH_SECRET = SECRET;
});

describe("verifyCsrfToken", () => {
  it("accepts the token the cookie carries, percent-encoded as Next writes it", () => {
    const token = randomBytes(32).toString("hex");
    const req = requestWith(`authjs.csrf-token=${cookieValue(token)}`, {});
    expect(verifyCsrfToken(req, token)).toBe(true);
  });

  it("accepts the __Host- prefixed cookie Auth.js sets over https", () => {
    // Production runs on https, where @auth/core switches to the stricter
    // `__Host-` name. Reading only the unprefixed cookie would have let the
    // check pass locally and fail in production.
    const token = randomBytes(32).toString("hex");
    const req = requestWith(`__Host-authjs.csrf-token=${cookieValue(token)}`, {});
    expect(verifyCsrfToken(req, token)).toBe(true);
  });

  it("rejects a token the cookie does not name", () => {
    const token = randomBytes(32).toString("hex");
    const req = requestWith(
      `authjs.csrf-token=${cookieValue(token)}`,
      {},
    );
    expect(verifyCsrfToken(req, randomBytes(32).toString("hex"))).toBe(false);
  });

  it("rejects a cookie whose hash does not match its token", () => {
    const token = randomBytes(32).toString("hex");
    const forged = `${token}|${"0".repeat(64)}`;
    const req = requestWith(`authjs.csrf-token=${forged}`, {});
    expect(verifyCsrfToken(req, token)).toBe(false);
  });

  it("rejects a missing token or a missing cookie", () => {
    const token = randomBytes(32).toString("hex");
    expect(verifyCsrfToken(requestWith(null, {}), token)).toBe(false);
    expect(
      verifyCsrfToken(requestWith(`authjs.csrf-token=${cookieValue(token)}`, {}), undefined),
    ).toBe(false);
    expect(
      verifyCsrfToken(requestWith(`authjs.csrf-token=${cookieValue(token)}`, {}), ""),
    ).toBe(false);
  });

  it("fails closed when there is no secret to verify with", () => {
    const token = randomBytes(32).toString("hex");
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;
    const req = requestWith(`authjs.csrf-token=${cookieValue(token)}`, {});
    expect(verifyCsrfToken(req, token)).toBe(false);
  });
});
