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
