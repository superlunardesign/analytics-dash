import { motion } from "framer-motion";
import { GalleryHorizontal, Image, Minus, MousePointerClick, Share2, SquareArrowOutUpRight, Type } from "lucide-react";
import type { ElementType } from "../../types";

interface AddElementPanelProps {
  onAdd: (type: ElementType) => void;
}

const ELEMENT_TYPES: { type: ElementType; label: string; icon: typeof MousePointerClick }[] = [
  { type: "button", label: "Add Button", icon: MousePointerClick },
  { type: "card_link", label: "Add Card Link", icon: SquareArrowOutUpRight },
  { type: "carousel", label: "Add Link Carousel", icon: GalleryHorizontal },
  { type: "social_links", label: "Add Social Links", icon: Share2 },
  { type: "text", label: "Add Text", icon: Type },
  { type: "line", label: "Add Line", icon: Minus },
  { type: "photo", label: "Add Photo", icon: Image },
];

export function AddElementPanel({ onAdd }: AddElementPanelProps) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {ELEMENT_TYPES.map(({ type, label, icon: Icon }) => (
        <motion.button
          key={type}
          whileHover={{ scale: 1.02, backgroundColor: "var(--gridline)" }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAdd(type)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
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
          <Icon size={16} color="var(--text-secondary)" />
          {label}
        </motion.button>
      ))}
    </div>
  );
}
