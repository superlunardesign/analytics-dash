import type { ElementType } from "../../types";

interface AddElementPanelProps {
  onAdd: (type: ElementType) => void;
}

const ELEMENT_TYPES: { type: ElementType; label: string }[] = [
  { type: "button", label: "Add Button" },
  { type: "card_link", label: "Add Card Link" },
  { type: "carousel", label: "Add Link Carousel" },
  { type: "social_links", label: "Add Social Links" },
  { type: "text", label: "Add Text" },
  { type: "line", label: "Add Line" },
  { type: "photo", label: "Add Photo" },
];

export function AddElementPanel({ onAdd }: AddElementPanelProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {ELEMENT_TYPES.map(({ type, label }) => (
        <button
          key={type}
          onClick={() => onAdd(type)}
          style={{
            textAlign: "left",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 13,
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
