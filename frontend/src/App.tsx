import { useCallback, useEffect, useMemo, useState } from "react";
import { getInstagramStatus, getPost, instagramOAuthStartUrl, listPosts, setPostSaved, triggerInstagramSync } from "./api";
import { ConnectBar } from "./components/ConnectBar";
import { PostDetailDrawer } from "./components/PostDetailDrawer";
import { PostsTable } from "./components/PostsTable";
import { StatTile } from "./components/StatTile";
import { WebsiteTrafficPanel } from "./components/WebsiteTrafficPanel";
import { formatNumber, formatSeconds } from "./format";
import type { AccountStatus, Post, PostDetail, SortField, SyncRun } from "./types";

const DATE_FILTER_WINDOW_DAYS = 3;

const MEDIA_PRODUCT_TYPES = ["FEED", "REELS", "STORY"];

function App() {
  const [status, setStatus] = useState<AccountStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<SyncRun | null>(null);

  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>("posted_at");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [mediaProductType, setMediaProductType] = useState<string>("");
  const [postsTab, setPostsTab] = useState<"all" | "saved">("all");

  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  const [showTraffic, setShowTraffic] = useState(false);
  const [selectedTrafficDate, setSelectedTrafficDate] = useState<string | null>(null);
  const [trafficRange, setTrafficRange] = useState<{ start: string; end: string } | null>(null);

  const dateWindow = useMemo(() => {
    // Clicking a specific point narrows to +/-3 days of that date; with no
    // point selected, the posts table falls back to whatever broader range
    // the traffic panel itself is showing, so "all the graphs and posts"
    // stay in agreement.
    if (selectedTrafficDate) {
      const center = new Date(selectedTrafficDate);
      const from = new Date(center);
      from.setDate(from.getDate() - DATE_FILTER_WINDOW_DAYS);
      const to = new Date(center);
      to.setDate(to.getDate() + DATE_FILTER_WINDOW_DAYS);
      return { from: from.toISOString(), to: to.toISOString() };
    }
    if (showTraffic && trafficRange) {
      return { from: trafficRange.start, to: trafficRange.end };
    }
    return null;
  }, [selectedTrafficDate, showTraffic, trafficRange]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setStatus(await getInstagramStatus());
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const refreshPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      // The Saved tab is a stable personal collection -- it ignores the
      // type/date filters (which belong to browsing "All posts") so it
      // always shows everything bookmarked, not whatever the main table's
      // filters happened to be left on.
      const res = await listPosts(
        postsTab === "saved"
          ? { sort_by: sortBy, order, is_saved: true, limit: 200 }
          : {
              sort_by: sortBy,
              order,
              media_product_type: mediaProductType || undefined,
              date_from: dateWindow?.from,
              date_to: dateWindow?.to,
              limit: 200,
            }
      );
      setPosts(res.items);
    } finally {
      setPostsLoading(false);
    }
  }, [sortBy, order, mediaProductType, dateWindow, postsTab]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

  // Pick up ?connected=instagram after the OAuth redirect and refresh state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("connected") === "instagram") {
      refreshStatus();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refreshStatus]);

  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      setOrder(order === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setOrder("desc");
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const run = await triggerInstagramSync();
      setLastSync(run);
      await refreshPosts();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
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

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px 64px" }}>
      <header style={{ padding: "24px 0 0" }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Analytics Dashboard</h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 0" }}>
          Instagram post performance, sortable by every metric the API exposes.
        </p>
      </header>

      <ConnectBar
        status={status}
        loading={statusLoading}
        syncing={syncing}
        lastSync={lastSync}
        onConnect={() => (window.location.href = instagramOAuthStartUrl())}
        onSync={handleSync}
      />

      <div style={{ margin: "4px 0 16px" }}>
        <button
          onClick={() => setShowTraffic((v) => !v)}
          style={{
            background: "transparent",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "6px 14px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          {showTraffic ? "Hide" : "Show"} website traffic correlation
        </button>
      </div>

      {showTraffic && (
        <div style={{ marginBottom: 20 }}>
          <WebsiteTrafficPanel
            selectedDate={selectedTrafficDate}
            onSelectDate={setSelectedTrafficDate}
            onRangeChange={setTrafficRange}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "8px 0 20px" }}>
        <StatTile label="Total views" value={formatNumber(totals.views)} accent="var(--series-blue)" />
        <StatTile label="Total saves" value={formatNumber(totals.saves)} accent="var(--series-aqua)" />
        <StatTile label="Total shares" value={formatNumber(totals.shares)} accent="var(--series-orange)" />
        <StatTile
          label="Avg watch time"
          value={totals.watchCount ? formatSeconds(totals.watchSum / totals.watchCount) : "—"}
          accent="var(--series-violet)"
        />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {(["all", "saved"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setPostsTab(tab)}
            style={{
              background: postsTab === tab ? "var(--series-blue)" : "transparent",
              color: postsTab === tab ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {tab === "all" ? "All posts" : "★ Saved"}
          </button>
        ))}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {postsTab === "all" && (
          <label style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Type:{" "}
            <select
              value={mediaProductType}
              onChange={(e) => setMediaProductType(e.target.value)}
              style={{
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
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
        {postsLoading && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</span>}
        {postsTab === "all" && selectedTrafficDate && (
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Filtered to posts within 3 days of {selectedTrafficDate.slice(0, 10)}.{" "}
            <button
              onClick={() => setSelectedTrafficDate(null)}
              style={{ background: "none", border: "none", color: "var(--series-blue)", cursor: "pointer", padding: 0, fontSize: 13 }}
            >
              Clear
            </button>
          </span>
        )}
        {postsTab === "all" && !selectedTrafficDate && showTraffic && trafficRange && (
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            Matching the traffic panel's date range ({trafficRange.start.slice(0, 10)} to {trafficRange.end.slice(0, 10)}).
          </span>
        )}
      </div>

      <PostsTable
        posts={posts}
        sortBy={sortBy}
        order={order}
        onSort={handleSort}
        onSelect={handleSelectPost}
        onToggleSaved={handleToggleSaved}
        emptyMessage={postsTab === "saved" ? "Nothing saved yet -- click the ☆ on any post to add it here." : undefined}
      />

      <PostDetailDrawer
        post={selectedPost}
        loading={selectedLoading}
        onClose={() => setSelectedPost(null)}
        onSaved={handlePostSaved}
      />
    </div>
  );
}

export default App;
