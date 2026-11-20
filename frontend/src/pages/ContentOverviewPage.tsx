import { useCallback, useEffect, useMemo, useState } from "react";
import { getPost, listPosts, setPostSaved } from "../api";
import { PostDetailDrawer } from "../components/PostDetailDrawer";
import { PostsTable } from "../components/PostsTable";
import { formatNumber, formatSeconds } from "../format";
import { TINASUZE_ACCENT, TINASUZE_BORDER, TINASUZE_CARD, TINASUZE_TEXT, TINASUZE_TEXT_MUTED } from "../tinasuzeTheme";
import type { Post, PostDetail, SortField } from "../types";

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
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 32px" }}>
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
              : "No posts yet for this filter -- connect and sync TikTok/Instagram from the Superlunar tab."
          }
        />
      </div>

      <PostDetailDrawer post={selectedPost} loading={selectedLoading} onClose={() => setSelectedPost(null)} onSaved={handlePostSaved} />
    </div>
  );
}
