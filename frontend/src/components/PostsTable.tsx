import type { ReactNode } from "react";
import type { Post, SortField } from "../types";
import { formatDate, formatNumber, formatSeconds, mediaTypeColor } from "../format";

interface Column {
  key: SortField | "caption";
  label: string;
  sortable: boolean;
  render: (post: Post) => ReactNode;
}

const columns: Column[] = [
  { key: "caption", label: "Post", sortable: false, render: (p) => <PostCell post={p} /> },
  { key: "posted_at", label: "Posted", sortable: true, render: (p) => formatDate(p.posted_at) },
  { key: "views", label: "Views", sortable: true, render: (p) => formatNumber(p.latest_metrics?.views) },
  { key: "likes", label: "Likes", sortable: true, render: (p) => formatNumber(p.latest_metrics?.likes) },
  { key: "comments", label: "Comments", sortable: true, render: (p) => formatNumber(p.latest_metrics?.comments) },
  { key: "saves", label: "Saves", sortable: true, render: (p) => formatNumber(p.latest_metrics?.saves) },
  { key: "shares", label: "Shares", sortable: true, render: (p) => formatNumber(p.latest_metrics?.shares) },
  { key: "watch_time", label: "Avg watch", sortable: true, render: (p) => formatSeconds(p.latest_metrics?.avg_watch_time_sec) },
  { key: "profile_visits", label: "Profile visits", sortable: true, render: (p) => formatNumber(p.latest_metrics?.profile_visits) },
  { key: "bio_link_taps", label: "Bio taps", sortable: true, render: (p) => formatNumber(p.latest_metrics?.bio_link_taps) },
  { key: "follows", label: "New follows", sortable: true, render: (p) => formatNumber(p.latest_metrics?.follows) },
];

function PostCell({ post }: { post: Post }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220, maxWidth: 320 }}>
      {post.thumbnail_url ? (
        <img
          src={post.thumbnail_url}
          alt=""
          style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 40, height: 40, borderRadius: 6, background: "var(--gridline)", flexShrink: 0 }} />
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: mediaTypeColor(post.media_product_type),
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {post.media_product_type ?? post.media_type ?? "POST"}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
          title={post.caption ?? ""}
        >
          {post.caption || <span style={{ color: "var(--text-muted)" }}>No caption</span>}
        </div>
      </div>
    </div>
  );
}

interface PostsTableProps {
  posts: Post[];
  sortBy: SortField;
  order: "asc" | "desc";
  onSort: (field: SortField) => void;
  onSelect: (post: Post) => void;
}

export function PostsTable({ posts, sortBy, order, onSort, onSelect }: PostsTableProps) {
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--surface-1)" }}>
            {columns.map((col) => {
              const isSorted = col.sortable && sortBy === col.key;
              return (
                <th
                  key={col.key}
                  onClick={col.sortable ? () => onSort(col.key as SortField) : undefined}
                  style={{
                    textAlign: "left",
                    padding: "10px 14px",
                    color: isSorted ? "var(--text-primary)" : "var(--text-secondary)",
                    fontWeight: 600,
                    fontSize: 12,
                    cursor: col.sortable ? "pointer" : "default",
                    userSelect: "none",
                    borderBottom: "1px solid var(--gridline)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {col.label}
                  {isSorted ? (order === "desc" ? " ↓" : " ↑") : ""}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {posts.map((post) => (
            <tr
              key={post.id}
              onClick={() => onSelect(post)}
              style={{ borderBottom: "1px solid var(--gridline)", cursor: "pointer" }}
            >
              {columns.map((col) => (
                <td key={col.key} style={{ padding: "10px 14px", color: "var(--text-primary)" }}>
                  {col.render(post)}
                </td>
              ))}
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td colSpan={columns.length} style={{ padding: 24, textAlign: "center", color: "var(--text-muted)" }}>
                No posts yet. Connect Instagram and run a sync to pull your content.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
