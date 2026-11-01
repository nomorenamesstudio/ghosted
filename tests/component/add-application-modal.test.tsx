import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const createApplication = vi.fn();
const matchApplications = vi.fn();

vi.mock("@/lib/api", () => ({
  createApplication: (...args: unknown[]) => createApplication(...args),
  matchApplications: (...args: unknown[]) => matchApplications(...args),
  ApiClientError: class ApiClientError extends Error {},
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import { AddApplicationModal } from "@/components/AddApplicationModal";

/**
 * The duplicate notice, from the user's side.
 *
 * The rule this pins: a live duplicate is flagged and does not create anything on
 * the first press, a second press is what files it, and a closed duplicate (the
 * old one was rejected or archived) is offered as a reapplication — because that
 * is a real thing people do, not a mistake to talk them out of.
 */
function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <AddApplicationModal open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

function match(verdict: "active" | "closed", status: "applied" | "rejected") {
  return {
    data: {
      verdict,
      matches: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          company: "Acme Corp",
          role: "Frontend Engineer",
          status,
          updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        },
      ],
    },
  };
}

async function fillAndSubmit() {
  await userEvent.type(screen.getByLabelText("Company *"), "Acme Corp");
  await userEvent.type(screen.getByLabelText("Role *"), "Frontend Engineer");
  await userEvent.click(screen.getByRole("button", { name: /add application/i }));
}

beforeEach(() => {
  createApplication.mockReset();
  matchApplications.mockReset();
  createApplication.mockResolvedValue({ data: { status: "applied" } });
});

describe("AddApplicationModal", () => {
  it("files straight away when nothing matches", async () => {
    matchApplications.mockResolvedValue({
      data: { matches: [], verdict: "none" },
    });
    setup();
    await fillAndSubmit();

    await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("flags a live duplicate and files nothing until the second press", async () => {
    matchApplications.mockResolvedValue(match("active", "applied"));
    setup();
    await fillAndSubmit();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Acme Corp — Frontend Engineer");
    expect(notice).toHaveTextContent("already on your board");
    expect(createApplication).not.toHaveBeenCalled();

    // The way out is a link to the row that already exists.
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute(
      "href",
      "/applications/00000000-0000-4000-8000-000000000001",
    );

    await userEvent.click(
      screen.getByRole("button", { name: /file a second one anyway/i }),
    );
    await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
  });

  it("offers the reapplication when the previous one was rejected", async () => {
    matchApplications.mockResolvedValue(match("closed", "rejected"));
    setup();
    await fillAndSubmit();

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("already on your board (rejected)");
    expect(notice).toHaveTextContent("reapplication");
    expect(screen.getByRole("link", { name: "Open the old one" })).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: /file it again/i }));
    await waitFor(() => expect(createApplication).toHaveBeenCalledTimes(1));
  });

  it("re-checks after the form changes, instead of reusing a stale answer", async () => {
    matchApplications.mockResolvedValue(match("active", "applied"));
    setup();
    await fillAndSubmit();
    await screen.findByRole("status");

    await userEvent.type(screen.getByLabelText("Role *"), " II");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
