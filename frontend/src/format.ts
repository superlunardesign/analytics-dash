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

// Wix choice fields (dropdown/checkbox/radio) store the raw option
// `value` in a submission's answers, not its human-readable `label` --
// pass the field's schema options so codes like "web-design" resolve to
// "Web Design" instead of showing the raw slug.
export function formatFieldAnswer(value: unknown, options?: { label: string; value: string }[]): string {
  if (value == null || value === "") return "—";
  const resolveOption = (v: unknown): string => {
    if (typeof v !== "string") return String(v);
    return options?.find((o) => o.value === v)?.label ?? v;
  };
  if (Array.isArray(value)) return value.length ? value.map(resolveOption).join(", ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Wix's scheduling/appointment field shape: {startDate, endDate, timeZone}.
    if (typeof v.startDate === "string") {
      return `${formatDateTime(v.startDate)}${v.timeZone ? ` (${v.timeZone})` : ""}`;
    }
    return JSON.stringify(value);
  }
  return resolveOption(value);
}

const MEDIA_TYPE_COLORS: Record<string, string> = {
  REELS: "var(--series-violet)",
  FEED: "var(--series-blue)",
  STORY: "var(--series-orange)",
  AD: "var(--series-red)",
  TIKTOK: "var(--series-magenta)",
};

export function mediaTypeColor(mediaProductType: string | null): string {
  if (!mediaProductType) return "var(--text-muted)";
  return MEDIA_TYPE_COLORS[mediaProductType.toUpperCase()] ?? "var(--series-aqua)";
}
