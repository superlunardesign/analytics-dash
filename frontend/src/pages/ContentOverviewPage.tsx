import { useCallback, useEffect, useMemo, useState } from "react";
import { getPost, listPosts, setPostSaved } from "../api";
import { PostDetailDrawer } from "../components/PostDetailDrawer";
import { PostsTable } from "../components/PostsTable";
import { StatTile } from "../components/StatTile";
import { formatNumber, formatSeconds } from "../format";
import type { Post, PostDetail, SortField } from "../types";

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

  const refreshPosts = useCallback(async () => {
    setPostsLoading(true);
    try {
      const res = await listPosts(
        postsTab === "saved"
          ? { sort_by: sortBy, order, is_saved: true, limit: 200 }
          : { sort_by: sortBy, order, media_product_type: mediaProductType || undefined, limit: 200 }
      );
      setPosts(res.items);
    } finally {
      setPostsLoading(false);
    }
  }, [sortBy, order, mediaProductType, postsTab]);

  useEffect(() => {
    refreshPosts();
  }, [refreshPosts]);

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

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "0 0 20px" }}>
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
            : "No posts yet for this filter -- connect and sync TikTok/Instagram from the Superlunar tab."
        }
      />

      <PostDetailDrawer post={selectedPost} loading={selectedLoading} onClose={() => setSelectedPost(null)} onSaved={handlePostSaved} />
    </div>
  );
}
