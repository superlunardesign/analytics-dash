import { useMemo, useState } from "react";
import type { CreatorPage, PageElement, Product } from "../../types";
import { ElementRenderer, SocialLinksRow } from "./ElementRenderer";

interface PagePreviewProps {
  page: CreatorPage;
  elements: PageElement[];
  products: Product[];
  selectedElementId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function PagePreview({ page, elements, products, selectedElementId, onSelect, onDelete, onReorder }: PagePreviewProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const theme = page.theme ?? {};
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const ids = elements.map((e) => e.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(ids);
    setDraggingId(null);
  };

  return (
    <div
      style={{
        width: 340,
        margin: "0 auto",
        borderRadius: 28,
        border: "8px solid #111",
        overflow: "hidden",
        background: `linear-gradient(160deg, ${theme.background_from ?? "#ffd9a8"}, ${theme.background_to ?? "#ffc2e0"})`,
      }}
    >
      <div style={{ padding: "20px 16px", minHeight: 500 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff", overflow: "hidden", flexShrink: 0 }}>
            {page.avatar_url && <img src={page.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{page.handle || page.title}</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.85)", borderRadius: 16, padding: 14, display: "grid", gap: 12 }}>
          {elements.length === 0 && (
            <p style={{ fontSize: 12, color: "#999", textAlign: "center", padding: "20px 0" }}>
              Add your first block from the left.
            </p>
          )}
          {elements.map((el) => (
              <div
                key={el.id}
                draggable
                onDragStart={() => setDraggingId(el.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(el.id)}
                onClick={() => onSelect(el.id)}
                style={{
                  position: "relative",
                  cursor: "pointer",
                  borderRadius: 10,
                  outline: selectedElementId === el.id ? `2px solid ${theme.accent_color ?? "#ff4fa3"}` : "2px solid transparent",
                  outlineOffset: 2,
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: -10,
                    right: 2,
                    display: "flex",
                    gap: 4,
                    opacity: selectedElementId === el.id ? 1 : 0,
                    transition: "opacity 0.1s",
                    zIndex: 1,
                  }}
                >
                  <span
                    title="Drag to reorder"
                    style={{ background: "#111", color: "#fff", borderRadius: 999, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, cursor: "grab" }}
                  >
                    ⠿
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(el.id);
                    }}
                    title="Delete"
                    style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, width: 22, height: 22, fontSize: 11, cursor: "pointer" }}
                  >
                    ✕
                  </button>
                </div>
                {el.element_type === "social_links" ? (
                  <SocialLinksRow socialLinks={page.social_links ?? {}} accentColor={theme.accent_color} />
                ) : (
                  <ElementRenderer element={el} productsById={productsById} />
                )}
              </div>
          ))}
        </div>
      </div>
    </div>
  );
}
