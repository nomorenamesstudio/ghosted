import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useApplicationMove } from "@/components/use-application-move";

const updateApplication = vi.fn();
vi.mock("@/lib/api", () => ({
  updateApplication: (...args: unknown[]) => updateApplication(...args),
}));

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useApplicationMove(), { wrapper });
  return { qc, invalidate, result };
}

/** The query keys `invalidateQueries` was called with, in call order. */
function invalidatedKeys(spy: MockInstance) {
  return spy.mock.calls.map((c) =>
    JSON.stringify((c[0] as { queryKey?: unknown })?.queryKey),
  );
}

beforeEach(() => {
  updateApplication.mockReset();
  updateApplication.mockResolvedValue({ data: {} });
});

describe("useApplicationMove", () => {
  it("writes the new status", async () => {
    const { result } = setup();
    result.current.handleMove("app-1", "applied", "interviewing");
    await waitFor(() => expect(updateApplication).toHaveBeenCalled());
    expect(updateApplication).toHaveBeenCalledWith("app-1", {
      status: "interviewing",
    });
  });

  it("refreshes only the sections the move can have changed", async () => {
    // The board's optimistic detach is deliberately absent here, but the narrow
    // invalidation is not: refetching all six sections for a menu selection
    // costs five requests the card cannot have appeared in.
    const { invalidate, result } = setup();
    result.current.handleMove("app-1", "applied", "rejected");
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["applications", "section", "applied"],
      }),
    );
    const keys = invalidatedKeys(invalidate);
    expect(keys).toContain('["applications","section","applied"]');
    expect(keys).toContain('["applications","section","rejected"]');
    expect(keys).toContain('["stats"]');
    expect(keys).toContain('["application","app-1"]');
    expect(keys).not.toContain('["applications","section","offer"]');
  });

  it("refreshes the ghosted section when the target is applied or interviewing", async () => {
    // A stale applied application is displayed in "ghosted" too, so that
    // section changes even though its status does not.
    const { invalidate, result } = setup();
    result.current.handleMove("app-1", "applied", "interviewing");
    await waitFor(() =>
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: ["applications", "section", "interviewing"],
      }),
    );
    expect(invalidatedKeys(invalidate)).toContain(
      '["applications","section","ghosted"]',
    );
  });

  it("surfaces the failure message and does not swallow it", async () => {
    updateApplication.mockRejectedValue(new Error("Status is not settable"));
    const { result } = setup();
    result.current.handleMove("app-1", "applied", "offer");
    await waitFor(() =>
      expect(result.current.moveError).toBe("Status is not settable"),
    );
  });
});
