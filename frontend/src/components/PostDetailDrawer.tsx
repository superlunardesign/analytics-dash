import { useEffect, useState } from "react";
import { setManualMetrics, setPostSaved } from "../api";
import type { PostDetail } from "../types";
import { formatDateTime, formatNumber, formatSeconds, mediaTypeColor } from "../format";

interface PostDetailDrawerProps {
  post: PostDetail | null;
  loading: boolean;
  onClose: () => void;
  onSaved: (updated: PostDetail) => void;
}

// Maps a metrics-table row to the Post field holding its manual override
// (Reels only), so a hand-entered value shows even though Instagram's API
// never returns these three metrics for Reels at all.
const MANUAL_OVERRIDE_KEYS: Partial<Record<string, keyof PostDetail>> = {
  profile_visits: "manual_profile_visits",
  bio_link_taps: "manual_bio_link_taps",
  follows: "manual_follows",
};

const METRIC_ROWS: { key: keyof NonNullable<PostDetail["latest_metrics"]>; label: string; format: (v: number) => string }[] = [
  { key: "views", label: "Views", format: formatNumber },
  { key: "reach", label: "Reach", format: formatNumber },
  { key: "likes", label: "Likes", format: formatNumber },
  { key: "comments", label: "Comments", format: formatNumber },
  { key: "saves", label: "Saves", format: formatNumber },
  { key: "shares", label: "Shares", format: formatNumber },
  { key: "total_interactions", label: "Total interactions", format: formatNumber },
  { key: "avg_watch_time_sec", label: "Avg watch time", format: formatSeconds },
  { key: "total_watch_time_sec", label: "Total watch time", format: formatSeconds },
  { key: "profile_visits", label: "Profile visits", format: formatNumber },
  { key: "bio_link_taps", label: "Bio link taps", format: formatNumber },
  { key: "follows", label: "New follows", format: formatNumber },
];

export function PostDetailDrawer({ post, loading, onClose, onSaved }: PostDetailDrawerProps) {
  // Neither Instagram's API (for Reels) nor TikTok's Display API (for any
  // post) returns profile visits / bio link taps / follows -- see
  // app/api/posts.py's _MANUAL_OVERRIDE_MEDIA_TYPES on the backend.
  const mediaProductType = (post?.media_product_type ?? "").toUpperCase();
  const supportsManualOverrides = mediaProductType === "REELS" || mediaProductType === "TIKTOK";

  const [profileVisits, setProfileVisits] = useState("");
  const [bioLinkTaps, setBioLinkTaps] = useState("");
  const [follows, setFollows] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [togglingSaved, setTogglingSaved] = useState(false);

  useEffect(() => {
    setProfileVisits(post?.manual_profile_visits != null ? String(post.manual_profile_visits) : "");
    setBioLinkTaps(post?.manual_bio_link_taps != null ? String(post.manual_bio_link_taps) : "");
    setFollows(post?.manual_follows != null ? String(post.manual_follows) : "");
    setSaveError(null);
  }, [post?.id]);

  if (!post && !loading) return null;

  const toIntOrNull = (v: string): number | null => {
    const trimmed = v.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.trunc(n) : null;
  };

  const handleToggleSaved = async () => {
    if (!post) return;
    setTogglingSaved(true);
    try {
      onSaved(await setPostSaved(post.id, !post.is_saved));
    } finally {
      setTogglingSaved(false);
    }
  };

  const handleSave = async () => {
    if (!post) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await setManualMetrics(post.id, {
        profile_visits: toIntOrNull(profileVisits),
        bio_link_taps: toIntOrNull(bioLinkTaps),
        follows: toIntOrNull(follows),
      });
      onSaved(updated);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
              color: "var(--text-secondary)",
            }}
          >
            Close
          </button>
          {post && (
            <button
              onClick={handleToggleSaved}
              disabled={togglingSaved}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
                cursor: togglingSaved ? "default" : "pointer",
                opacity: togglingSaved ? 0.6 : 1,
                color: post.is_saved ? "var(--series-yellow)" : "var(--text-secondary)",
                fontSize: 13,
              }}
            >
              <span aria-hidden>{post.is_saved ? "★" : "☆"}</span>
              {post.is_saved ? "Saved" : "Save"}
            </button>
          )}
        </div>

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
                  const overrideKey = MANUAL_OVERRIDE_KEYS[key];
                  const overrideValue = overrideKey ? post[overrideKey] : null;
                  const value = typeof overrideValue === "number" ? overrideValue : post.latest_metrics?.[key];
                  return (
                    <tr key={key} style={{ borderBottom: "1px solid var(--gridline)" }}>
                      <td style={{ padding: "6px 0", color: "var(--text-secondary)" }}>{label}</td>
                      <td style={{ padding: "6px 0", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {typeof value === "number" ? format(value) : "—"}
                        {typeof overrideValue === "number" && (
                          <span style={{ color: "var(--text-muted)", fontSize: 11 }}> (manual)</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {supportsManualOverrides && (
              <>
                <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
                  Manual overrides
                </h3>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
                  {mediaProductType === "TIKTOK"
                    ? "TikTok's API doesn't return profile visits, bio link taps, or follows for any post. Enter what TikTok's own app shows for this video to track it here."
                    : "Instagram's API doesn't return profile visits, bio link taps, or follows for Reels. Enter what Instagram's own app shows for this Reel to track it here."}
                </p>
                <div style={{ display: "grid", gap: 8, marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Profile visits
                    <input
                      type="number"
                      inputMode="numeric"
                      value={profileVisits}
                      onChange={(e) => setProfileVisits(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 4,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--gridline)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Bio link taps
                    <input
                      type="number"
                      inputMode="numeric"
                      value={bioLinkTaps}
                      onChange={(e) => setBioLinkTaps(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 4,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--gridline)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </label>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    New follows
                    <input
                      type="number"
                      inputMode="numeric"
                      value={follows}
                      onChange={(e) => setFollows(e.target.value)}
                      style={{
                        display: "block",
                        width: "100%",
                        marginTop: 4,
                        padding: "6px 8px",
                        borderRadius: 6,
                        border: "1px solid var(--border)",
                        background: "var(--gridline)",
                        color: "var(--text-primary)",
                      }}
                    />
                  </label>
                </div>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    background: "var(--series-blue)",
                    border: "none",
                    borderRadius: 6,
                    padding: "6px 14px",
                    color: "#fff",
                    cursor: saving ? "default" : "pointer",
                    opacity: saving ? 0.6 : 1,
                    fontSize: 13,
                    marginBottom: 20,
                  }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                {saveError && (
                  <p style={{ fontSize: 12, color: "var(--series-red, #d64545)", marginBottom: 20, marginTop: -12 }}>
                    {saveError}
                  </p>
                )}
              </>
            )}

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
