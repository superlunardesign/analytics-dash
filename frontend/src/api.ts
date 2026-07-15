import type { AccountStatus, PostDetail, PostListResponse, SortField, SyncRun } from "./types";

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
