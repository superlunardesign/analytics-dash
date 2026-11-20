import { ArrowLeft, ChevronDown, ChevronUp, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import type { CarouselProductRef, ElementConfig, PageElement, Product, SocialLinksMap } from "../../types";
import { ColorField } from "./ColorField";
import { ImageUploadField } from "./ImageUploadField";
import { ProductPicker } from "./ProductPicker";

interface ElementEditorProps {
  element: PageElement;
  products: Product[];
  socialLinks: SocialLinksMap;
  onConfigChange: (config: ElementConfig) => void;
  onSocialLinksChange: (links: SocialLinksMap) => void;
  onProductSaved: (product: Product) => void;
  onDelete: () => void;
  onDeselect: () => void;
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  background: "var(--surface-1)",
  color: "var(--text-primary)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: "6px 8px",
  fontSize: 13,
};

const labelStyle: React.CSSProperties = { fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 10 };

const SOCIAL_PLATFORMS: { key: keyof SocialLinksMap; label: string }[] = [
  { key: "instagram", label: "Instagram" },
  { key: "tiktok", label: "Tiktok" },
  { key: "pinterest", label: "Pinterest" },
  { key: "facebook", label: "Facebook" },
  { key: "threads", label: "Threads" },
  { key: "youtube", label: "Youtube" },
];

function ButtonEditor({ config, onChange }: { config: ElementConfig; onChange: (c: ElementConfig) => void }) {
  return (
    <>
      <label style={labelStyle}>
        Label
        <input style={inputStyle} value={(config.label as string) ?? ""} onChange={(e) => onChange({ ...config, label: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Link URL
        <input style={inputStyle} value={(config.url as string) ?? ""} onChange={(e) => onChange({ ...config, url: e.target.value })} placeholder="https://… or leave blank and set a PDF below" />
      </label>
      <label style={labelStyle}>
        Or link to a PDF (e.g. your media kit)
        <input style={inputStyle} value={(config.pdf_url as string) ?? ""} onChange={(e) => onChange({ ...config, pdf_url: e.target.value })} placeholder="https://…/media-kit.pdf" />
      </label>
      <ColorField label="Gradient from" value={(config.gradient_from as string) ?? "#ff8a3d"} onChange={(v) => onChange({ ...config, gradient_from: v })} />
      <ColorField label="Gradient to" value={(config.gradient_to as string) ?? "#ff4fa3"} onChange={(v) => onChange({ ...config, gradient_to: v })} />
    </>
  );
}

function CardLinkEditor({ config, onChange }: { config: ElementConfig; onChange: (c: ElementConfig) => void }) {
  return (
    <>
      <label style={labelStyle}>
        Title
        <input style={inputStyle} value={(config.title as string) ?? ""} onChange={(e) => onChange({ ...config, title: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Description
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={2} value={(config.description as string) ?? ""} onChange={(e) => onChange({ ...config, description: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Link URL
        <input style={inputStyle} value={(config.url as string) ?? ""} onChange={(e) => onChange({ ...config, url: e.target.value })} />
      </label>
      <ImageUploadField label="Image (optional)" value={(config.image_url as string) ?? ""} onChange={(url) => onChange({ ...config, image_url: url })} />
    </>
  );
}

function CarouselEditor({
  config,
  products,
  onChange,
  onProductSaved,
}: {
  config: ElementConfig;
  products: Product[];
  onChange: (c: ElementConfig) => void;
  onProductSaved: (product: Product) => void;
}) {
  const [picking, setPicking] = useState(false);
  const productIds = (config.product_ids as string[]) ?? [];
  const byId = new Map(products.map((p) => [p.id, p]));
  const selected = productIds.map((id) => byId.get(id)).filter((p): p is Product => !!p);

  const setIds = (ids: string[]) => onChange({ ...config, product_ids: ids });
  const remove = (id: string) => setIds(productIds.filter((pid) => pid !== id));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...productIds];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setIds(next);
  };

  return (
    <>
      <label style={labelStyle}>
        Category heading
        <input style={inputStyle} value={(config.heading as string) ?? ""} onChange={(e) => onChange({ ...config, heading: e.target.value })} placeholder="e.g. Hair Tools & Products" />
      </label>
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>Products ({selected.length})</div>
      <div style={{ display: "grid", gap: 6, marginBottom: 8 }}>
        {selected.map((p, i) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--gridline)", borderRadius: 6, padding: 6 }}>
            {p.image_url ? (
              <img src={p.image_url} alt="" style={{ width: 24, height: 24, borderRadius: 4, objectFit: "cover" }} />
            ) : (
              <div style={{ width: 24, height: 24, borderRadius: 4, background: "var(--surface-1)" }} />
            )}
            <span style={{ fontSize: 12, flex: 1, color: "var(--text-primary)" }}>{p.name}</span>
            <button onClick={() => move(i, -1)} disabled={i === 0} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><ChevronUp size={14} /></button>
            <button onClick={() => move(i, 1)} disabled={i === selected.length - 1} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><ChevronDown size={14} /></button>
            <button onClick={() => remove(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--series-red, #d64545)", display: "flex" }}><X size={14} /></button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setPicking((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 12px", fontSize: 12, color: "var(--text-secondary)", cursor: "pointer" }}
      >
        {picking ? (
          <>
            <X size={13} /> Close
          </>
        ) : (
          <>
            <Plus size={13} /> Add product
          </>
        )}
      </button>
      {picking && (
        <ProductPicker
          products={products}
          onClose={() => setPicking(false)}
          onProductUpdated={onProductSaved}
          onAdd={(product) => {
            onProductSaved(product);
            if (!productIds.includes(product.id)) setIds([...productIds, product.id]);
          }}
        />
      )}
    </>
  );
}

function SocialLinksEditor({ socialLinks, onChange }: { socialLinks: SocialLinksMap; onChange: (l: SocialLinksMap) => void }) {
  return (
    <>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>
        This row shows whichever of these handles you've filled in -- edited here applies to every Social Links block on this page.
      </p>
      {SOCIAL_PLATFORMS.map(({ key, label }) => (
        <label key={key} style={labelStyle}>
          {label}
          <input
            style={inputStyle}
            value={socialLinks[key] ?? ""}
            onChange={(e) => onChange({ ...socialLinks, [key]: e.target.value })}
            placeholder="@handle"
          />
        </label>
      ))}
    </>
  );
}

function TextEditor({ config, onChange }: { config: ElementConfig; onChange: (c: ElementConfig) => void }) {
  return (
    <>
      <label style={labelStyle}>
        Heading
        <input style={inputStyle} value={(config.heading as string) ?? ""} onChange={(e) => onChange({ ...config, heading: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Body
        <textarea style={{ ...inputStyle, resize: "vertical" }} rows={3} value={(config.body as string) ?? ""} onChange={(e) => onChange({ ...config, body: e.target.value })} />
      </label>
    </>
  );
}

function LineEditor({ config, onChange }: { config: ElementConfig; onChange: (c: ElementConfig) => void }) {
  return (
    <>
      <label style={labelStyle}>
        Style
        <select style={inputStyle} value={(config.style as string) ?? "solid"} onChange={(e) => onChange({ ...config, style: e.target.value })}>
          <option value="solid">Solid</option>
          <option value="dotted">Dotted</option>
        </select>
      </label>
      <ColorField label="Color" value={(config.color as string) ?? "#f2a7c9"} onChange={(v) => onChange({ ...config, color: v })} />
    </>
  );
}

function PhotoEditor({ config, onChange }: { config: ElementConfig; onChange: (c: ElementConfig) => void }) {
  return (
    <>
      <ImageUploadField label="Image" value={(config.image_url as string) ?? ""} onChange={(url) => onChange({ ...config, image_url: url })} />
      <label style={labelStyle}>
        Link when tapped (optional)
        <input style={inputStyle} value={(config.link_url as string) ?? ""} onChange={(e) => onChange({ ...config, link_url: e.target.value })} />
      </label>
    </>
  );
}

const TYPE_LABELS: Record<string, string> = {
  button: "Button",
  card_link: "Card link",
  carousel: "Link carousel",
  social_links: "Social links",
  text: "Text",
  line: "Line",
  photo: "Photo",
};

export function ElementEditor({
  element,
  products,
  socialLinks,
  onConfigChange,
  onSocialLinksChange,
  onProductSaved,
  onDelete,
  onDeselect,
}: ElementEditorProps) {
  return (
    <div>
      <button
        onClick={onDeselect}
        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--series-blue)", cursor: "pointer", fontSize: 12, padding: 0, marginBottom: 12 }}
      >
        <ArrowLeft size={13} /> Page settings
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>{TYPE_LABELS[element.element_type] ?? element.element_type}</h3>
        <button
          onClick={onDelete}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: "var(--series-red, #d64545)", cursor: "pointer", fontSize: 12 }}
        >
          <Trash2 size={13} /> Delete
        </button>
      </div>
      {element.element_type === "button" && <ButtonEditor config={element.config} onChange={onConfigChange} />}
      {element.element_type === "card_link" && <CardLinkEditor config={element.config} onChange={onConfigChange} />}
      {element.element_type === "carousel" && (
        <CarouselEditor config={element.config} products={products} onChange={onConfigChange} onProductSaved={onProductSaved} />
      )}
      {element.element_type === "social_links" && (
        <SocialLinksEditor socialLinks={socialLinks} onChange={onSocialLinksChange} />
      )}
      {element.element_type === "text" && <TextEditor config={element.config} onChange={onConfigChange} />}
      {element.element_type === "line" && <LineEditor config={element.config} onChange={onConfigChange} />}
      {element.element_type === "photo" && <PhotoEditor config={element.config} onChange={onConfigChange} />}
    </div>
  );
}

// Re-exported so the public renderer can share the exact same shape
// without re-deriving it.
export type { CarouselProductRef };
