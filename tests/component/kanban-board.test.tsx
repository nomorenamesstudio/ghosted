import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApplicationListItem } from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";

const getApplications = vi.fn();
vi.mock("@/lib/api", () => ({
  getApplications: (...args: unknown[]) => getApplications(...args),
  updateApplication: vi.fn(),
  addMilestone: vi.fn(),
  resetTimeline: vi.fn(),
}));

function app(id: string): ApplicationListItem {
  return {
    id,
    userId: "user-1",
    company: `Company ${id}`,
    role: "Engineer",
    url: null,
    companyWebsite: null,
    contactName: null,
    contactEmail: null,
    contactPhone: null,
    notes: null,
    status: "applied",
    displayStatus: "applied",
    isFavorite: false,
    archivedFromStatus: null,
    totalSteps: 5,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-10T00:00:00.000Z"),
    progress: 20,
    milestoneCount: 5,
    currentRound: null,
  };
}

function board(qc: QueryClient, search: string) {
  return (
    <QueryClientProvider client={qc}>
      <KanbanBoard
        search={search}
        sort="updated_at"
        onAdd={() => {}}
        patienceDays={10}
      />
    </QueryClientProvider>
  );
}

function newClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
}

const cardCount = () =>
  document.querySelectorAll('[data-testid^="kanban-card-"]').length;

beforeEach(() => {
  getApplications.mockReset();
  // Searching matches nothing; without a search the applied column has two.
  getApplications.mockImplementation((q: { search?: string }) => {
    const items = q?.search ? [] : [app("a"), app("b")];
    return Promise.resolve({
      data: items,
      pagination: {
        page: 1,
        limit: 50,
        total: items.length,
        totalPages: 1,
      },
    });
  });
});

describe("KanbanBoard", () => {
  it("renders a column per status and the cards the API returns", async () => {
    render(board(newClient(), ""));
    await waitFor(() => expect(cardCount()).toBe(12)); // six columns × two
    expect(
      document.querySelectorAll('[data-testid^="kanban-column-"]'),
    ).toHaveLength(6);
  });

  it("comes back after a search that matches nothing", async () => {
    // Regression: the columns own the queries, so unmounting them while every
    // column read 0 left nothing to refetch - clearing the search showed
    // "No applications yet" forever.
    const qc = newClient();
    const { rerender } = render(board(qc, ""));
    await waitFor(() => expect(cardCount()).toBe(12));

    rerender(board(qc, "zzz"));
    await waitFor(() =>
      expect(
        screen.getByText("No applications match your filters."),
      ).toBeInTheDocument(),
    );
    expect(cardCount()).toBe(0);

    await act(async () => {
      rerender(board(qc, ""));
    });
    await waitFor(() => expect(cardCount()).toBe(12));
    expect(
      screen.queryByText("No applications match your filters."),
    ).not.toBeInTheDocument();
  });
});
