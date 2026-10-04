import { describe, expect, it, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

/**
 * The deployment decisions middleware owns, tested here because the e2e server
 * runs one fixed shape: this is the only place the *other* shapes can be
 * exercised — the landing switched off, and an instance that is not meant to be
 * found. Both are read from the live environment on every request, which is the
 * whole reason they live in middleware rather than in a prerendered page.
 */
const saved = { ...process.env };

afterEach(() => {
  delete process.env.SHOW_LANDING;
  delete process.env.SITE_INDEXABLE;
  Object.assign(process.env, saved);
});

function run(path: string) {
  return middleware(new NextRequest(new URL(path, "http://ghosted.test")));
}

describe("middleware", () => {
  it("sends `/` to the sign-in screen when the landing is switched off", () => {
    process.env.SHOW_LANDING = "false";
    const res = run("/");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://ghosted.test/login");
  });

  it("leaves the landing alone by default, and does not touch other routes", () => {
    expect(run("/").headers.get("location")).toBeNull();
    process.env.SHOW_LANDING = "false";
    expect(run("/privacy").headers.get("location")).toBeNull();
  });

  it("tells crawlers to stay away unless the instance opted in", () => {
    // A self-hosted shape is private by default: the same rule lib/site.ts
    // applies for the metadata, applied here where it survives prerendering.
    // A page, not `/`: the redirect that `/` answers with is not indexed and
    // carries no header of its own.
    process.env.SHOW_LANDING = "false";
    expect(run("/privacy").headers.get("X-Robots-Tag")).toBe("noindex, nofollow");

    // The hosted shape is meant to be found.
    delete process.env.SHOW_LANDING;
    expect(run("/privacy").headers.get("X-Robots-Tag")).toBeNull();

    // And an explicit answer wins over the shape in both directions.
    process.env.SITE_INDEXABLE = "true";
    process.env.SHOW_LANDING = "false";
    expect(run("/privacy").headers.get("X-Robots-Tag")).toBeNull();
    delete process.env.SHOW_LANDING;
    process.env.SITE_INDEXABLE = "false";
    expect(run("/privacy").headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });

  it("keeps authenticated API responses out of the browser cache", () => {
    expect(run("/api/applications").headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not turn a typo into a redirect or a 500", () => {
    // Lenient by design: the strict reader in lib/config/flags.ts reports this
    // and stops the boot; middleware must not fail every request instead.
    process.env.SHOW_LANDING = "flase";
    const res = run("/");
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});
