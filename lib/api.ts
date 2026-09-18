import type {
  Application,
  ApplicationStatus,
  Milestone,
} from "@/lib/db/schema";
import type { ApplicationSummary } from "@/lib/services/applications";
import type { DisplayStatus } from "@/lib/utils/status";

export type { ApplicationStatus, DisplayStatus };

/* ------------------------------------------------------------------ */
/* Types shared with the client                                        */
/* ------------------------------------------------------------------ */

export interface ApplicationListItem extends Application {
  progress: number;
  currentRound: string | null;
  milestoneCount: number;
  /** Effective status — "ghosted" when the app is stale (time-derived). */
  displayStatus: DisplayStatus;
}

export interface ApplicationDetail extends Application {
  milestones: Milestone[];
  progress: number;
  /** Effective status — "ghosted" when the app is stale (time-derived). */
  displayStatus: DisplayStatus;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApplicationsResult {
  data: ApplicationListItem[];
  pagination: Pagination;
}

export interface DashboardStats {
  total: number;
  active: number;
  interviewing: number;
  offers: number;
  rejected: number;
  ghosted: number;
}

export interface MilestoneResult {
  milestone: Milestone;
  application: ApplicationSummary;
}

export interface DeleteMilestoneResult {
  application: ApplicationSummary;
}

export interface ListParams {
  status?: DisplayStatus;
  search?: string;
  sort?: "company" | "status" | "updated_at" | "progress";
  page?: number;
  limit?: number;
}

export interface CreateApplicationInput {
  company: string;
  role: string;
  url?: string | null;
  /** Employer's site, used for the logo - a bare domain (`stripe.com`) is fine. */
  companyWebsite?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export interface UpdateApplicationInput {
  company?: string;
  role?: string;
  url?: string | null;
  companyWebsite?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  status?: ApplicationStatus;
}

export interface CreateMilestoneInput {
  title: string;
  position?: number;
  date?: string | null;
  comment?: string | null;
}

export interface UpdateMilestoneInput {
  title?: string;
  status?: Milestone["status"];
  date?: string | null;
  comment?: string | null;
}

/* ------------------------------------------------------------------ */
/* Fetch helper with consistent error handling                         */
/* ------------------------------------------------------------------ */

export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body?.code ?? "UNKNOWN_ERROR",
      body?.error ?? `Request failed (${res.status})`,
      body?.details,
    );
  }
  return body as T;
}

/* ------------------------------------------------------------------ */
/* Endpoints                                                           */
/* ------------------------------------------------------------------ */

/** Role titles this user has used before, most recent first. */
export function getRoles(): Promise<{ data: string[] }> {
  return request("/api/applications/roles");
}

export function getApplications(params: ListParams = {}): Promise<ApplicationsResult> {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.search) qs.set("search", params.search);
  if (params.sort) qs.set("sort", params.sort);
  if (params.page) qs.set("page", String(params.page));
  if (params.limit) qs.set("limit", String(params.limit));
  const query = qs.toString();
  return request<ApplicationsResult>(`/api/applications${query ? `?${query}` : ""}`);
}

export function getApplication(id: string): Promise<{ data: ApplicationDetail }> {
  return request<{ data: ApplicationDetail }>(`/api/applications/${id}`);
}

export function createApplication(
  input: CreateApplicationInput,
): Promise<{ data: ApplicationDetail }> {
  return request("/api/applications", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateApplication(
  id: string,
  input: UpdateApplicationInput,
): Promise<{ data: Application }> {
  return request(`/api/applications/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteApplication(id: string): Promise<void> {
  return request<void>(`/api/applications/${id}`, { method: "DELETE" });
}

/** Restore an archived application to its pre-archive status. */
export function reopenApplication(id: string): Promise<{ data: Application }> {
  return request(`/api/applications/${id}/reopen`, { method: "POST" });
}

/** Every step back to `pending` with its date cleared - the process starts over. */
export function resetTimeline(id: string): Promise<{ data: Application }> {
  return request(`/api/applications/${id}/milestones/reset`, { method: "POST" });
}

/** Toggle the favourite flag (favourites are pinned to the top of lists). */
export function toggleFavorite(id: string): Promise<{ data: Application }> {
  return request(`/api/applications/${id}/favorite`, { method: "POST" });
}

export function addMilestone(
  applicationId: string,
  input: CreateMilestoneInput,
): Promise<{ data: MilestoneResult }> {
  return request(`/api/applications/${applicationId}/milestones`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateMilestone(
  id: string,
  input: UpdateMilestoneInput,
): Promise<{ data: MilestoneResult }> {
  return request(`/api/milestones/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deleteMilestone(
  id: string,
): Promise<{ data: DeleteMilestoneResult }> {
  return request(`/api/milestones/${id}`, { method: "DELETE" });
}

export function getStats(): Promise<{ data: DashboardStats }> {
  return request("/api/dashboard/stats");
}
