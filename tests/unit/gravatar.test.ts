import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptGravatarResponse,
  gravatarHash,
  gravatarPath,
  gravatarUpstreamUrl,
  GRAVATAR_HASH_RE,
} from "@/lib/utils/gravatar";
import { resolveGravatarPath } from "@/lib/services/gravatar";

/**
 * The hash is the whole identity, so the vector below is pinned to the one
 * Gravatar's own documentation publishes for `MyEmailAddress@example.com`
 * (`0bc83cb5…`, i.e. the MD5 of the *lowercased* address — verified against
 * `md5sum` here 2026-09-23). Anything else is a silent miss for every user
 * whose address has a capital letter in it.
 */
describe("gravatarHash", () => {
  it("hashes the trimmed, lowercased address", () => {
    const expected = "0bc83cb571cd1c50ba6f3e8a78ef1346";
    expect(gravatarHash("MyEmailAddress@example.com")).toBe(expected);
    expect(gravatarHash("  myemailaddress@example.com  ")).toBe(expected);
    expect(gravatarHash("MYEMAILADDRESS@EXAMPLE.COM")).toBe(expected);
    expect(GRAVATAR_HASH_RE.test(expected)).toBe(true);
  });

  it("produces a different hash for a different address", () => {
    expect(gravatarHash("demo@example.com")).toBe(
      "7c4ff521986b4ff8d29440beec01972d",
    );
  });
});

describe("gravatarUpstreamUrl", () => {
  it("asks for 404 rather than a placeholder image", () => {
    const url = new URL(gravatarUpstreamUrl("a".repeat(32), 160));
    expect(url.origin + url.pathname).toBe(
      `https://www.gravatar.com/avatar/${"a".repeat(32)}`,
    );
    expect(url.searchParams.get("d")).toBe("404");
    expect(url.searchParams.get("s")).toBe("160");
  });

  it("never contains the address, only the hash", () => {
    const hash = gravatarHash("someone@example.com");
    expect(gravatarUpstreamUrl(hash)).not.toContain("someone@example.com");
    expect(gravatarPath(hash)).toBe(`/avatars/${hash}`);
  });
});

describe("acceptGravatarResponse", () => {
  it("accepts raster avatars", () => {
    expect(acceptGravatarResponse(200, "image/png", 6343)).toBe("image/png");
    expect(acceptGravatarResponse(200, "image/jpeg", 9000)).toBe("image/jpeg");
    expect(acceptGravatarResponse(200, "image/webp; charset=utf-8", 900)).toBe(
      "image/webp",
    );
  });

  it("treats Gravatar's 404 (no such avatar) as no avatar", () => {
    expect(acceptGravatarResponse(404, "text/html", 220)).toBeNull();
  });

  it("rejects SVG (script execution from our own origin)", () => {
    expect(acceptGravatarResponse(200, "image/svg+xml", 1200)).toBeNull();
  });

  it("rejects empty bodies, oversized payloads and unknown types", () => {
    expect(acceptGravatarResponse(200, "image/png", 0)).toBeNull();
    expect(acceptGravatarResponse(200, "image/png", 512 * 1024 + 1)).toBeNull();
    expect(acceptGravatarResponse(200, "text/html", 500)).toBeNull();
    expect(acceptGravatarResponse(200, null, 500)).toBeNull();
    expect(acceptGravatarResponse(500, "image/png", 500)).toBeNull();
  });
});

describe("resolveGravatarPath", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(
    handler: (url: string) => {
      status: number;
      contentType?: string | null;
      bytes?: number;
    } | Promise<never>,
  ) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const result = await handler(String(input));
      return new Response(
        result.bytes
          ? new Uint8Array(result.bytes).fill(1)
          : new Uint8Array(0),
        {
          status: result.status,
          headers: result.contentType
            ? { "content-type": result.contentType }
            : {},
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("returns our own proxy path when the email has an avatar", async () => {
    const fetchMock = stubFetch(() => ({
      status: 200,
      contentType: "image/png",
      bytes: 6343,
    }));
    const email = "MyEmailAddress@example.com";
    await expect(resolveGravatarPath(email)).resolves.toBe(
      gravatarPath("0bc83cb571cd1c50ba6f3e8a78ef1346"),
    );
    expect(String(fetchMock.mock.calls[0][0])).toContain("d=404");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(email);
  });

  it("returns null when the email has no Gravatar (the initials stay)", async () => {
    stubFetch(() => ({ status: 404, contentType: "text/html", bytes: 220 }));
    await expect(resolveGravatarPath("nobody@example.com")).resolves.toBeNull();
  });

  it("returns null instead of throwing when the lookup fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    await expect(resolveGravatarPath("someone@example.com")).resolves.toBeNull();
  });
});
