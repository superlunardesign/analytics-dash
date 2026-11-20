import { Pencil, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createProduct, previewLink, updateProduct } from "../../api";
import type { Product } from "../../types";
import { ImageUploadField } from "./ImageUploadField";

interface ProductPickerProps {
  products: Product[];
  onAdd: (product: Product) => void;
  // Catalog-only update (editing an existing product's details) -- does
  // NOT add/re-add it to the current carousel, unlike onAdd.
  onProductUpdated: (product: Product) => void;
  onClose: () => void;
  // Jump straight into editing this product (e.g. opened via the Edit
  // pencil on a product already in a carousel) instead of landing on
  // "Choose existing"/"Paste a new link" first.
  initialEditProduct?: Product | null;
}

// Fields prefilled by the OG-tag fetch (app/integrations/link_preview.py)
// -- editable before saving, since the fetch is best-effort and Amazon in
// particular blocks it outright fairly often.
interface DraftProduct {
  sourceUrl: string;
  name: string;
  description: string;
  imageUrl: string;
}

const EMPTY_DRAFT: DraftProduct = { sourceUrl: "", name: "", description: "", imageUrl: "" };

export function ProductPicker({ products, onAdd, onProductUpdated, onClose, initialEditProduct }: ProductPickerProps) {
  const [mode, setMode] = useState<"existing" | "new">(products.length > 0 ? "existing" : "new");
  const [draft, setDraft] = useState<DraftProduct>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchNote, setFetchNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEditing = (product: Product) => {
    setEditingId(product.id);
    setDraft({
      sourceUrl: product.source_url,
      name: product.name,
      description: product.description ?? "",
      imageUrl: product.image_url ?? "",
    });
    setError(null);
    setMode("new");
  };

  // Re-fires on every distinct edit request, not just on mount -- if the
  // picker was already open (e.g. right after adding a product, before
  // it's closed), clicking Edit elsewhere just changes this prop on an
  // already-mounted component rather than remounting it.
  useEffect(() => {
    if (initialEditProduct) startEditing(initialEditProduct);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditProduct?.id]);

  const cancelForm = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setMode(products.length > 0 ? "existing" : "new");
  };

  const handleFetchPreview = async () => {
    if (!draft.sourceUrl.trim()) return;
    setFetching(true);
    setFetchNote(null);
    try {
      const preview = await previewLink(draft.sourceUrl.trim());
      if (preview.ok) {
        setDraft((d) => ({
          ...d,
          name: preview.name ?? d.name,
          description: preview.description ?? d.description,
          imageUrl: preview.image_url ?? d.imageUrl,
        }));
        setFetchNote(null);
      } else {
        setFetchNote(preview.error ?? "Couldn't fetch a preview -- enter the details below by hand.");
      }
    } catch (err) {
      setFetchNote(err instanceof Error ? err.message : "Couldn't fetch a preview -- enter the details below by hand.");
    } finally {
      setFetching(false);
    }
  };

  const handleSave = async () => {
    if (!draft.sourceUrl.trim() || !draft.name.trim()) {
      setError("A link and a name are both required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        const product = await updateProduct(editingId, {
          source_url: draft.sourceUrl.trim(),
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          custom_image_url: draft.imageUrl || null,
          image_url: draft.imageUrl || null,
        });
        onProductUpdated(product);
      } else {
        const product = await createProduct({
          source_url: draft.sourceUrl.trim(),
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          og_image_url: draft.imageUrl || null,
          image_url: draft.imageUrl || null,
        });
        onAdd(product);
      }
      cancelForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save this product");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 12,
        background: "var(--gridline)",
        marginTop: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={() => setMode("existing")}
            style={{
              background: mode === "existing" ? "var(--series-blue)" : "transparent",
              color: mode === "existing" ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Choose existing
          </button>
          <button
            onClick={() => setMode("new")}
            style={{
              background: mode === "new" ? "var(--series-blue)" : "transparent",
              color: mode === "new" ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Paste a new link
          </button>
        </div>
        <button
          onClick={onClose}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
        >
          <X size={13} /> Close
        </button>
      </div>

      {mode === "existing" && (
        <div style={{ display: "grid", gap: 6, maxHeight: 220, overflowY: "auto" }}>
          {products.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No products in your catalog yet -- paste a link instead.</p>
          )}
          {products.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--surface-1)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: 6,
              }}
            >
              <button
                onClick={() => onAdd(p)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  textAlign: "left",
                  minWidth: 0,
                }}
              >
                {p.image_url ? (
                  <img src={p.image_url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--gridline)", flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.name}
                </span>
              </button>
              <button
                onClick={() => startEditing(p)}
                title="Edit this product"
                style={{ display: "flex", background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", flexShrink: 0, padding: 4 }}
              >
                <Pencil size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === "new" && (
        <div>
          {editingId && (
            <p style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 8, fontWeight: 600 }}>Editing product</p>
          )}
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <input
              type="text"
              value={draft.sourceUrl}
              placeholder="Paste a product/affiliate link…"
              onChange={(e) => setDraft((d) => ({ ...d, sourceUrl: e.target.value }))}
              style={{
                flex: 1,
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 12,
              }}
            />
            <button
              onClick={handleFetchPreview}
              disabled={fetching || !draft.sourceUrl.trim()}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "var(--series-violet)",
                border: "none",
                borderRadius: 6,
                padding: "6px 12px",
                color: "#fff",
                fontSize: 12,
                cursor: fetching ? "default" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              <Sparkles size={13} />
              {fetching ? "Fetching…" : "Fetch preview"}
            </button>
          </div>
          {fetchNote && <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>{fetchNote}</p>}

          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
            Name
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 12,
              }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 10 }}>
            Description
            <textarea
              value={draft.description}
              onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
              rows={2}
              style={{
                display: "block",
                width: "100%",
                marginTop: 4,
                background: "var(--surface-1)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 12,
                resize: "vertical",
              }}
            />
          </label>
          <ImageUploadField
            label="Image (defaults to the fetched preview -- upload to override)"
            value={draft.imageUrl}
            onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
          />
          {error && <p style={{ fontSize: 12, color: "var(--series-red, #d64545)", marginBottom: 8 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: "var(--series-blue)",
                border: "none",
                borderRadius: 6,
                padding: "6px 14px",
                color: "#fff",
                fontSize: 12,
                fontWeight: 600,
                cursor: saving ? "default" : "pointer",
              }}
            >
              {saving ? "Saving…" : editingId ? "Save changes" : "Add to carousel"}
            </button>
            {editingId && (
              <button
                onClick={cancelForm}
                style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 14px", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
