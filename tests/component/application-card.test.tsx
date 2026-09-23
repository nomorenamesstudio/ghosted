import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

describe("ApplicationCard", () => {
  it("renders company, role, round and progress", () => {
    render(<ApplicationCard app={app} />);
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Frontend Engineer")).toBeInTheDocument();
    expect(screen.getByText("Last round: Application")).toBeInTheDocument();
    expect(screen.getByText("20%")).toBeInTheDocument();
    expect(screen.getByText("applied")).toBeInTheDocument();
  });

  it("links to the application detail page", () => {
    render(<ApplicationCard app={app} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      `/applications/${app.id}`,
    );
  });

  it("shows a company avatar with the company initial as its fallback", () => {
    render(<ApplicationCard app={app} />);
    // Radix only mounts the <img> once it has loaded, and images never load in
    // jsdom, so the monogram is what is on screen here. The image wiring itself
    // is covered in company-avatar.test.tsx.
    expect(screen.getByText("A")).toBeInTheDocument();
  });
});
