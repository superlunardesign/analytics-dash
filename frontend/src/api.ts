import type {
  AccountStatus,
  AuthStatus,
  CreatorPage,
  CreatorPageDetail,
  DailyTraffic,
  ElementConfig,
  ElementType,
  FormSchema,
  FormSubmission,
  LinkPreview,
  PageElement,
  PageVisitPoint,
  PostDetail,
  PostListResponse,
  Product,
  PublicPage,
  SortField,
  SyncRun,
  TopLinkClick,
  TopPage,
  TopProduct,
  TrafficSource,
  VideoAnalysis,
  WixStatus,
  WixSyncRun,
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// The Tinasuze dashboard login session -- an explicit header the app
// attaches itself, not a cookie. The frontend and API are different
// *.onrender.com subdomains, which browsers treat as separate "sites" for
// cookie purposes; mobile Safari in particular blocks or drops that kind
// of cross-site cookie outright, which showed up as logins that silently
// didn't stick. A token the app reads from localStorage and sends
// explicitly isn't subject to any of that.
const AUTH_TOKEN_KEY = "tinasuze_auth_token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(AUTH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // Private-browsing/storage-blocked edge case -- the session just won't
    // persist across reloads; not worth surfacing as an error.
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${body}`);
  }
  // DELETE endpoints return 204 No Content -- calling .json() on an empty
  // body throws "Unexpected end of JSON input" rather than returning
  // undefined, so every delete call surfaced a (harmless but alarming)
  // error. 205/304 are the same "no body" case.
  if (resp.status === 204 || resp.status === 205 || resp.status === 304) {
    return undefined as T;
  }
  return resp.json() as Promise<T>;
}

export type Brand = "superlunar" | "tinasuze";

export function getInstagramStatus(brand: Brand = "superlunar"): Promise<AccountStatus> {
  return request(`/api/instagram/status?brand=${brand}`);
}

export function triggerInstagramSync(brand: Brand = "superlunar"): Promise<SyncRun> {
  return request(`/api/instagram/sync?brand=${brand}`, { method: "POST" });
}

export function instagramOAuthStartUrl(brand: Brand = "superlunar"): string {
  return `${API_BASE_URL}/api/instagram/oauth/start?brand=${brand}`;
}

export interface ListPostsParams {
  brand?: Brand;
  platform?: string;
  media_type?: string;
  media_product_type?: string;
  sort_by?: SortField;
  order?: "asc" | "desc";
  date_from?: string;
  date_to?: string;
  is_saved?: boolean;
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

export function setPostSaved(id: string, is_saved: boolean): Promise<PostDetail> {
  return request(`/api/posts/${id}/saved`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_saved }),
  });
}

export function analyzeVideo(id: string, goal = "", force = false): Promise<VideoAnalysis> {
  return request(`/api/posts/${id}/video-analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal, force }),
  });
}

export function getVideoAnalysis(id: string): Promise<VideoAnalysis> {
  return request(`/api/posts/${id}/video-analysis`);
}

export function getTikTokStatus(brand: Brand = "superlunar"): Promise<AccountStatus> {
  return request(`/api/tiktok/status?brand=${brand}`);
}

export function triggerTikTokSync(brand: Brand = "superlunar"): Promise<SyncRun> {
  return request(`/api/tiktok/sync?brand=${brand}`, { method: "POST" });
}

export function tiktokOAuthStartUrl(brand: Brand = "superlunar"): string {
  return `${API_BASE_URL}/api/tiktok/oauth/start?brand=${brand}`;
}

export function getWixStatus(): Promise<WixStatus> {
  return request("/api/wix/status");
}

export function triggerWixSync(full = false): Promise<WixSyncRun> {
  return request(`/api/wix/sync${full ? "?full=true" : ""}`, { method: "POST" });
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

export function getTrafficSources(start: string, end: string, limit = 20): Promise<TrafficSource[]> {
  const search = new URLSearchParams({ start, end, limit: String(limit) });
  return request(`/api/website/traffic-sources?${search.toString()}`);
}

export function getFormSubmissions(start: string, end: string): Promise<FormSubmission[]> {
  const search = new URLSearchParams({ start, end });
  return request(`/api/website/form-submissions?${search.toString()}`);
}

export function getFormNames(): Promise<string[]> {
  return request("/api/website/form-names");
}

export function getFormSchemas(): Promise<FormSchema[]> {
  return request("/api/website/form-schema");
}

// -- Tinasuze dashboard login (gates /api/builder/*; the public page API
// below needs no auth at all) --

export async function login(username: string, password: string): Promise<AuthStatus> {
  const result = await request<AuthStatus & { token: string }>("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  setAuthToken(result.token);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await request("/api/auth/logout", { method: "POST" });
  } finally {
    setAuthToken(null);
  }
}

export function checkAuthStatus(): Promise<AuthStatus> {
  return request("/api/auth/status");
}

// -- Creator page builder --

export function listPages(): Promise<CreatorPage[]> {
  return request("/api/builder/pages");
}

export interface CreatorPageInput {
  slug: string;
  title: string;
  handle?: string | null;
  avatar_url?: string | null;
  is_published?: boolean;
  theme?: Record<string, unknown>;
  social_links?: Record<string, unknown>;
  amazon_associate_tag?: string | null;
  og_title?: string | null;
  og_description?: string | null;
  og_image_url?: string | null;
}

export function createPage(payload: CreatorPageInput): Promise<CreatorPage> {
  return request("/api/builder/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function getPageDetail(pageId: string): Promise<CreatorPageDetail> {
  return request(`/api/builder/pages/${pageId}`);
}

export function updatePage(pageId: string, payload: Partial<CreatorPageInput>): Promise<CreatorPage> {
  return request(`/api/builder/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deletePage(pageId: string): Promise<void> {
  return request(`/api/builder/pages/${pageId}`, { method: "DELETE" });
}

export function createElement(pageId: string, elementType: ElementType, config: ElementConfig): Promise<PageElement> {
  return request(`/api/builder/pages/${pageId}/elements`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ element_type: elementType, config }),
  });
}

export function updateElement(
  pageId: string,
  elementId: string,
  elementType: ElementType,
  config: ElementConfig
): Promise<PageElement> {
  return request(`/api/builder/pages/${pageId}/elements/${elementId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ element_type: elementType, config }),
  });
}

export function deleteElement(pageId: string, elementId: string): Promise<void> {
  return request(`/api/builder/pages/${pageId}/elements/${elementId}`, { method: "DELETE" });
}

export function reorderElements(pageId: string, elementIds: string[]): Promise<PageElement[]> {
  return request(`/api/builder/pages/${pageId}/elements/reorder`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ element_ids: elementIds }),
  });
}

export function listProducts(): Promise<Product[]> {
  return request("/api/builder/products");
}

export interface ProductInput {
  source_url: string;
  name: string;
  description?: string | null;
  og_image_url?: string | null;
  custom_image_url?: string | null;
  image_url?: string | null;
}

export function createProduct(payload: ProductInput): Promise<Product> {
  return request("/api/builder/products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateProduct(productId: string, payload: Partial<ProductInput>): Promise<Product> {
  return request(`/api/builder/products/${productId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteProduct(productId: string): Promise<void> {
  return request(`/api/builder/products/${productId}`, { method: "DELETE" });
}

export function previewLink(url: string): Promise<LinkPreview> {
  const search = new URLSearchParams({ url });
  return request(`/api/builder/products/preview?${search.toString()}`);
}

export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const token = getAuthToken();
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const resp = await fetch(`${API_BASE_URL}/api/builder/uploads`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`${resp.status} ${resp.statusText}: ${body}`);
  }
  const data = (await resp.json()) as { url: string };
  return data.url;
}

export function getTopLinkClicks(start: string, end: string, pageId?: string, limit = 20): Promise<TopLinkClick[]> {
  const search = new URLSearchParams({ start, end, limit: String(limit) });
  if (pageId) search.set("page_id", pageId);
  return request(`/api/builder/analytics/top-links?${search.toString()}`);
}

export function getPageVisits(start: string, end: string, pageId?: string): Promise<PageVisitPoint[]> {
  const search = new URLSearchParams({ start, end });
  if (pageId) search.set("page_id", pageId);
  return request(`/api/builder/analytics/visits?${search.toString()}`);
}

export function getTopProducts(start: string, end: string, pageId?: string, limit = 10): Promise<TopProduct[]> {
  const search = new URLSearchParams({ start, end, limit: String(limit) });
  if (pageId) search.set("page_id", pageId);
  return request(`/api/builder/analytics/top-products?${search.toString()}`);
}

// Permanently deletes click/visit history -- e.g. to wipe out your own
// testing traffic. Scoped to one page if pageId is given, else everything.
export function clearAnalytics(pageId?: string): Promise<void> {
  const search = new URLSearchParams();
  if (pageId) search.set("page_id", pageId);
  const qs = search.toString();
  return request(`/api/builder/analytics/clear${qs ? `?${qs}` : ""}`, { method: "DELETE" });
}

// -- Public page (no credentials: this is the unauthenticated, visitor-facing API) --

export function getPublicPage(slug: string, preview?: boolean): Promise<PublicPage> {
  const qs = preview ? "?preview=1" : "";
  return fetch(`${API_BASE_URL}/api/public/pages/${slug}${qs}`).then(async (resp) => {
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<PublicPage>;
  });
}

export function logPublicClick(slug: string, linkUrl: string, elementId?: string, productId?: string, preview?: boolean): void {
  const payload = JSON.stringify({ link_url: linkUrl, element_id: elementId, product_id: productId, preview });
  const url = `${API_BASE_URL}/api/public/pages/${slug}/click`;
  // sendBeacon fires the request even as the browser navigates away on
  // click (the common case here) -- a normal fetch can get cancelled
  // mid-flight the instant the tab starts unloading.
  if (navigator.sendBeacon) {
    navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
  } else {
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true });
  }
}
