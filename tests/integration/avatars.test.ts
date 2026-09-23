import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The route is the piece that decides what the browser ends up caching, so
 * these assert the headers, not just the status: a hit cached for a week is the
 * entire point (Gravatar itself only allows `max-age=300`), and a miss has to
 * fall through to the initials fallback exactly like a user with no avatar.
 */
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { GET } from "@/app/avatars/[hash]/route";

const authMock = vi.mocked(auth as unknown as () => Promise<unknown>);

const HASH = "a957567ba0ce0106c0d1cfa646acdb71";
const base = "http://localhost/avatars";

function get(hash = HASH, init?: RequestInit) {
  return GET(new Request(`${base}/${hash}`, init), {
    params: { hash },
  });
}

function stubFetch(response: {
  status: number;
  contentType?: string | null;
  bytes?: number;
}) {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) =>
    Promise.resolve(
      new Response(
        response.bytes ? new Uint8Array(response.bytes).fill(7) : new Uint8Array(0),
        {
          status: response.status,
          headers: response.contentType
            ? { "content-type": response.contentType }
            : {},
        },
      ),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  authMock.mockResolvedValue({ user: { id: "user-1" } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /avatars/[hash]", () => {
  it("serves the avatar from our own origin, cached for a week", async () => {
    const fetchMock = stubFetch({
      status: 200,
      contentType: "image/png",
      bytes: 6343,
    });

    const res = await get();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe("6343");
    expect(res.headers.get("cache-control")).toBe(
      "private, max-age=604800, stale-while-revalidate=86400",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await res.arrayBuffer()).byteLength).toBe(6343);

    // The upstream request must ask for 404-on-missing, never a placeholder.
    const upstream = String(fetchMock.mock.calls[0][0]);
    expect(upstream).toContain(`gravatar.com/avatar/${HASH}`);
    expect(upstream).toContain("d=404");
  });

  it("404s for a gravatar that does not exist, with a short cache", async () => {
    stubFetch({ status: 404, contentType: "text/html", bytes: 220 });

    const res = await get();

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });

  it("404s for a malformed hash without calling upstream", async () => {
    const fetchMock = stubFetch({ status: 200, contentType: "image/png", bytes: 10 });

    const res = await get("not-a-hash");

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s for an unauthenticated request without calling upstream", async () => {
    authMock.mockResolvedValue(null);
    const fetchMock = stubFetch({ status: 200, contentType: "image/png", bytes: 10 });

    const res = await get();

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s when upstream returns a non-image body", async () => {
    stubFetch({ status: 200, contentType: "text/html", bytes: 500 });
    expect((await get()).status).toBe(404);

    stubFetch({ status: 200, contentType: "image/svg+xml", bytes: 500 });
    expect((await get()).status).toBe(404);
  });

  it("404s instead of throwing when the upstream fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );

    const res = await get();

    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
  });
});
