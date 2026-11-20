import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicPage, logPublicClick } from "../api";
import { ElementRenderer, SocialLinksRow } from "../components/builder/ElementRenderer";
import type { PublicPage as PublicPageData } from "../types";

export function PublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPageData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    getPublicPage(slug)
      .then((data) => {
        if (!cancelled) setPage(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (notFound) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif" }}>
        <p style={{ color: "#666" }}>This page doesn't exist.</p>
      </div>
    );
  }

  if (!page) {
    return <div style={{ minHeight: "100vh" }} />;
  }

  const theme = page.theme ?? {};
  const handleLinkClick = (url: string, elementId?: string, productId?: string) => {
    if (!slug) return;
    logPublicClick(slug, url, elementId, productId);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(160deg, ${theme.background_from ?? "#ffd9a8"}, ${theme.background_to ?? "#ffc2e0"})`,
        fontFamily: "sans-serif",
        padding: "32px 16px 64px",
      }}
    >
      <div style={{ maxWidth: 420, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#fff", overflow: "hidden", flexShrink: 0 }}>
            {page.avatar_url && <img src={page.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div style={{ fontWeight: 700, fontSize: 18, color: "#111" }}>{page.handle || page.title}</div>
        </div>

        <div style={{ background: "rgba(255,255,255,0.9)", borderRadius: 18, padding: 16, display: "grid", gap: 14 }}>
          {page.elements.map((el) =>
            el.element_type === "social_links" ? (
              <SocialLinksRow
                key={el.id}
                socialLinks={page.social_links ?? {}}
                accentColor={(el.config.color as string) || theme.accent_color}
                align={el.config.align as "left" | "center" | "right" | undefined}
                interactive
                onLinkClick={(url) => handleLinkClick(url, el.id)}
              />
            ) : (
              <ElementRenderer
                key={el.id}
                element={el}
                interactive
                onLinkClick={(url, productId) => handleLinkClick(url, el.id, productId)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
