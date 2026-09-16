import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ApplicationListItem } from "@/lib/api";
import { useApplicationSection } from "@/components/use-application-section";

const getApplications = vi.fn();
vi.mock("@/lib/api", () => ({
  getApplications: (...args: unknown[]) => getApplications(...args),
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

function result(ids: string[]) {
  return {
    data: ids.map(app),
    pagination: { page: 1, limit: 50, total: ids.length, totalPages: 1 },
  };
}

function Harness() {
  const { items, total } = useApplicationSection({
    status: "applied",
    search: "",
    sort: "updated_at",
    onTotalChange: () => {},
  });
  return (
    <ul>
      <li data-testid="total">{total}</li>
      {items.map((a) => (
        <li key={a.id} data-testid="item">
          {a.id}
        </li>
      ))}
    </ul>
  );
}

function renderHarness(): QueryClient {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  render(
    <QueryClientProvider client={qc}>
      <Harness />
    </QueryClientProvider>,
  );
  return qc;
}

beforeEach(() => {
  getApplications.mockReset();
});

describe("useApplicationSection", () => {
  it("lists what the server returns", async () => {
    getApplications.mockResolvedValue(result(["a", "b"]));
    renderHarness();

    await waitFor(() => expect(screen.getAllByTestId("item")).toHaveLength(2));
    expect(screen.getByTestId("total")).toHaveTextContent("2");
  });

  it("drops a card that has left the group instead of leaving a stale tail", async () => {
    // Regression: moving an application to another status used to leave the old
    // entry behind, so the same card rendered twice in a single column.
    getApplications.mockResolvedValueOnce(result(["a", "b"]));
    const qc = renderHarness();
    await waitFor(() => expect(screen.getAllByTestId("item")).toHaveLength(2));

    getApplications.mockResolvedValue(result(["a"]));
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["applications"] });
    });

    await waitFor(() => expect(screen.getAllByTestId("item")).toHaveLength(1));
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.queryByText("b")).not.toBeInTheDocument();
  });
});
