import type {
  AccountStatus,
  DailyTraffic,
  FormSubmission,
  PostDetail,
  PostListResponse,
  SortField,
  SyncRun,
  TopPage,
  WixStatus,
  WixSyncRun,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${body}`);
  }
  return resp.json() as Promise<T>;
}

export function getInstagramStatus(): Promise<AccountStatus> {
  return request("/api/instagram/status");
}

export function triggerInstagramSync(): Promise<SyncRun> {
  return request("/api/instagram/sync", { method: "POST" });
}

export function instagramOAuthStartUrl(): string {
  return `${API_BASE_URL}/api/instagram/oauth/start`;
}

export interface ListPostsParams {
  platform?: string;
  media_type?: string;
  media_product_type?: string;
  sort_by?: SortField;
  order?: "asc" | "desc";
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export function listPosts(params: ListPostsParams = {}): Promise<PostListResponse> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return request(`/api/posts${qs ? `?${qs}` : ""}`);
}

export function getPost(id: string): Promise<PostDetail> {
  return request(`/api/posts/${id}`);
}

export interface ManualMetricsInput {
  profile_visits: number | null;
  bio_link_taps: number | null;
  follows: number | null;
}

export function setManualMetrics(id: string, payload: ManualMetricsInput): Promise<PostDetail> {
  return request(`/api/posts/${id}/manual-metrics`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getWixStatus(): Promise<WixStatus> {
  return request("/api/wix/status");
}

export function triggerWixSync(): Promise<WixSyncRun> {
  return request("/api/wix/sync", { method: "POST" });
}

export function wixInstallUrl(): string {
  return `${API_BASE_URL}/api/wix/install`;
}

export function getDailyTraffic(start: string, end: string): Promise<DailyTraffic[]> {
  const search = new URLSearchParams({ start, end });
  return request(`/api/website/daily?${search.toString()}`);
}

export function getTopPages(start: string, end: string, limit = 10): Promise<TopPage[]> {
  const search = new URLSearchParams({ start, end, limit: String(limit) });
  return request(`/api/website/top-pages?${search.toString()}`);
}

export function getFormSubmissions(start: string, end: string): Promise<FormSubmission[]> {
  const search = new URLSearchParams({ start, end });
  return request(`/api/website/form-submissions?${search.toString()}`);
}

export function getFormNames(): Promise<string[]> {
  return request("/api/website/form-names");
}
