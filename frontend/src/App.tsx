import { useCallback, useEffect, useMemo, useState } from "react";
import { getInstagramStatus, getPost, instagramOAuthStartUrl, listPosts, triggerInstagramSync } from "./api";
import { ConnectBar } from "./components/ConnectBar";
import { PostDetailDrawer } from "./components/PostDetailDrawer";
import { PostsTable } from "./components/PostsTable";
import { StatTile } from "./components/StatTile";
import { formatNumber, formatSeconds } from "./format";
import type { AccountStatus, Post, PostDetail, SortField, SyncRun } from "./types";

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

  const [selectedPost, setSelectedPost] = useState<PostDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

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
      const res = await listPosts({
        sort_by: sortBy,
        order,
        media_product_type: mediaProductType || undefined,
        limit: 200,
      });
      setPosts(res.items);
    } finally {
      setPostsLoading(false);
    }
  }, [sortBy, order, mediaProductType]);

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

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
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
        {postsLoading && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</span>}
      </div>

      <PostsTable posts={posts} sortBy={sortBy} order={order} onSort={handleSort} onSelect={handleSelectPost} />

      <PostDetailDrawer post={selectedPost} loading={selectedLoading} onClose={() => setSelectedPost(null)} />
    </div>
  );
}

export default App;
