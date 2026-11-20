import { Trash2 } from "lucide-react";
import type { CreatorPage, PageTheme } from "../../types";
import { ColorField } from "./ColorField";
import { ImageUploadField } from "./ImageUploadField";
import { ToggleSwitch } from "./ToggleSwitch";

interface PageSettingsEditorProps {
  page: CreatorPage;
  onChange: (updates: Partial<CreatorPage>) => void;
  onDelete: () => void;
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

export function PageSettingsEditor({ page, onChange, onDelete }: PageSettingsEditorProps) {
  const theme: PageTheme = page.theme ?? {};

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>Page settings</h3>
        <ToggleSwitch checked={page.is_published} onChange={(checked) => onChange({ is_published: checked })} label="Published" />
      </div>

      <label style={labelStyle}>
        Title
        <input style={inputStyle} value={page.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <label style={labelStyle}>
        Handle (shown as @handle at the top of the page)
        <input style={inputStyle} value={page.handle ?? ""} onChange={(e) => onChange({ handle: e.target.value })} placeholder="@yourname" />
      </label>
      <label style={labelStyle}>
        URL slug (yoursite.com/p/<strong>{page.slug || "slug"}</strong>)
        <input
          style={inputStyle}
          value={page.slug}
          onChange={(e) => onChange({ slug: e.target.value.trim().toLowerCase().replace(/\s+/g, "-") })}
        />
      </label>
      <ImageUploadField label="Avatar" value={page.avatar_url ?? ""} onChange={(url) => onChange({ avatar_url: url })} />

      <div style={{ marginTop: 6, marginBottom: 6, fontSize: 12, color: "var(--text-secondary)" }}>Background & accent</div>
      <ColorField
        label="Gradient from"
        value={theme.background_from ?? "#ffd9a8"}
        onChange={(v) => onChange({ theme: { ...theme, background_from: v } })}
      />
      <ColorField
        label="Gradient to"
        value={theme.background_to ?? "#ffc2e0"}
        onChange={(v) => onChange({ theme: { ...theme, background_to: v } })}
      />
      <ColorField
        label="Accent"
        value={theme.accent_color ?? "#ff4fa3"}
        onChange={(v) => onChange({ theme: { ...theme, accent_color: v } })}
      />

      <button
        onClick={onDelete}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          marginTop: 16,
          background: "transparent",
          border: "1px solid var(--series-red, #d64545)",
          color: "var(--series-red, #d64545)",
          borderRadius: 6,
          padding: "6px 12px",
          fontSize: 12,
          cursor: "pointer",
        }}
      >
        <Trash2 size={13} /> Delete this page
      </button>
    </div>
  );
}
