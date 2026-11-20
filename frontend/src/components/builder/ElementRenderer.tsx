import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef } from "react";
import type { IconType } from "react-icons";
import { FaFacebook, FaInstagram, FaPinterest, FaThreads, FaTiktok, FaYoutube } from "react-icons/fa6";
import type { CarouselConfig, CarouselProductRef, PageElement, Product } from "../../types";

interface ElementRendererProps {
  element: PageElement;
  // Public page: real links that navigate and log a click. Editor
  // preview: inert (clicking selects the element instead -- handled by
  // the parent wrapping this in its own onClick).
  interactive?: boolean;
  onLinkClick?: (url: string, productId?: string) => void;
  // Editor-only: the public API resolves a carousel's product_ids into
  // full `products` server-side (see app/api/public_pages.py), but the
  // editor only ever has product_ids -- this is how its live preview
  // resolves the same display data locally instead of showing nothing.
  productsById?: Map<string, Product>;
}

const SOCIAL_ICON: Record<string, IconType> = {
  instagram: FaInstagram,
  tiktok: FaTiktok,
  pinterest: FaPinterest,
  facebook: FaFacebook,
  threads: FaThreads,
  youtube: FaYoutube,
};

const SOCIAL_URL: Record<string, (handle: string) => string> = {
  instagram: (h) => `https://instagram.com/${h.replace(/^@/, "")}`,
  tiktok: (h) => `https://tiktok.com/@${h.replace(/^@/, "")}`,
  pinterest: (h) => `https://pinterest.com/${h.replace(/^@/, "")}`,
  facebook: (h) => `https://facebook.com/${h.replace(/^@/, "")}`,
  threads: (h) => `https://threads.net/@${h.replace(/^@/, "")}`,
  youtube: (h) => `https://youtube.com/@${h.replace(/^@/, "")}`,
};

function Link({ href, onLinkClick, interactive, children, style }: {
  href: string;
  onLinkClick?: (url: string) => void;
  interactive?: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  if (!interactive || !href) {
    return <div style={style}>{children}</div>;
  }
  return (
    <motion.a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={() => onLinkClick?.(href)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{ ...style, textDecoration: "none", display: "block" }}
    >
      {children}
    </motion.a>
  );
}

export function ElementRenderer({ element, interactive, onLinkClick, productsById }: ElementRendererProps) {
  const c = element.config;
  const carouselScrollRef = useRef<HTMLDivElement>(null);
  const scrollCarousel = (dir: -1 | 1) => carouselScrollRef.current?.scrollBy({ left: dir * 180, behavior: "smooth" });

  switch (element.element_type) {
    case "button": {
      const from = (c.gradient_from as string) || "#ff8a3d";
      const to = (c.gradient_to as string) || "#ff4fa3";
      const href = (c.pdf_url as string) || (c.url as string) || "";
      return (
        <Link href={href} interactive={interactive} onLinkClick={onLinkClick}>
          <div
            style={{
              background: `linear-gradient(90deg, ${from}, ${to})`,
              borderRadius: 10,
              padding: "14px 16px",
              textAlign: "center",
              color: "#fff",
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            {(c.label as string) || "Button"}
          </div>
        </Link>
      );
    }

    case "card_link": {
      const href = (c.url as string) || "";
      return (
        <Link href={href} interactive={interactive} onLinkClick={onLinkClick}>
          <div style={{ display: "flex", gap: 12, background: "#fff", borderRadius: 10, padding: 10, border: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ width: 56, height: 56, borderRadius: 8, background: "#eee", flexShrink: 0, overflow: "hidden" }}>
              {c.image_url ? <img src={c.image_url as string} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#111" }}>{(c.title as string) || "Card link"}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                {(c.description as string) || ""} {href ? "→" : ""}
              </div>
            </div>
          </div>
        </Link>
      );
    }

    case "carousel": {
      const config = c as CarouselConfig;
      const resolvedProducts: CarouselProductRef[] =
        config.products ??
        (config.product_ids ?? [])
          .map((id) => productsById?.get(id))
          .filter((p): p is Product => !!p)
          .map((p) => ({ id: p.id, name: p.name, description: p.description, image_url: p.image_url, source_url: p.source_url }));
      return (
        <div style={{ width: "100%", minWidth: 0 }}>
          {config.heading && <div style={{ fontSize: 14, color: "#111", marginBottom: 8 }}>{config.heading}</div>}
          <div style={{ position: "relative", width: "100%", minWidth: 0 }}>
            <div
              ref={carouselScrollRef}
              style={{
                display: "flex",
                gap: 10,
                overflowX: "auto",
                paddingBottom: 4,
                scrollbarWidth: "none",
                width: "100%",
              }}
            >
              {resolvedProducts.map((p) => (
                <Link key={p.id} href={p.source_url} interactive={interactive} onLinkClick={(url) => onLinkClick?.(url, p.id)}>
                  <div style={{ width: 84, flexShrink: 0 }}>
                    <div style={{ width: 84, height: 84, borderRadius: 8, background: "#eee", overflow: "hidden" }}>
                      {p.image_url && <img src={p.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                    </div>
                    <div style={{ fontSize: 11, color: "#333", marginTop: 4, lineHeight: 1.3 }}>{p.name}</div>
                  </div>
                </Link>
              ))}
              {resolvedProducts.length === 0 && (
                <div style={{ fontSize: 12, color: "#999" }}>No products added yet.</div>
              )}
            </div>
            {resolvedProducts.length > 3 && (
              <>
                <button
                  onClick={() => scrollCarousel(-1)}
                  aria-label="Scroll left"
                  style={{
                    position: "absolute",
                    left: -4,
                    top: 32,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "none",
                    appearance: "none",
                    background: "rgba(255,255,255,0.95)",
                    color: "#333",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  onClick={() => scrollCarousel(1)}
                  aria-label="Scroll right"
                  style={{
                    position: "absolute",
                    right: -4,
                    top: 32,
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    border: "none",
                    appearance: "none",
                    background: "rgba(255,255,255,0.95)",
                    color: "#333",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  <ChevronRight size={14} />
                </button>
              </>
            )}
          </div>
        </div>
      );
    }

    case "social_links": {
      // Rendered from the PAGE's own social_links -- the element itself
      // carries no config, see ElementEditor's SocialLinksEditor.
      return null; // actual rendering happens in PagePreview/PublicPage, which have the page's social_links in scope
    }

    case "text": {
      const align = (c.align as string) || "left";
      const color = (c.color as string) || "#111";
      return (
        <div style={{ textAlign: align as React.CSSProperties["textAlign"] }}>
          {c.heading ? <div style={{ fontWeight: 700, fontSize: 15, color }}>{c.heading as string}</div> : null}
          {c.body ? <div style={{ fontSize: 13, color, opacity: 0.85, marginTop: 4, whiteSpace: "pre-wrap" }}>{c.body as string}</div> : null}
        </div>
      );
    }

    case "line":
      return (
        <hr
          style={{
            border: "none",
            borderTop: `2px ${(c.style as string) === "dotted" ? "dotted" : "solid"} ${(c.color as string) || "#f2a7c9"}`,
            margin: 0,
          }}
        />
      );

    case "photo": {
      const href = (c.link_url as string) || "";
      return (
        <Link href={href} interactive={interactive} onLinkClick={onLinkClick}>
          <div style={{ borderRadius: 10, overflow: "hidden", background: "#eee" }}>
            {c.image_url ? (
              <img src={c.image_url as string} alt="" style={{ width: "100%", display: "block" }} />
            ) : (
              <div style={{ height: 120 }} />
            )}
          </div>
        </Link>
      );
    }

    default:
      return null;
  }
}

export function SocialLinksRow({
  socialLinks,
  accentColor,
  align = "left",
  interactive,
  onLinkClick,
}: {
  socialLinks: Record<string, string | undefined>;
  accentColor?: string;
  align?: "left" | "center" | "right";
  interactive?: boolean;
  onLinkClick?: (url: string) => void;
}) {
  const entries = Object.entries(socialLinks).filter(([, handle]) => handle);
  if (entries.length === 0) return null;
  const justifyContent = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  return (
    <div style={{ display: "flex", gap: 8, justifyContent }}>
      {entries.map(([platform, handle]) => {
        const href = SOCIAL_URL[platform]?.(handle!) ?? "";
        const Icon = SOCIAL_ICON[platform];
        const content = (
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: accentColor || "#111",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {Icon ? <Icon size={16} /> : <span style={{ fontSize: 9, fontWeight: 700 }}>{platform.slice(0, 2).toUpperCase()}</span>}
          </div>
        );
        return interactive ? (
          <a key={platform} href={href} target="_blank" rel="noreferrer" onClick={() => onLinkClick?.(href)}>
            {content}
          </a>
        ) : (
          <div key={platform}>{content}</div>
        );
      })}
    </div>
  );
}
