import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createElement,
  createPage,
  deleteElement,
  deletePage,
  getPageDetail,
  listPages,
  listProducts,
  reorderElements,
  updateElement,
  updatePage,
} from "../api";
import { AddElementPanel } from "../components/builder/AddElementPanel";
import { ElementEditor } from "../components/builder/ElementEditor";
import { PagePreview } from "../components/builder/PagePreview";
import { PageSettingsEditor } from "../components/builder/PageSettingsEditor";
import { ToastStack, useToastStack } from "../components/Toast";
import { TINASUZE_ACCENT, TINASUZE_BORDER, TINASUZE_CARD, TINASUZE_TEXT, TINASUZE_TEXT_MUTED } from "../tinasuzeTheme";
import type { CreatorPage, CreatorPageDetail, ElementConfig, ElementType, Product, SocialLinksMap } from "../types";

const cardStyle: React.CSSProperties = {
  background: TINASUZE_CARD,
  borderRadius: 16,
  padding: 18,
  boxShadow: "0 10px 30px rgba(21,17,13,0.06)",
};

const DEFAULT_CONFIG: Record<ElementType, ElementConfig> = {
  button: { label: "New Button", url: "", gradient_from: "#ff8a3d", gradient_to: "#ff4fa3" },
  card_link: { title: "New Link", description: "", url: "", image_url: "" },
  carousel: { heading: "New Category", product_ids: [] },
  social_links: {},
  text: { heading: "Heading", body: "Body text" },
  line: { style: "solid", color: "#f2a7c9" },
  photo: { image_url: "", link_url: "" },
  image_card_row: { columns: 1, cards: [{ image_url: "", badge_enabled: false, badge_text: "", caption: "New Card", url: "" }] },
};

// Saves config/settings edits 500ms after the last keystroke rather than
// on every character -- the editor stays responsive (local state updates
// immediately) without hammering the API while someone's mid-sentence.
function useDebouncedSave<T>(save: (value: T) => void, delayMs = 500) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  return useCallback(
    (value: T) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => save(value), delayMs);
    },
    [save, delayMs]
  );
}

export function LinkEditorPage() {
  const [pages, setPages] = useState<CreatorPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);
  const [currentPageId, setCurrentPageId] = useState<string | null>(null);
  const [pageDetail, setPageDetail] = useState<CreatorPageDetail | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [creatingPage, setCreatingPage] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const toastStack = useToastStack();

  useEffect(() => {
    (async () => {
      try {
        const [pagesRes, productsRes] = await Promise.all([listPages(), listProducts()]);
        setPages(pagesRes);
        setProducts(productsRes);
        if (pagesRes.length > 0) setCurrentPageId(pagesRes[0].id);
      } finally {
        setPagesLoading(false);
      }
    })();
  }, []);

  const refreshPageDetail = useCallback(async (pageId: string) => {
    setPageDetail(await getPageDetail(pageId));
  }, []);

  useEffect(() => {
    if (currentPageId) refreshPageDetail(currentPageId);
    else setPageDetail(null);
  }, [currentPageId, refreshPageDetail]);

  const savePageSettings = useDebouncedSave((updates: Partial<CreatorPage>) => {
    if (!currentPageId) return;
    updatePage(currentPageId, updates).catch((err) =>
      toastStack.push(err instanceof Error ? err.message : "Couldn't save page settings")
    );
  });

  const handlePageSettingsChange = (updates: Partial<CreatorPage>) => {
    setPageDetail((prev) => (prev ? { ...prev, ...updates } : prev));
    setPages((prev) => prev.map((p) => (p.id === currentPageId ? { ...p, ...updates } : p)));
    savePageSettings(updates);
  };

  const handleSocialLinksChange = (links: SocialLinksMap) => {
    handlePageSettingsChange({ social_links: links });
  };

  const saveElementConfig = useDebouncedSave(({ elementId, elementType, config }: { elementId: string; elementType: ElementType; config: ElementConfig }) => {
    if (!currentPageId) return;
    updateElement(currentPageId, elementId, elementType, config).catch((err) =>
      toastStack.push(err instanceof Error ? err.message : "Couldn't save this block")
    );
  });

  const handleElementConfigChange = (elementId: string, config: ElementConfig) => {
    if (!pageDetail) return;
    const element = pageDetail.elements.find((e) => e.id === elementId);
    if (!element) return;
    setPageDetail({
      ...pageDetail,
      elements: pageDetail.elements.map((e) => (e.id === elementId ? { ...e, config } : e)),
    });
    saveElementConfig({ elementId, elementType: element.element_type, config });
  };

  const handleAddElement = async (type: ElementType) => {
    if (!currentPageId) return;
    try {
      const element = await createElement(currentPageId, type, DEFAULT_CONFIG[type]);
      setPageDetail((prev) => (prev ? { ...prev, elements: [...prev.elements, element] } : prev));
      setSelectedElementId(element.id);
    } catch (err) {
      toastStack.push(err instanceof Error ? err.message : "Couldn't add that block");
    }
  };

  const handleDeleteElement = async (elementId: string) => {
    if (!currentPageId) return;
    setPageDetail((prev) => (prev ? { ...prev, elements: prev.elements.filter((e) => e.id !== elementId) } : prev));
    if (selectedElementId === elementId) setSelectedElementId(null);
    try {
      await deleteElement(currentPageId, elementId);
    } catch (err) {
      toastStack.push(err instanceof Error ? err.message : "Couldn't delete that block");
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!currentPageId || !pageDetail) return;
    const byId = new Map(pageDetail.elements.map((e) => [e.id, e]));
    setPageDetail({ ...pageDetail, elements: orderedIds.map((id) => byId.get(id)!).filter(Boolean) });
    try {
      await reorderElements(currentPageId, orderedIds);
    } catch (err) {
      toastStack.push(err instanceof Error ? err.message : "Couldn't save the new order");
    }
  };

  const handleCreatePage = async () => {
    if (!newPageTitle.trim()) return;
    const slug = newPageTitle
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    try {
      const page = await createPage({ slug: slug || `page-${Date.now()}`, title: newPageTitle.trim() });
      setPages((prev) => [...prev, page]);
      setCurrentPageId(page.id);
      setNewPageTitle("");
      setCreatingPage(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Couldn't create that page -- try a different title/slug");
    }
  };

  const handleDeletePage = async () => {
    if (!currentPageId) return;
    if (!confirm("Delete this page and everything on it? This can't be undone.")) return;
    await deletePage(currentPageId);
    const remaining = pages.filter((p) => p.id !== currentPageId);
    setPages(remaining);
    setCurrentPageId(remaining[0]?.id ?? null);
  };

  if (pagesLoading) {
    return <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, color: TINASUZE_TEXT_MUTED }}>Loading…</div>;
  }

  if (pages.length === 0 || creatingPage) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", padding: 24, textAlign: "center", ...cardStyle }}>
        <h2 style={{ fontSize: 16, marginBottom: 12, color: TINASUZE_TEXT }}>{pages.length === 0 ? "Create your first page" : "New page"}</h2>
        <input
          type="text"
          value={newPageTitle}
          onChange={(e) => setNewPageTitle(e.target.value)}
          placeholder="Page title, e.g. Main"
          style={{
            width: "100%",
            background: "#fff",
            color: TINASUZE_TEXT,
            border: `1px solid ${TINASUZE_BORDER}`,
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 14,
            marginBottom: 10,
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={handleCreatePage}
            style={{ background: TINASUZE_ACCENT, border: "none", borderRadius: 6, padding: "8px 16px", color: "#fff", fontWeight: 700, cursor: "pointer" }}
          >
            Create
          </button>
          {pages.length > 0 && (
            <button
              onClick={() => setCreatingPage(false)}
              style={{ background: "transparent", border: `1px solid ${TINASUZE_BORDER}`, borderRadius: 6, padding: "8px 16px", color: TINASUZE_TEXT_MUTED, cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
        </div>
        {formError && <p style={{ fontSize: 12, color: "#d6294f", marginTop: 10 }}>{formError}</p>}
      </div>
    );
  }

  const selectedElement = pageDetail?.elements.find((e) => e.id === selectedElementId) ?? null;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 24px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <select
          value={currentPageId ?? ""}
          onChange={(e) => {
            setCurrentPageId(e.target.value);
            setSelectedElementId(null);
          }}
          style={{
            background: "#fff",
            color: TINASUZE_TEXT,
            border: `1px solid ${TINASUZE_BORDER}`,
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 13,
          }}
        >
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title} {p.is_published ? "" : "(draft)"}
            </option>
          ))}
        </select>
        <button
          onClick={() => setCreatingPage(true)}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "#fff", border: `1px solid ${TINASUZE_BORDER}`, borderRadius: 6, padding: "6px 12px", fontSize: 13, color: TINASUZE_TEXT, cursor: "pointer" }}
        >
          <Plus size={14} /> New page
        </button>
        {pageDetail?.is_published && pageDetail.slug && (
          <a
            href={`/p/${pageDetail.slug}?preview=1`}
            target="_blank"
            rel="noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 700, color: TINASUZE_ACCENT, marginLeft: "auto", textDecoration: "none" }}
          >
            View live page <ExternalLink size={13} />
          </a>
        )}
      </div>

      {pageDetail && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 320px", gap: 20, alignItems: "start" }}>
          <div style={cardStyle}>
            <AddElementPanel onAdd={handleAddElement} />
          </div>

          <PagePreview
            page={pageDetail}
            elements={pageDetail.elements}
            products={products}
            selectedElementId={selectedElementId}
            onSelect={setSelectedElementId}
            onDeselect={() => setSelectedElementId(null)}
            onDelete={handleDeleteElement}
            onReorder={handleReorder}
          />

          <div
            style={{
              ...cardStyle,
              position: "sticky",
              top: 20,
              overflow: "hidden",
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedElement?.id ?? "page-settings"}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
              >
                {selectedElement ? (
                  <ElementEditor
                    element={selectedElement}
                    products={products}
                    socialLinks={pageDetail.social_links ?? {}}
                    onConfigChange={(config) => handleElementConfigChange(selectedElement.id, config)}
                    onSocialLinksChange={handleSocialLinksChange}
                    onProductSaved={(product) =>
                      setProducts((prev) =>
                        prev.some((p) => p.id === product.id) ? prev.map((p) => (p.id === product.id ? product : p)) : [...prev, product]
                      )
                    }
                    onDelete={() => handleDeleteElement(selectedElement.id)}
                    onDeselect={() => setSelectedElementId(null)}
                  />
                ) : (
                  <PageSettingsEditor page={pageDetail} onChange={handlePageSettingsChange} onDelete={handleDeletePage} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
      <ToastStack toasts={toastStack.toasts} onDismiss={toastStack.dismiss} />
    </div>
  );
}
