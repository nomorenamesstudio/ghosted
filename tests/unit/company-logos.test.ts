import { describe, it, expect } from "vitest";
import { acceptUpstream } from "@/lib/services/company-logos";

/**
 * Pinned to what the two favicon services actually do (verified with curl):
 * Google answers 404 *with* a 726-byte default globe, and DuckDuckGo answers
 * 200 with a zero-byte text/plain body for a domain that has no icon. Trusting
 * the status code alone would cache the globe as if it were a logo.
 */
describe("acceptUpstream", () => {
  it("accepts raster icons", () => {
    expect(acceptUpstream(200, "image/png", 6343)).toBe("image/png");
    expect(acceptUpstream(200, "image/x-icon", 32038)).toBe("image/x-icon");
    expect(acceptUpstream(200, "image/png; charset=utf-8", 900)).toBe("image/png");
  });

  it("treats Google's 404-with-a-globe as no logo", () => {
    expect(acceptUpstream(404, "image/png", 726)).toBeNull();
  });

  it("treats DuckDuckGo's 200-with-an-empty-body as no logo", () => {
    expect(acceptUpstream(200, "text/plain;charset=US-ASCII", 0)).toBeNull();
  });

  it("rejects SVG (script execution from our own origin)", () => {
    expect(acceptUpstream(200, "image/svg+xml", 1200)).toBeNull();
  });

  it("rejects oversized payloads and unknown types", () => {
    expect(acceptUpstream(200, "image/png", 64 * 1024 + 1)).toBeNull();
    expect(acceptUpstream(200, "text/html", 500)).toBeNull();
    expect(acceptUpstream(200, null, 500)).toBeNull();
    expect(acceptUpstream(500, "image/png", 500)).toBeNull();
  });
});
