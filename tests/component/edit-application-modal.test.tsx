import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApplicationDetail } from "@/lib/api";

const updateApplication = vi.fn();
const getRoles = vi.fn();

vi.mock("@/lib/api", () => ({
  updateApplication: (...args: unknown[]) => updateApplication(...args),
  getRoles: () => getRoles(),
  ApiClientError: class ApiClientError extends Error {},
}));

import { EditApplicationModal } from "@/components/EditApplicationModal";

// Radix Select uses the pointer-capture and scroll APIs, which jsdom does not
// implement. Never called for real here - the select just has to open.
Element.prototype.hasPointerCapture = () => false;
Element.prototype.setPointerCapture = () => {};
Element.prototype.releasePointerCapture = () => {};
Element.prototype.scrollIntoView = () => {};

const app: ApplicationDetail = {
  id: "00000000-0000-4000-8000-000000000000",
  userId: "00000000-0000-4000-8000-0000000000ff",
  company: "Acme Corp",
  role: "Frontend Engineer",
  url: null,
  companyWebsite: null,
  contactName: null,
  contactEmail: null,
  contactPhone: null,
  notes: "Referral from Sam",
  status: "applied",
  isFavorite: false,
  archivedFromStatus: null,
  totalSteps: 1,
  createdAt: new Date("2026-08-01T00:00:00.000Z"),
  updatedAt: new Date("2026-08-01T00:00:00.000Z"),
  milestones: [],
  progress: 20,
  displayStatus: "applied",
};

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onOpenChange = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <EditApplicationModal app={app} open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

beforeEach(() => {
  updateApplication.mockReset();
  updateApplication.mockResolvedValue({ data: app });
  getRoles.mockReset();
  getRoles.mockResolvedValue({ data: [] });
});

describe("EditApplicationModal", () => {
  it("sends only the fields that changed", async () => {
    // Regression: the modal PATCHed the whole form, status included. A PATCH
    // that repeats the current status counts as a state change server-side and
    // restarts the ghosted clock - so editing a note revived a ghosted
    // application. A PATCH is a diff, not a full row.
    const user = userEvent.setup();
    setup();

    const notes = screen.getByLabelText("Notes");
    await user.clear(notes);
    await user.type(notes, "HR screen went well");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateApplication).toHaveBeenCalledTimes(1));
    expect(updateApplication).toHaveBeenCalledWith(app.id, {
      notes: "HR screen went well",
    });
  });

  it("sends the status when the status is what changed", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(screen.getByRole("combobox", { name: /status/i }));
    await user.click(await screen.findByRole("option", { name: "Interviewing" }));
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(updateApplication).toHaveBeenCalledTimes(1));
    expect(updateApplication).toHaveBeenCalledWith(app.id, {
      status: "interviewing",
    });
  });

  it("does not call the API when nothing changed", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = setup();

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(updateApplication).not.toHaveBeenCalled();
  });
});
