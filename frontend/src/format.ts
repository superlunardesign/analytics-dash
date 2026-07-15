export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatSeconds(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 60) return `${value.toFixed(1)}s`;
  const minutes = Math.floor(value / 60);
  const seconds = Math.round(value % 60);
  return `${minutes}m ${seconds}s`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

const MEDIA_TYPE_COLORS: Record<string, string> = {
  REELS: "var(--series-violet)",
  FEED: "var(--series-blue)",
  STORY: "var(--series-orange)",
  AD: "var(--series-red)",
};

export function mediaTypeColor(mediaProductType: string | null): string {
  if (!mediaProductType) return "var(--text-muted)";
  return MEDIA_TYPE_COLORS[mediaProductType.toUpperCase()] ?? "var(--series-aqua)";
}
