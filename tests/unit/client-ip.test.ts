import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/utils/rate-limit";

/**
 * Which header a per-IP limit is keyed on.
 *
 * The regression this pins: the function used to trust the *last*
 * `x-forwarded-for` entry on the theory that a trusted edge appends the address
 * it saw. Measured against the production origin on 2026-10-14, nothing
 * appends — the header arrives exactly as the client sent it, so a fresh value
 * started a fresh bucket and the limit followed the attacker's string. The
 * single-value headers an edge overwrites come first now.
 */
function headers(values: Record<string, string>): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: values,
  });
}

describe("getClientIp", () => {
  it("prefers Cloudflare's header, which the edge overwrites", () => {
    expect(
      getClientIp(
        headers({
          "cf-connecting-ip": "203.0.113.9",
          "x-real-ip": "198.51.100.4",
          "x-forwarded-for": "10.0.0.1, 10.0.0.2",
        }),
      ),
    ).toBe("203.0.113.9");
  });

  it("falls back to x-real-ip when there is no Cloudflare header", () => {
    expect(
      getClientIp(
        headers({
          "x-real-ip": "198.51.100.4",
          "x-forwarded-for": "10.0.0.1",
        }),
      ),
    ).toBe("198.51.100.4");
  });

  it("uses the last forwarded entry when nothing better is present", () => {
    expect(
      getClientIp(headers({ "x-forwarded-for": "10.0.0.1, 198.51.100.4" })),
    ).toBe("198.51.100.4");
  });

  it("gives every header-less request one shared identity", () => {
    // No header means no address, and guessing one would be worse than a shared
    // bucket: the safe direction is to throttle more, not less.
    expect(getClientIp(headers({}))).toBe("unknown");
  });
});
