import { describe, expect, it } from "vitest";
import { urlMatchKey } from "@/lib/utils/application-url";

/**
 * One posting, many strings.
 *
 * The contract this pins: an automation that sees the same job twice — from a
 * digest, a retry, a different board, a tracked link — produces the same key, so
 * `find_or_create_application` updates instead of filing a duplicate. The other
 * half matters just as much: two *different* postings must never share a key,
 * because that would silently merge one application into another.
 */
describe("urlMatchKey", () => {
  const greenhouse = "boards.greenhouse.io/acme/jobs/123";

  it("ignores the noise that tracking and formatting add", () => {
    const variants = [
      "https://boards.greenhouse.io/acme/jobs/123",
      "http://boards.greenhouse.io/acme/jobs/123",
      "https://www.boards.greenhouse.io/acme/jobs/123",
      "https://boards.greenhouse.io/acme/jobs/123/",
      "https://boards.greenhouse.io/acme/jobs/123#apply",
      "https://boards.greenhouse.io/acme/jobs/123?utm_source=linkedin",
      "https://boards.greenhouse.io/acme/jobs/123?utm_source=linkedin&utm_campaign=x&gh_src=abc",
      "  https://BOARDS.greenhouse.io/acme/jobs/123  ",
      greenhouse,
    ];
    for (const variant of variants) {
      expect(urlMatchKey(variant), variant).toBe(greenhouse.replace("boards", "boards"));
    }
  });

  it("keeps the query parameters that identify the posting", () => {
    const a = urlMatchKey("https://acme.wd1.myworkdayjobs.com/job/123?jobId=R-100");
    const b = urlMatchKey("https://acme.wd1.myworkdayjobs.com/job/123?jobId=R-200");
    expect(a).not.toBe(b);

    // …and sorts them, so their order does not matter.
    expect(urlMatchKey("https://x.test/j?a=1&b=2")).toBe(
      urlMatchKey("https://x.test/j?b=2&a=1"),
    );

    // Tracking is dropped even when it sits beside a real parameter.
    expect(urlMatchKey("https://x.test/j?jobId=R-1&utm_medium=email")).toBe(
      urlMatchKey("https://x.test/j?jobId=R-1"),
    );
  });

  it("never merges two different postings", () => {
    expect(urlMatchKey("https://x.test/jobs/123")).not.toBe(
      urlMatchKey("https://x.test/jobs/124"),
    );
    expect(urlMatchKey("https://x.test/jobs/123")).not.toBe(
      urlMatchKey("https://other.test/jobs/123"),
    );
  });

  it("returns null when there is nothing to key on", () => {
    expect(urlMatchKey(null)).toBeNull();
    expect(urlMatchKey(undefined)).toBeNull();
    expect(urlMatchKey("   ")).toBeNull();
  });
});
