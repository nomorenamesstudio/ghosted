import { describe, it, expect } from "vitest";
import {
  normaliseDomain,
  companySlug,
  logoDomainCandidates,
} from "@/lib/utils/company-domain";

describe("normaliseDomain", () => {
  it("accepts URLs and bare hosts", () => {
    expect(normaliseDomain("https://stripe.com/jobs/1?a=1")).toBe("stripe.com");
    expect(normaliseDomain("  Stripe.COM  ")).toBe("stripe.com");
    expect(normaliseDomain("careers.figma.com")).toBe("careers.figma.com");
    expect(normaliseDomain("https://jobs.lever.co/acme")).toBe("jobs.lever.co");
  });

  it("strips www and trailing dots", () => {
    expect(normaliseDomain("https://www.notion.so/careers")).toBe("notion.so");
    expect(normaliseDomain("notion.so.")).toBe("notion.so");
  });

  it("rejects anything that is not a fetchable public domain", () => {
    expect(normaliseDomain(null)).toBeNull();
    expect(normaliseDomain("")).toBeNull();
    expect(normaliseDomain("localhost")).toBeNull();
    expect(normaliseDomain("192.168.0.1")).toBeNull();
    expect(normaliseDomain("http://10.0.0.5:8080/admin")).toBeNull();
    expect(normaliseDomain("http://[::1]/")).toBeNull();
    expect(normaliseDomain("javascript:alert(1)")).toBeNull();
    expect(normaliseDomain("not a domain")).toBeNull();
  });
});

describe("companySlug", () => {
  it("slugifies single-word names", () => {
    expect(companySlug("Notion")).toBe("notion");
    expect(companySlug("Stripe")).toBe("stripe");
    expect(companySlug("Zürich")).toBe("zurich");
  });

  it("refuses names that will not be a domain", () => {
    // Multi-word and digit-bearing names never live at the concatenation, and
    // guessing there is how the wrong company's logo gets shown.
    expect(companySlug("Acme Corp")).toBeNull();
    expect(companySlug("The Browser Company")).toBeNull();
    expect(companySlug("Stress Co 042")).toBeNull();
    expect(companySlug("A")).toBeNull();
    expect(companySlug("")).toBeNull();
  });
});

describe("logoDomainCandidates", () => {
  it("uses the posting host when it belongs to the employer", () => {
    expect(logoDomainCandidates("Figma", "https://careers.figma.com/job/1")).toEqual([
      "careers.figma.com",
      "figma.com",
      "figma.io",
      "figma.co",
    ]);
  });

  it("never uses a job board's own domain", () => {
    const candidates = logoDomainCandidates(
      "Acme",
      "https://boards.greenhouse.io/acme/jobs/1",
    );
    expect(candidates).not.toContain("greenhouse.io");
    expect(candidates[0]).toBe("acme.com");
  });

  it("reads the employer out of a board subdomain", () => {
    expect(
      logoDomainCandidates("Acme", "https://acme.myworkdayjobs.com/en-US/acme")[0],
    ).toBe("acme.com");
    expect(
      logoDomainCandidates("Vercel", "https://vercel.recruitee.com/o/engineer")[0],
    ).toBe("vercel.com");
  });

  it("ignores a board path that carries no employer", () => {
    expect(
      logoDomainCandidates("Acme", "https://www.linkedin.com/jobs/view/4012345"),
    ).toEqual(["acme.com", "acme.io", "acme.co"]);
  });

  it("skips reserved TLDs instead of burning a lookup", () => {
    expect(logoDomainCandidates("Stripe", "https://stripe.example/jobs/1")).toEqual([
      "stripe.com",
      "stripe.io",
      "stripe.co",
    ]);
  });

  it("falls back to the company name when there is no URL at all", () => {
    expect(logoDomainCandidates("Linear", null)[0]).toBe("linear.com");
  });

  it("returns nothing when nothing can be derived", () => {
    expect(logoDomainCandidates("Stress Co 042", null)).toEqual([]);
    expect(logoDomainCandidates("", null)).toEqual([]);
  });

  describe("explicit company website", () => {
    it("wins over the posting host and every guess", () => {
      expect(
        logoDomainCandidates(
          "Acme",
          "https://www.linkedin.com/jobs/view/4012345",
          "https://acme-real.example.com/careers",
        ),
      ).toEqual(["acme-real.example.com", "acme.com", "acme.io", "acme.co"]);
    });

    it("accepts a bare domain, which is what the form asks for", () => {
      expect(logoDomainCandidates("Initech", null, "stripe.com")[0]).toBe(
        "stripe.com",
      );
    });

    it("is deduplicated when it matches the posting host", () => {
      expect(
        logoDomainCandidates("Figma", "https://figma.com/jobs/1", "figma.com"),
      ).toEqual(["figma.com", "figma.io", "figma.co"]);
    });

    it("falls back to the normal chain when it is empty or unusable", () => {
      expect(logoDomainCandidates("Linear", null, "")[0]).toBe("linear.com");
      expect(logoDomainCandidates("Linear", null, null)[0]).toBe("linear.com");
      expect(logoDomainCandidates("Linear", null, "not a domain")).toEqual([
        "linear.com",
        "linear.io",
        "linear.co",
      ]);
      expect(logoDomainCandidates("Linear", null, "acme.example")).toEqual([
        "linear.com",
        "linear.io",
        "linear.co",
      ]);
    });

    it("cannot be used to point a fetch at an internal address", () => {
      expect(logoDomainCandidates("Linear", null, "http://10.0.0.5:8080")).toEqual(
        ["linear.com", "linear.io", "linear.co"],
      );
      expect(logoDomainCandidates("Linear", null, "localhost")).toEqual([
        "linear.com",
        "linear.io",
        "linear.co",
      ]);
    });
  });

  it("deduplicates and caps the probe list", () => {
    const candidates = logoDomainCandidates("Acme", "https://acme.com/careers");
    expect(candidates).toEqual(["acme.com", "acme.io", "acme.co"]);
    expect(candidates.length).toBeLessThanOrEqual(5);
  });
});
