"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { getApplications, type ApplicationStatus } from "@/lib/api";
import { ApplicationCard } from "./ApplicationCard";
import { AddApplicationModal } from "./AddApplicationModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STATUS_OPTIONS: Array<{ value: "" | ApplicationStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "archived", label: "Archived" },
];

const SORT_OPTIONS = [
  { value: "updated_at", label: "Last updated" },
  { value: "company", label: "Company" },
  { value: "status", label: "Status" },
] as const;

export function ApplicationList() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<"" | ApplicationStatus>("");
  const [sort, setSort] = useState<"company" | "status" | "updated_at">(
    "updated_at",
  );
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  // Debounce search input (300ms).
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isPending, isError, error, isFetching } = useQuery({
    queryKey: ["applications", { search: debouncedSearch, status, sort, page }],
    queryFn: () =>
      getApplications({
        search: debouncedSearch || undefined,
        status: status || undefined,
        sort,
        page,
        limit: 10,
      }),
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search company or role…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            aria-label="Search applications"
          />
        </div>
        <div className="flex flex-1 items-center gap-2 sm:justify-start">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "" | ApplicationStatus);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as typeof sort);
              setPage(1);
            }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Sort applications"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Sort: {o.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            data-testid="add-application-fab"
            className="ml-auto"
            onClick={() => setAddOpen(true)}
          >
            <Plus />
            Add
          </Button>
        </div>
      </div>

      {isFetching && (
        <p className="text-xs text-muted-foreground" data-testid="list-loading">
          Refreshing…
        </p>
      )}

      {isError && (
        <p role="alert" className="text-sm text-destructive">
          {(error as Error).message}
        </p>
      )}

      {isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border bg-muted/40"
            />
          ))}
        </div>
      ) : data && data.data.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          {debouncedSearch || status
            ? "No applications match your filters."
            : "No applications yet — tap Add to create your first one."}
        </div>
      ) : (
        <ul className="space-y-2" data-testid="application-list">
          {data?.data.map((app) => (
            <ApplicationCard key={app.id} app={app} />
          ))}
        </ul>
      )}

      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span className="text-muted-foreground">
            Page {data.pagination.page} of {data.pagination.totalPages} ·{" "}
            {data.pagination.total} total
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.pagination.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      <AddApplicationModal open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
}
