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
import type { CreatorPage, CreatorPageDetail, ElementConfig, ElementType, Product, SocialLinksMap } from "../types";

const DEFAULT_CONFIG: Record<ElementType, ElementConfig> = {
  button: { label: "New Button", url: "", gradient_from: "#ff8a3d", gradient_to: "#ff4fa3" },
  card_link: { title: "New Link", description: "", url: "", image_url: "" },
  carousel: { heading: "New Category", product_ids: [] },
  social_links: {},
  text: { heading: "Heading", body: "Body text" },
  line: { style: "solid", color: "#f2a7c9" },
  photo: { image_url: "", link_url: "" },
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
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : "Couldn't save page settings")
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
      setError(err instanceof Error ? err.message : "Couldn't save this block")
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
      setError(err instanceof Error ? err.message : "Couldn't add that block");
    }
  };

  const handleDeleteElement = async (elementId: string) => {
    if (!currentPageId) return;
    setPageDetail((prev) => (prev ? { ...prev, elements: prev.elements.filter((e) => e.id !== elementId) } : prev));
    if (selectedElementId === elementId) setSelectedElementId(null);
    try {
      await deleteElement(currentPageId, elementId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that block");
    }
  };

  const handleReorder = async (orderedIds: string[]) => {
    if (!currentPageId || !pageDetail) return;
    const byId = new Map(pageDetail.elements.map((e) => [e.id, e]));
    setPageDetail({ ...pageDetail, elements: orderedIds.map((id) => byId.get(id)!).filter(Boolean) });
    try {
      await reorderElements(currentPageId, orderedIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the new order");
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
      setError(err instanceof Error ? err.message : "Couldn't create that page -- try a different title/slug");
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
    return <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24, color: "var(--text-muted)" }}>Loading…</div>;
  }

  if (pages.length === 0 || creatingPage) {
    return (
      <div style={{ maxWidth: 420, margin: "60px auto", padding: 24, textAlign: "center" }}>
        <h2 style={{ fontSize: 16, marginBottom: 12 }}>{pages.length === 0 ? "Create your first page" : "New page"}</h2>
        <input
          type="text"
          value={newPageTitle}
          onChange={(e) => setNewPageTitle(e.target.value)}
          placeholder="Page title, e.g. Main"
          style={{
            width: "100%",
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "8px 10px",
            fontSize: 14,
            marginBottom: 10,
          }}
        />
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <button
            onClick={handleCreatePage}
            style={{ background: "var(--series-blue)", border: "none", borderRadius: 6, padding: "8px 16px", color: "#fff", cursor: "pointer" }}
          >
            Create
          </button>
          {pages.length > 0 && (
            <button
              onClick={() => setCreatingPage(false)}
              style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 16px", color: "var(--text-secondary)", cursor: "pointer" }}
            >
              Cancel
            </button>
          )}
        </div>
        {error && <p style={{ fontSize: 12, color: "var(--series-red, #d64545)", marginTop: 10 }}>{error}</p>}
      </div>
    );
  }

  const selectedElement = pageDetail?.elements.find((e) => e.id === selectedElementId) ?? null;

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <select
          value={currentPageId ?? ""}
          onChange={(e) => {
            setCurrentPageId(e.target.value);
            setSelectedElementId(null);
          }}
          style={{
            background: "var(--surface-1)",
            color: "var(--text-primary)",
            border: "1px solid var(--border)",
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
          style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 13, color: "var(--text-secondary)", cursor: "pointer" }}
        >
          + New page
        </button>
        {pageDetail?.is_published && (
          <a
            href={`/p/${pageDetail.slug}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 13, color: "var(--series-blue)", marginLeft: "auto" }}
          >
            View live page ↗
          </a>
        )}
      </div>

      {error && (
        <p style={{ fontSize: 12, color: "var(--series-red, #d64545)", marginBottom: 12 }}>
          {error}{" "}
          <button onClick={() => setError(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", textDecoration: "underline" }}>
            dismiss
          </button>
        </p>
      )}

      {pageDetail && (
        <div style={{ display: "grid", gridTemplateColumns: "240px 1fr 320px", gap: 20, alignItems: "start" }}>
          <div>
            <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>Add to page</h3>
            <AddElementPanel onAdd={handleAddElement} />
          </div>

          <PagePreview
            page={pageDetail}
            elements={pageDetail.elements}
            products={products}
            selectedElementId={selectedElementId}
            onSelect={setSelectedElementId}
            onDelete={handleDeleteElement}
            onReorder={handleReorder}
          />

          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 16,
              position: "sticky",
              top: 20,
            }}
          >
            {selectedElement ? (
              <ElementEditor
                element={selectedElement}
                products={products}
                socialLinks={pageDetail.social_links ?? {}}
                onConfigChange={(config) => handleElementConfigChange(selectedElement.id, config)}
                onSocialLinksChange={handleSocialLinksChange}
                onProductCreated={(product) =>
                  setProducts((prev) => (prev.some((p) => p.id === product.id) ? prev : [...prev, product]))
                }
                onDelete={() => handleDeleteElement(selectedElement.id)}
              />
            ) : (
              <PageSettingsEditor page={pageDetail} onChange={handlePageSettingsChange} onDelete={handleDeletePage} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
