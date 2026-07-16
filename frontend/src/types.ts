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
}

export interface PostDetail extends Post {
  metric_history: MetricSnapshot[];
}

export interface PostListResponse {
  total: number;
  items: Post[];
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
