import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApplicationCard } from "@/components/ApplicationCard";
import type { ApplicationListItem } from "@/lib/api";

const app: ApplicationListItem = {
  id: "00000000-0000-4000-8000-000000000000",
  company: "Acme Corp",
  role: "Frontend Engineer",
  url: null,
  companyWebsite: null,
  status: "applied",
  displayStatus: "applied",
  isFavorite: false,
  totalSteps: 5,
  updatedAt: new Date(),
  progress: 20,
  currentRound: "Application",
  milestoneCount: 5,
};

function setup(overrides: Partial<ApplicationListItem> = {}) {
  const onMove = vi.fn();
  render(<ApplicationCard app={{ ...app, ...overrides }} onMove={onMove} />);
  return { onMove };
}

describe("ApplicationCard", () => {
  it("renders company, role, round and progress", () => {
    setup();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Last round: Application")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("applied")).toBeInTheDocument();
  });

  it("links to the application detail page", () => {
    setup();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `/applications/${app.id}`,
    );
  });

  it("shows a company avatar with the company initial as its fallback", () => {
    setup();
    // Radix only mounts the <img> once it has loaded, and images never load in
    // jsdom, so the monogram is what is on screen here. The image wiring itself
    // is covered in company-avatar.test.tsx.
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("keeps the 'Last round' separator with the date it separates", () => {
    // The pair sits on one line and wraps to two when it does not fit — most
    // often on a phone. As its own flex item the "·" would be left dangling at
    // the end of the first line, so it travels inside the date's element.
    setup();
    const dot = screen.getByText("·");
    expect(dot.parentElement?.textContent).toContain("Updated");
  });
});

describe("ApplicationCard — the Move to menu", () => {
  it("sits outside the link, so opening it cannot navigate", () => {
    // The card is wrapped in a <Link>: a trigger inside it would follow the
    // href on the same click that opens the menu.
    setup();
    const trigger = screen.getByRole("button", {
      name: /Move Acme Corp to another status/,
    });
    expect(screen.getByRole("link").contains(trigger)).toBe(false);
  });

  it("moves the card to the chosen status, naming where it came from", async () => {
    const user = userEvent.setup();
    const { onMove } = setup({ displayStatus: "ghosted" });
    await user.click(
      screen.getByRole("button", { name: /Move Acme Corp to another status/ }),
    );
    await user.click(await screen.findByRole("menuitem", { name: /Rejected/ }));
    expect(onMove).toHaveBeenCalledWith(
      app.id,
      "ghosted",
      "rejected",
      "Acme Corp",
    );
  });

  it("does not offer the status the card is already in", async () => {
    const user = userEvent.setup();
    setup();
    await user.click(
      screen.getByRole("button", { name: /Move Acme Corp to another status/ }),
    );
    // The card is "applied": every other target is listed, that one is not.
    expect(screen.queryByRole("menuitem", { name: /Applied/ })).toBeNull();
    expect(
      await screen.findByRole("menuitem", { name: /Interviewing/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Archived/ })).toBeInTheDocument();
  });
});
