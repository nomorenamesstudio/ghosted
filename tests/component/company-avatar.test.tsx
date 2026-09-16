import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompanyAvatar } from "@/components/CompanyAvatar";

/**
 * Radix only mounts the <img> once the image reports itself as loaded, and
 * jsdom never loads images. `getImageLoadingStatus` reads `complete` and
 * `naturalWidth`, so a stub that reports both is enough to exercise the real
 * component.
 */
class LoadedImage {
  complete = true;
  naturalWidth = 128;
  crossOrigin: string | null = null;
  referrerPolicy = "";
  src = "";
  addEventListener() {}
  removeEventListener() {}
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CompanyAvatar", () => {
  it("points at the logo route, versioned by updatedAt", () => {
    vi.stubGlobal("Image", LoadedImage);
    render(
      <CompanyAvatar
        applicationId="abc-123"
        company="Notion"
        version="2026-09-01T10:00:00.000Z"
      />,
    );

    const img = document.querySelector("img");
    expect(img).toHaveAttribute(
      "src",
      `/logos/abc-123?v=${new Date("2026-09-01T10:00:00.000Z").getTime()}`,
    );
    expect(img).toHaveAttribute("alt", "");
  });

  it("falls back to the company initial when the logo never loads", () => {
    render(<CompanyAvatar applicationId="abc-123" company="notion" />);
    expect(screen.getByText("N")).toBeInTheDocument();
  });

  it("scales to the detail page headline", () => {
    render(
      <CompanyAvatar applicationId="abc-123" company="notion" size="md" />,
    );
    const chip = screen.getByText("N");
    expect(chip).toHaveClass("rounded-lg", "text-[13px]");
    // The box itself is the Avatar root.
    expect(chip.parentElement).toHaveClass("h-8", "w-8", "shrink-0");
  });

  it("matches the card's company + role block at size lg", () => {
    // 36px: the card's company line (20) plus its role line (16).
    render(
      <CompanyAvatar applicationId="abc-123" company="notion" size="lg" />,
    );
    const chip = screen.getByText("N");
    expect(chip).toHaveClass("rounded-lg", "text-[13px]");
    expect(chip.parentElement).toHaveClass("h-9", "w-9");
  });

  it("renders a placeholder initial for an empty company name", () => {
    render(<CompanyAvatar applicationId="abc-123" company="   " />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});
