import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getInstagramStatus,
  getPageVisits,
  getPost,
  getTikTokStatus,
  instagramOAuthStartUrl,
  listPosts,
  setPostSaved,
  tiktokOAuthStartUrl,
  triggerInstagramSync,
  triggerTikTokSync,
} from "../api";
import { ConnectBar } from "../components/ConnectBar";
import { LineChart } from "../components/LineChart";
import { PostDetailDrawer } from "../components/PostDetailDrawer";
import { PostsTable } from "../components/PostsTable";
import { formatNumber, formatSeconds, parseDateInputToISO } from "../format";
import { TINASUZE_ACCENT, TINASUZE_BORDER, TINASUZE_CARD, TINASUZE_TEXT, TINASUZE_TEXT_MUTED } from "../tinasuzeTheme";
import type { AccountStatus, PageVisitPoint, Post, PostDetail, SortField, SyncRun } from "../types";

type RangePreset = 7 | 30 | 90 | 365 | "all";

function rangeForPreset(preset: RangePreset): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (preset === "all") {
    start.setDate(start.getDate() - 3 * 365);
  } else {
    start.setDate(start.getDate() - preset);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

const rangeControlStyle: React.CSSProperties = {
  border: `1px solid ${TINASUZE_BORDER}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  background: "#fff",
  color: TINASUZE_TEXT,
};

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "12px 18px", minWidth: 130 }}>
      <div style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: TINASUZE_TEXT, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

// This creator is far more active on TikTok, so content performance
// defaults there rather than assuming Instagram like the Superlunar
// side's dashboard does -- "All" and Instagram's own types are still one
// click away via the Type filter below.
const MEDIA_PRODUCT_TYPES = ["TIKTOK", "FEED", "REELS"];

export function ContentOverviewPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>("views");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [mediaProductType, setMediaProductType] = useState<string>("TIKTOK");
  const [postsTab, setPostsTab] = useState<"all" | "saved">("all");

  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const [igStatus, setIgStatus] = useState<AccountStatus | null>(null);
  const [igStatusLoading, setIgStatusLoading] = useState(true);
  const [igSyncing, setIgSyncing] = useState(false);
  const [igLastSync, setIgLastSync] = useState<SyncRun | null>(null);

  const [tiktokStatus, setTiktokStatus] = useState<AccountStatus | null>(null);
  const [tiktokStatusLoading, setTiktokStatusLoading] = useState(true);
  const [tiktokSyncing, setTiktokSyncing] = useState(false);
  const [tiktokLastSync, setTiktokLastSync] = useState<SyncRun | null>(null);

  const [trafficPreset, setTrafficPreset] = useState<RangePreset>(30);
  const [trafficCustomRange, setTrafficCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showTrafficCustomRange, setShowTrafficCustomRange] = useState(false);
  const [trafficPendingRange, setTrafficPendingRange] = useState<{ start: string; end: string } | null>(null);
  const [visits, setVisits] = useState<PageVisitPoint[]>([]);
  const [visitsLoading, setVisitsLoading] = useState(true);

  const trafficRange = useMemo(
    () => trafficCustomRange ?? rangeForPreset(trafficPreset),
    [trafficCustomRange, trafficPreset]
  );

  const refreshPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await listPosts(
        postsTab === "saved"
          ? { brand: "tinasuze", sort_by: sortBy, order, is_saved: true, limit: 200 }
          : { brand: "tinasuze", sort_by: sortBy, order, media_product_type: mediaProductType || undefined, limit: 200 }
      );
      setPosts(res.items);
    } finally {
      setPostsLoading(false);
    }
  }, [sortBy, order, mediaProductType, postsTab]);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  useEffect(() => {
    setIgStatusLoading(true);
    getInstagramStatus("tinasuze")
      .then(setIgStatus)
      .finally(() => setIgStatusLoading(false));
    setTiktokStatusLoading(true);
    getTikTokStatus("tinasuze")
      .then(setTiktokStatus)
      .finally(() => setTiktokStatusLoading(false));
  }, []);

  useEffect(() => {
    setVisitsLoading(true);
    getPageVisits(trafficRange.start, trafficRange.end)
      .then(setVisits)
      .finally(() => setVisitsLoading(false));
  }, [trafficRange.start, trafficRange.end]);

  const handleIgSync = async () => {
    setIgSyncing(true);
    try {
      setIgLastSync(await triggerInstagramSync("tinasuze"));
      await refreshPosts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setIgSyncing(false);
    }
  };

  const handleTiktokSync = async () => {
    setTiktokSyncing(true);
    try {
      setTiktokLastSync(await triggerTikTokSync("tinasuze"));
      await refreshPosts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setTiktokSyncing(false);
    }
  };

  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      setOrder(order === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setOrder("desc");
    }
  };

  const handleSelectPost = async (post: Post) => {
    setSelectedLoading(true);
    setSelectedPost(null);
    try {
      setSelectedPost(await getPost(post.id));
    } finally {
      setSelectedLoading(false);
    }
  };

  const handlePostSaved = (updated: PostDetail) => {
    setSelectedPost(updated);
    refreshPosts();
  };

  const handleToggleSaved = async (post: Post) => {
    await setPostSaved(post.id, !post.is_saved);
    refreshPosts();
  };

  const totals = useMemo(() => {
    const acc = { views: 0, saves: 0, shares: 0, watchSum: 0, watchCount: 0 };
    for (const p of posts) {
      const m = p.latest_metrics;
      if (!m) continue;
      acc.views += m.views ?? 0;
      acc.saves += m.saves ?? 0;
      acc.shares += m.shares ?? 0;
      if (m.avg_watch_time_sec != null) {
        acc.watchSum += m.avg_watch_time_sec;
        acc.watchCount += 1;
      }
    }
    return acc;
  }, [posts]);

  const visitDates = visits.map((v) => v.date);
  const visitSeries = [
    { key: "visits", label: "Page visits", color: TINASUZE_ACCENT, values: visits.map((v) => v.visits), axis: "left" as const },
  ];
  const totalVisits = visits.reduce((sum, v) => sum + v.visits, 0);

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 32px" }}>
      <div
        style={{
          background: TINASUZE_CARD,
          borderRadius: 16,
          padding: "4px 20px",
          marginBottom: 16,
          boxShadow: "0 10px 30px rgba(21,17,13,0.06)",
        }}
      >
        <ConnectBar
          platformLabel="Instagram"
          status={igStatus}
          loading={igStatusLoading}
          syncing={igSyncing}
          lastSync={igLastSync}
          onConnect={() => (window.location.href = instagramOAuthStartUrl("tinasuze"))}
          onSync={handleIgSync}
        />
        <ConnectBar
          platformLabel="TikTok"
          status={tiktokStatus}
          loading={tiktokStatusLoading}
          syncing={tiktokSyncing}
          lastSync={tiktokLastSync}
          onConnect={() => (window.location.href = tiktokOAuthStartUrl("tinasuze"))}
          onSync={handleTiktokSync}
        />
      </div>

      <div style={{ background: TINASUZE_CARD, borderRadius: 20, padding: 28, marginBottom: 20, boxShadow: "0 10px 30px rgba(21,17,13,0.06)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, color: TINASUZE_TEXT, margin: 0 }}>Page traffic</h3>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {([7, 30, 90, 365] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => {
                  setTrafficPreset(p);
                  setTrafficCustomRange(null);
                }}
                style={{
                  background: !trafficCustomRange && trafficPreset === p ? TINASUZE_ACCENT : "transparent",
                  color: !trafficCustomRange && trafficPreset === p ? "#fff" : TINASUZE_TEXT_MUTED,
                  border: `1px solid ${TINASUZE_BORDER}`,
                  borderRadius: 6,
                  padding: "4px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Last {p}d
              </button>
            ))}
            <button
              onClick={() => {
                setTrafficPreset("all");
                setTrafficCustomRange(null);
              }}
              style={{
                background: !trafficCustomRange && trafficPreset === "all" ? TINASUZE_ACCENT : "transparent",
                color: !trafficCustomRange && trafficPreset === "all" ? "#fff" : TINASUZE_TEXT_MUTED,
                border: `1px solid ${TINASUZE_BORDER}`,
                borderRadius: 6,
                padding: "4px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              All time
            </button>
            <button
              onClick={() => {
                if (showTrafficCustomRange) {
                  setShowTrafficCustomRange(false);
                } else {
                  setTrafficPendingRange(trafficCustomRange ?? trafficRange);
                  setShowTrafficCustomRange(true);
                }
              }}
              style={{
                background: trafficCustomRange ? TINASUZE_ACCENT : "transparent",
                color: trafficCustomRange ? "#fff" : TINASUZE_TEXT_MUTED,
                border: "none",
                borderBottom: `1px dashed ${TINASUZE_BORDER}`,
                padding: "4px 6px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Custom range…
            </button>
          </div>
        </div>

        {showTrafficCustomRange && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14, paddingBottom: 12, borderBottom: `1px solid ${TINASUZE_BORDER}` }}>
            <label style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>
              From{" "}
              <input
                type="date"
                value={toDateInputValue(trafficPendingRange?.start ?? trafficRange.start)}
                onChange={(e) =>
                  setTrafficPendingRange((prev) => ({
                    start: parseDateInputToISO(e.target.value, prev?.start ?? trafficRange.start),
                    end: prev?.end ?? trafficRange.end,
                  }))
                }
                style={{ ...rangeControlStyle, padding: "4px 6px", fontSize: 12 }}
              />
            </label>
            <label style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>
              To{" "}
              <input
                type="date"
                value={toDateInputValue(trafficPendingRange?.end ?? trafficRange.end)}
                onChange={(e) =>
                  setTrafficPendingRange((prev) => ({
                    start: prev?.start ?? trafficRange.start,
                    end: parseDateInputToISO(e.target.value, prev?.end ?? trafficRange.end),
                  }))
                }
                style={{ ...rangeControlStyle, padding: "4px 6px", fontSize: 12 }}
              />
            </label>
            <button
              onClick={() => {
                if (trafficPendingRange) setTrafficCustomRange(trafficPendingRange);
              }}
              style={{
                background: TINASUZE_ACCENT,
                color: "#fff",
                border: "none",
                borderRadius: 6,
                padding: "4px 12px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Apply
            </button>
          </div>
        )}

        <p style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED, marginBottom: 14 }}>
          {formatNumber(totalVisits)} visits in this range
        </p>

        {visitsLoading ? (
          <p style={{ fontSize: 13, color: TINASUZE_TEXT_MUTED }}>Loading…</p>
        ) : visits.length > 0 ? (
          <LineChart dates={visitDates} series={visitSeries} selectedDate={null} onSelectDate={() => {}} height={220} />
        ) : (
          <p style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>No visits in this range yet.</p>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "0 0 20px" }}>
        <StatChip label="Total views" value={formatNumber(totals.views)} />
        <StatChip label="Total saves" value={formatNumber(totals.saves)} />
        <StatChip label="Total shares" value={formatNumber(totals.shares)} />
        <StatChip label="Avg watch time" value={totals.watchCount ? formatSeconds(totals.watchSum / totals.watchCount) : "—"} />
      </div>

      <div style={{ background: TINASUZE_CARD, borderRadius: 20, padding: 28, boxShadow: "0 10px 30px rgba(21,17,13,0.06)" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["all", "saved"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPostsTab(tab)}
              style={{
                background: postsTab === tab ? TINASUZE_ACCENT : "transparent",
                color: postsTab === tab ? "#fff" : TINASUZE_TEXT_MUTED,
                border: postsTab === tab ? "none" : `1px solid ${TINASUZE_BORDER}`,
                borderRadius: 6,
                padding: "6px 14px",
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {tab === "all" ? "All posts" : "★ Saved"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {postsTab === "all" && (
            <label style={{ fontSize: 13, color: TINASUZE_TEXT_MUTED }}>
              Type:{" "}
              <select
                value={mediaProductType}
                onChange={(e) => setMediaProductType(e.target.value)}
                style={{
                  background: "#fff",
                  color: TINASUZE_TEXT,
                  border: `1px solid ${TINASUZE_BORDER}`,
                  borderRadius: 6,
                  padding: "4px 8px",
                  fontSize: 13,
                }}
              >
                <option value="">All</option>
                {MEDIA_PRODUCT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          {postsLoading && <span style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>Loading…</span>}
        </div>

        <PostsTable
          posts={posts}
          sortBy={sortBy}
          order={order}
          onSort={handleSort}
          onSelect={handleSelectPost}
          onToggleSaved={handleToggleSaved}
          emptyMessage={
            postsTab === "saved"
              ? "Nothing saved yet -- click the ☆ on any post to add it here."
              : "No posts yet for this filter -- connect and sync TikTok/Instagram above."
          }
        />
      </div>

      <PostDetailDrawer post={selectedPost} loading={selectedLoading} onClose={() => setSelectedPost(null)} onSaved={handlePostSaved} />
    </div>
  );
}
