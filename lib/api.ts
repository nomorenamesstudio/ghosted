import type {
  Application,
  ApplicationStatus,
  Milestone,
} from "@/lib/db/schema";
import type { ApplicationSummary } from "@/lib/services/applications";

export type { ApplicationStatus };

/* ------------------------------------------------------------------ */
/* Types shared with the client                                        */
/* ------------------------------------------------------------------ */

export interface ApplicationListItem extends Application {
  progress: number;
  currentRound: string | null;
  milestoneCount: number;
}

export interface ApplicationDetail extends Application {
  milestones: Milestone[];
  progress: number;
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
  needsAction: number;
}

export interface MilestoneResult {
  milestone: Milestone;
  application: ApplicationSummary;
}

export interface DeleteMilestoneResult {
  application: ApplicationSummary;
}

export interface ListParams {
  status?: ApplicationStatus;
  search?: string;
  sort?: "company" | "status" | "updated_at";
  page?: number;
  limit?: number;
}

export interface CreateApplicationInput {
  company: string;
  role: string;
  url?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
}

export interface UpdateApplicationInput {
  company?: string;
  role?: string;
  url?: string | null;
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
