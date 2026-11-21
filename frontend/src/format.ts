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

// A <input type="date"> fires onChange with an empty or partial value
// while being edited (clearing it, typing digit-by-digit, some browsers'
// native picker interactions) -- new Date("").toISOString() throws
// RangeError: Invalid time value, which with no error boundary blanks
// the whole page. Falls back to the previous value instead of crashing;
// a real, complete date overwrites it the moment one is actually picked.
export function parseDateInputToISO(value: string, fallback: string): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// For a plain "YYYY-MM-DD" day (no time component), e.g. a Page Visits
// chart bucket. `new Date("2026-11-21")` parses that as UTC midnight,
// which toLocaleDateString() then renders in the browser's local
// timezone -- shifting the displayed day back by one for any timezone
// behind UTC. Parsing the components directly avoids that shift.
export function formatDayLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "—";
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
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
