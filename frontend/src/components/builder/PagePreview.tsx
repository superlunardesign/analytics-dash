import { AnimatePresence, motion } from "framer-motion";
import { GripVertical, Menu, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { CreatorPage, PageElement, Product } from "../../types";
import { ElementRenderer, SocialLinksRow } from "./ElementRenderer";

interface PagePreviewProps {
  page: CreatorPage;
  elements: PageElement[];
  products: Product[];
  selectedElementId: string | null;
  onSelect: (id: string) => void;
  onDeselect: () => void;
  onDelete: (id: string) => void;
  onReorder: (orderedIds: string[]) => void;
}

export function PagePreview({ page, elements, products, selectedElementId, onSelect, onDeselect, onDelete, onReorder }: PagePreviewProps) {
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
    <div style={{ width: 340, margin: "0 auto" }}>
      <div
        style={{
          background: "#111",
          color: "#fff",
          borderRadius: "20px 20px 0 0",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <span>Page Preview</span>
        <Menu size={16} />
      </div>
      <div
        onClick={onDeselect}
        style={{
          borderRadius: "0 0 20px 20px",
          border: "8px solid #111",
          borderTop: "none",
          overflow: "hidden",
          background: `linear-gradient(160deg, ${theme.background_from ?? "#ffd9a8"}, ${theme.background_to ?? "#ffc2e0"})`,
        }}
      >
        <div style={{ padding: "20px 16px", minHeight: 500 }} onClick={onDeselect}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#fff", overflow: "hidden", flexShrink: 0 }}>
              {page.avatar_url && <img src={page.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#111" }}>{page.handle || page.title}</div>
          </div>

          <div
            onClick={onDeselect}
            style={{ background: "rgba(255,255,255,0.85)", borderRadius: 16, padding: 14, display: "grid", gap: 12 }}
          >
            {elements.length === 0 && (
              <p style={{ fontSize: 12, color: "#999", textAlign: "center", padding: "20px 0" }}>
                Add your first block from the left.
              </p>
            )}
            <AnimatePresence initial={false}>
              {elements.map((el) => (
                <motion.div
                  key={el.id}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  draggable
                  onDragStart={() => setDraggingId(el.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDrop(el.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(el.id);
                  }}
                  style={{
                    position: "relative",
                    cursor: "pointer",
                    borderRadius: 10,
                    // CSS Grid items default to min-width: auto, which lets
                    // a wide child (the carousel's scroll row) force the
                    // whole grid track -- and this card -- wider instead of
                    // clipping/scrolling within it. min-width: 0 lets this
                    // item actually shrink to the track's real width.
                    minWidth: 0,
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
                      style={{ background: "#111", color: "#fff", borderRadius: 999, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "grab" }}
                    >
                      <GripVertical size={13} />
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(el.id);
                      }}
                      title="Delete"
                      style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  {el.element_type === "social_links" ? (
                    Object.values(page.social_links ?? {}).some(Boolean) ? (
                      <SocialLinksRow
                        socialLinks={page.social_links ?? {}}
                        accentColor={(el.config.color as string) || theme.accent_color}
                        align={el.config.align as "left" | "center" | "right" | undefined}
                      />
                    ) : (
                      // SocialLinksRow renders nothing at all with no handles
                      // set yet (correct on the public page) -- without this,
                      // a freshly-added block is completely invisible and
                      // impossible to find/select in the editor.
                      <div style={{ fontSize: 12, color: "#999", padding: "6px 0" }}>
                        Add your social handles in the editor on the right →
                      </div>
                    )
                  ) : (
                    <ElementRenderer element={el} productsById={productsById} />
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
