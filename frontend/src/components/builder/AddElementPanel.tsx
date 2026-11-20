import { motion } from "framer-motion";
import { FaFacebook, FaInstagram, FaPinterest, FaTiktok } from "react-icons/fa6";
import type { ElementType } from "../../types";
import { TINASUZE_ACCENT_SOFT, TINASUZE_TEXT, TINASUZE_TEXT_MUTED } from "../../tinasuzeTheme";

interface AddElementPanelProps {
  onAdd: (type: ElementType) => void;
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: TINASUZE_TEXT, marginBottom: 8 };

function ButtonPreview() {
  return (
    <div
      style={{
        background: "linear-gradient(90deg, #ff8a3d, #ff4fa3)",
        borderRadius: 10,
        padding: "12px 14px",
        textAlign: "center",
        color: "#fff",
        fontWeight: 700,
        fontSize: 13,
      }}
    >
      Your Button
    </div>
  );
}

function CardLinkPreview() {
  return (
    <div style={{ display: "flex", gap: 10, background: "#f3f1ee", borderRadius: 10, padding: 10 }}>
      <div style={{ width: 44, height: 44, borderRadius: 8, background: "#e3e0da", flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: TINASUZE_TEXT }}>Link title</div>
        <div style={{ fontSize: 11, color: TINASUZE_TEXT_MUTED, marginTop: 2, lineHeight: 1.3 }}>A short description →</div>
      </div>
    </div>
  );
}

function CarouselPreview() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            flex: 1,
            aspectRatio: "1 / 1",
            borderRadius: 8,
            background: "linear-gradient(160deg, #ffd9ec, #ffc2e0)",
          }}
        />
      ))}
    </div>
  );
}

function SocialLinksPreview() {
  const icons = [FaInstagram, FaTiktok, FaPinterest, FaFacebook];
  return (
    <div style={{ display: "flex", gap: 8 }}>
      {icons.map((Icon, i) => (
        <div
          key={i}
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: TINASUZE_TEXT,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon size={13} />
        </div>
      ))}
    </div>
  );
}

function TextPreview() {
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 13, color: TINASUZE_TEXT }}>Heading</div>
      <div style={{ fontSize: 11, color: TINASUZE_TEXT_MUTED, marginTop: 2 }}>Body text goes here</div>
    </div>
  );
}

function LinePreview() {
  return <div style={{ height: 2, borderRadius: 2, background: "linear-gradient(90deg, #ff8a3d, #ff4fa3)" }} />;
}

function PhotoPreview() {
  return <div style={{ height: 56, borderRadius: 8, background: "#e3e0da" }} />;
}

function ImageCardRowPreview() {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ flex: 1 }}>
        <div style={{ position: "relative", aspectRatio: "4 / 5", borderRadius: 8, background: "#e3e0da", overflow: "hidden" }}>
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              background: "#111",
              color: "#fff",
              fontSize: 9,
              fontWeight: 800,
              letterSpacing: 0.4,
              padding: "3px 7px",
              borderRadius: 4,
            }}
          >
            POPULAR
          </div>
        </div>
        <div style={{ fontSize: 11, fontWeight: 700, color: TINASUZE_TEXT, marginTop: 6 }}>All My Hair Products</div>
      </div>
      <div style={{ flex: 1, opacity: 0.4 }}>
        <div style={{ aspectRatio: "4 / 5", borderRadius: 8, background: "#e3e0da" }} />
        <div style={{ fontSize: 11, fontWeight: 700, color: TINASUZE_TEXT, marginTop: 6 }}>Optional 2nd card</div>
      </div>
    </div>
  );
}

const ELEMENT_TYPES: { type: ElementType; label: string; preview: () => React.ReactElement }[] = [
  { type: "button", label: "Add Button", preview: ButtonPreview },
  { type: "card_link", label: "Add Card Link", preview: CardLinkPreview },
  { type: "image_card_row", label: "Add Image Card", preview: ImageCardRowPreview },
  { type: "carousel", label: "Add Link Carousel", preview: CarouselPreview },
  { type: "social_links", label: "Add Social Links", preview: SocialLinksPreview },
  { type: "text", label: "Add Text", preview: TextPreview },
  { type: "line", label: "Add Line", preview: LinePreview },
  { type: "photo", label: "Add Photo", preview: PhotoPreview },
];

export function AddElementPanel({ onAdd }: AddElementPanelProps) {
  return (
    <div>
      {ELEMENT_TYPES.map(({ type, label, preview: Preview }, i) => (
        <motion.button
          key={type}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onAdd(type)}
          style={{
            display: "block",
            textAlign: "left",
            background: "none",
            border: "none",
            borderBottom: i < ELEMENT_TYPES.length - 1 ? `1px solid ${TINASUZE_ACCENT_SOFT}` : "none",
            padding: "16px 0",
            margin: 0,
            cursor: "pointer",
            width: "100%",
          }}
        >
          <div style={labelStyle}>{label}</div>
          <Preview />
        </motion.button>
      ))}
    </div>
  );
}
