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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
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

export function getTikTokStatus(): Promise<AccountStatus> {
  return request("/api/tiktok/status");
}

export function triggerTikTokSync(): Promise<SyncRun> {
  return request("/api/tiktok/sync", { method: "POST" });
}

export function tiktokOAuthStartUrl(): string {
  return `${API_BASE_URL}/api/tiktok/oauth/start`;
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

export function login(username: string, password: string): Promise<AuthStatus> {
  return request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function logout(): Promise<void> {
  return request("/api/auth/logout", { method: "POST" });
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
  const resp = await fetch(`${API_BASE_URL}/api/builder/uploads`, {
    method: "POST",
    credentials: "include",
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

// -- Public page (no credentials: this is the unauthenticated, visitor-facing API) --

export function getPublicPage(slug: string): Promise<PublicPage> {
  return fetch(`${API_BASE_URL}/api/public/pages/${slug}`).then(async (resp) => {
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    return resp.json() as Promise<PublicPage>;
  });
}

export function logPublicClick(slug: string, linkUrl: string, elementId?: string, productId?: string): void {
  const payload = JSON.stringify({ link_url: linkUrl, element_id: elementId, product_id: productId });
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
