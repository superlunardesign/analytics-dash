export interface MetricSnapshot {
  captured_at: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  shares: number | null;
  total_interactions: number | null;
  avg_watch_time_sec: number | null;
  total_watch_time_sec: number | null;
  profile_visits: number | null;
  bio_link_taps: number | null;
  follows: number | null;
  other_metrics: Record<string, unknown>;
}

export interface Post {
  id: string;
  platform: string;
  media_type: string | null;
  media_product_type: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  posted_at: string | null;
  topic: string | null;
  latest_metrics: MetricSnapshot | null;
  // Manually-entered overrides for metrics Instagram never returns for
  // Reels (profile visits, bio link taps, follows). Only ever set on Reels.
  manual_profile_visits: number | null;
  manual_bio_link_taps: number | null;
  manual_follows: number | null;
  // User-curated bookmark for the "Saved" tab, independent of the main
  // table's current sort/filter/date window.
  is_saved: boolean;
}

export interface PostDetail extends Post {
  metric_history: MetricSnapshot[];
}

export interface PostListResponse {
  total: number;
  items: Post[];
}

export interface VideoAnalysisScores {
  hook_strength?: number;
  promise_clarity?: number;
  retention_design?: number;
  engagement_potential?: number;
  viral_potential?: number;
  satisfaction_delivery?: number;
  goal_alignment?: number;
}

export interface VideoAnalysisContentGoal {
  goal_type?: string;
  confidence?: string;
  evidence?: string;
  sales_channel?: string;
  product_info?: string;
  selling_signals?: string;
}

export interface VideoAnalysisPerformanceClassification {
  classification?: string;
  reasoning?: string;
  like_rate?: number;
  comment_rate?: number;
  share_rate?: number;
  has_reach_problem?: boolean;
}

// Mirrors the Video Analyzer's raw analysis_data verbatim (see
// backend/app/integrations/video_analyzer/client.py) -- loosely typed
// since that schema is large, nested, and owned by a different app.
// Only the fields the drawer actually renders are named; anything else
// rides along as unknown extra keys.
export interface VideoAnalysisPayload {
  status?: string;
  video_title?: string;
  what_this_video_is?: string;
  why_it_performed?: string;
  viral_mechanics?: string;
  improvements?: string;
  performance_prediction?: string;
  transcript?: string;
  follow_up_ideas?: string;
  scores?: VideoAnalysisScores;
  content_goal?: VideoAnalysisContentGoal;
  performance_classification?: VideoAnalysisPerformanceClassification;
  niche?: string;
  hashtags?: string[];
  like_count?: number;
  share_count?: number;
  error?: string;
  [key: string]: unknown;
}

export interface VideoAnalysis {
  id: string;
  post_id: string;
  external_analysis_id: number;
  status: "processing" | "completed" | "failed" | string;
  goal: string | null;
  raw_payload: VideoAnalysisPayload;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface AccountStatus {
  connected: boolean;
  username: string | null;
  display_name: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
}

export interface SyncRun {
  id: string;
  status: "running" | "success" | "failed";
  posts_synced: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface WixStatus {
  connected: boolean;
  site_display_name: string | null;
  connected_at: string | null;
}

export interface WixSyncRun {
  id: string;
  status: "running" | "success" | "failed";
  rows_synced: number;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface DailyTraffic {
  date: string;
  sessions: number;
  views: number;
  visitors: number;
  form_submissions: number;
  submissions_by_form: Record<string, number>;
}

export interface TopPage {
  page_path: string | null;
  sessions: number;
  views: number;
}

export interface TrafficSource {
  // referrer_category/source cover every visit (including "direct");
  // utm_campaign_id/utm_medium are only set for visits that arrived via a
  // tagged campaign link.
  referrer_category: string | null;
  referrer_source: string | null;
  utm_campaign_id: string | null;
  utm_medium: string | null;
  sessions: number;
  views: number;
  visitors: number;
}

export interface FormSubmission {
  id: string;
  wix_form_id: string | null;
  submitted_at: string;
  form_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  status: string | null;
  // Raw question-answer map keyed by Wix's field target (e.g.
  // "how_d_you_hear_of_us") -- pair with FormSchema for readable labels.
  fields: Record<string, unknown>;
}

export interface FormSchemaField {
  target: string;
  label: string;
  field_type: string;
  options: { label: string; value: string }[];
}

export interface FormSchema {
  form_id: string;
  form_name: string | null;
  fields: FormSchemaField[];
}

export type SortField =
  | "posted_at"
  | "views"
  | "comments"
  | "saves"
  | "shares"
  | "watch_time"
  | "total_watch_time"
  | "profile_visits"
  | "bio_link_taps"
  | "follows"
  | "likes"
  | "reach"
  | "total_interactions";

// -- Creator page builder --

export type ElementType = "button" | "card_link" | "carousel" | "social_links" | "text" | "line" | "photo";

export interface ButtonConfig {
  label?: string;
  url?: string;
  pdf_url?: string;
  gradient_from?: string;
  gradient_to?: string;
}

export interface CardLinkConfig {
  title?: string;
  description?: string;
  url?: string;
  image_url?: string;
}

export interface CarouselProductRef {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  source_url: string;
}

export interface CarouselConfig {
  heading?: string;
  product_ids?: string[];
  // Only present on the PUBLIC page response (resolved server-side from
  // product_ids) -- never sent by the editor, never stored in the DB.
  products?: CarouselProductRef[];
}

export type TextAlign = "left" | "center" | "right";

export interface TextConfig {
  heading?: string;
  body?: string;
  align?: TextAlign;
  color?: string;
}

export interface SocialLinksConfig {
  align?: TextAlign;
  color?: string;
}

export interface LineConfig {
  style?: "solid" | "dotted";
  color?: string;
}

export interface PhotoConfig {
  image_url?: string;
  link_url?: string;
}

// Element config shape varies by element_type (see the *Config interfaces
// above) -- kept as a loose record here rather than a discriminated union
// since the editor/renderer both branch on element_type explicitly anyway.
export type ElementConfig = Record<string, unknown>;

export interface PageElement {
  id: string;
  page_id: string;
  element_type: ElementType;
  position: number;
  config: ElementConfig;
  created_at: string;
  updated_at: string;
}

export interface SocialLinksMap {
  instagram?: string;
  tiktok?: string;
  pinterest?: string;
  facebook?: string;
  threads?: string;
  youtube?: string;
  [key: string]: string | undefined;
}

export interface PageTheme {
  background_from?: string;
  background_to?: string;
  accent_color?: string;
  [key: string]: string | undefined;
}

export interface CreatorPage {
  id: string;
  slug: string;
  title: string;
  handle: string | null;
  avatar_url: string | null;
  is_published: boolean;
  theme: PageTheme;
  social_links: SocialLinksMap;
  created_at: string;
  updated_at: string;
}

export interface CreatorPageDetail extends CreatorPage {
  elements: PageElement[];
}

export interface Product {
  id: string;
  source_url: string;
  name: string;
  description: string | null;
  og_image_url: string | null;
  custom_image_url: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LinkPreview {
  ok: boolean;
  name: string | null;
  description: string | null;
  image_url: string | null;
  error: string | null;
}

export interface PublicPage {
  slug: string;
  title: string;
  handle: string | null;
  avatar_url: string | null;
  theme: PageTheme;
  social_links: SocialLinksMap;
  elements: PageElement[];
}

export interface TopLinkClick {
  link_url: string;
  clicks: number;
}

export interface PageVisitPoint {
  date: string;
  visits: number;
}

export interface TopProduct {
  product: Product;
  clicks: number;
}
