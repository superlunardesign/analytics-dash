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
          onChange={(e) => {
            // An empty slug breaks the live page link entirely (it becomes
            // "/p/" with nothing after the slash, which doesn't match any
            // route and silently bounces to the dashboard) -- never commit
            // one, even mid-edit while someone's retyping it.
            const slug = e.target.value
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/(^-|-$)/g, "");
            if (slug) onChange({ slug });
          }}
        />
      </label>
      {!page.slug && (
        <p style={{ fontSize: 11, color: "var(--series-red, #d64545)", marginTop: -6, marginBottom: 10 }}>
          This page has no URL slug yet, so its live link won't work -- type one above.
        </p>
      )}
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

      <div style={{ marginTop: 14, marginBottom: 6, fontSize: 12, color: "var(--text-secondary)" }}>Amazon</div>
      <label style={labelStyle}>
        Associates tracking tag
        <input
          style={inputStyle}
          value={page.amazon_associate_tag ?? ""}
          onChange={(e) => onChange({ amazon_associate_tag: e.target.value || null })}
          placeholder="e.g. tinasuze-20"
        />
      </label>
      <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: -6, marginBottom: 10 }}>
        Needed for any carousel's "Add All to Cart" button to credit your Amazon Associates account.
      </p>

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
