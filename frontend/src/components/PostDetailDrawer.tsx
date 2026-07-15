import type { PostDetail } from "../types";
import { formatDateTime, formatNumber, formatSeconds, mediaTypeColor } from "../format";

interface PostDetailDrawerProps {
  post: PostDetail | null;
  loading: boolean;
  onClose: () => void;
}

const METRIC_ROWS: { key: keyof NonNullable<PostDetail["latest_metrics"]>; label: string; format: (v: number) => string }[] = [
  { key: "views", label: "Views", format: formatNumber },
  { key: "reach", label: "Reach", format: formatNumber },
  { key: "likes", label: "Likes", format: formatNumber },
  { key: "comments", label: "Comments", format: formatNumber },
  { key: "saves", label: "Saves", format: formatNumber },
  { key: "shares", label: "Shares", format: formatNumber },
  { key: "total_interactions", label: "Total interactions", format: formatNumber },
  { key: "avg_watch_time_sec", label: "Avg watch time", format: formatSeconds },
  { key: "profile_visits", label: "Profile visits", format: formatNumber },
  { key: "bio_link_taps", label: "Bio link taps", format: formatNumber },
  { key: "follows", label: "New follows", format: formatNumber },
];

export function PostDetailDrawer({ post, loading, onClose }: PostDetailDrawerProps) {
  if (!post && !loading) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        justifyContent: "flex-end",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(420px, 100%)",
          height: "100%",
          background: "var(--surface-1)",
          padding: 24,
          overflowY: "auto",
          borderLeft: "1px solid var(--border)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "4px 10px",
            cursor: "pointer",
            color: "var(--text-secondary)",
            marginBottom: 16,
          }}
        >
          Close
        </button>

        {loading && <p style={{ color: "var(--text-muted)" }}>Loading…</p>}

        {post && (
          <>
            {post.thumbnail_url && (
              <img
                src={post.thumbnail_url}
                alt=""
                style={{ width: "100%", borderRadius: 10, marginBottom: 16, objectFit: "cover", maxHeight: 280 }}
              />
            )}

            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: mediaTypeColor(post.media_product_type),
                textTransform: "uppercase",
                letterSpacing: 0.4,
                marginBottom: 6,
              }}
            >
              {post.media_product_type ?? post.media_type} · {formatDateTime(post.posted_at)}
            </div>

            <p style={{ fontSize: 14, lineHeight: 1.5, color: "var(--text-primary)", whiteSpace: "pre-wrap" }}>
              {post.caption || <span style={{ color: "var(--text-muted)" }}>No caption</span>}
            </p>

            {post.topic ? (
              <span
                style={{
                  display: "inline-block",
                  fontSize: 12,
                  background: "var(--gridline)",
                  color: "var(--text-secondary)",
                  borderRadius: 999,
                  padding: "3px 10px",
                  marginBottom: 12,
                }}
              >
                {post.topic}
              </span>
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
                Topic detection isn't wired up yet.
              </p>
            )}

            {post.permalink && (
              <p style={{ marginBottom: 16 }}>
                <a href={post.permalink} target="_blank" rel="noreferrer" style={{ color: "var(--series-blue)", fontSize: 13 }}>
                  View on Instagram ↗
                </a>
              </p>
            )}

            <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Metrics</h3>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse", marginBottom: 20 }}>
              <tbody>
                {METRIC_ROWS.map(({ key, label, format }) => {
                  const value = post.latest_metrics?.[key];
                  return (
                    <tr key={key} style={{ borderBottom: "1px solid var(--gridline)" }}>
                      <td style={{ padding: "6px 0", color: "var(--text-secondary)" }}>{label}</td>
                      <td style={{ padding: "6px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {typeof value === "number" ? format(value) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
              Snapshot history ({post.metric_history.length})
            </h3>
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
              Each sync run stores a new snapshot so trends over time become visible as data accumulates.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
