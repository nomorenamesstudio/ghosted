import { describe, expect, it } from "vitest";
import { sitemapEntries } from "@/app/sitemap";

/**
 * A private instance must advertise nothing. The positive path is covered at the
 * real boundary (e2e reads the served `/sitemap.xml`); this is the branch a
 * running hosted instance can never produce, and the one that would leak a
 * self-hoster's pages into an index if it regressed.
 */
describe("sitemapEntries", () => {
  it("lists nothing when the instance is not indexable", () => {
    expect(sitemapEntries(false, "https://ghosted.example.com")).toEqual([]);
  });
});
