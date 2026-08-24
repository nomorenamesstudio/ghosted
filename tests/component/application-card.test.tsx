import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ApplicationCard } from "@/components/ApplicationCard";
import type { ApplicationListItem } from "@/lib/api";

const app: ApplicationListItem = {
  id: "00000000-0000-4000-8000-000000000000",
  userId: "user-1",
  company: "Acme Corp",
  role: "Frontend Engineer",
  url: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  notes: null,
  status: "applied",
  displayStatus: "applied",
  archivedFromStatus: null,
  totalSteps: 5,
  createdAt: new Date(),
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
    expect(screen.getByText("Round: Application")).toBeInTheDocument();
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
});
