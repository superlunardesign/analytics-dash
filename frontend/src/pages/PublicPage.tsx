import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getPublicPage, logPublicClick } from "../api";
import { ElementRenderer, SocialLinksRow } from "../components/builder/ElementRenderer";
import type { PublicPage as PublicPageData } from "../types";

interface PublicPageProps {
  // Set when this is being rendered for a custom domain that always shows
  // one fixed page (see App.tsx) rather than the normal /p/:slug route.
  slugOverride?: string;
}

const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID as string | undefined;

// Unlike the social-preview <meta> tags (baked in at build time -- see
// scripts/inject-social-meta.mjs -- because link-unfurler bots never run
// JS), Clarity only needs to run in a real visitor's browser, so it's
// injected right here at runtime instead. That means it only ever loads
// when this component actually renders (never on the /builder/* dashboard
// routes), works on the single shared frontend deploy with nothing more
// than one env var, and needs no second dedicated static site the way the
// social tags do.
function loadClarity() {
  if (!CLARITY_PROJECT_ID || document.getElementById("ms-clarity")) return;
  const script = document.createElement("script");
  script.id = "ms-clarity";
  script.text = `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");`;
  document.head.appendChild(script);
}

export function PublicPage({ slugOverride }: PublicPageProps = {}) {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const slug = slugOverride ?? routeSlug;
  const [searchParams] = useSearchParams();
  // ?preview=1 -- set automatically by the "View live page" link in the
  // dashboard, so checking your own published page never counts as a
  // real visit/click in your own analytics.
  const isPreview = searchParams.get("preview") === "1";
  const [page, setPage] = useState<PublicPageData | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // Same reasoning as the preview-mode skip on page visits/clicks below --
    // your own visits to "View live page" shouldn't show up as a real
    // visitor session in Clarity either.
    if (!isPreview) loadClarity();
  }, [isPreview]);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    getPublicPage(slug, isPreview)
      .then((data) => {
        if (!cancelled) setPage(data);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, isPreview]);

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
    logPublicClick(slug, url, elementId, productId, isPreview);
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
                amazonAssociateTag={page.amazon_associate_tag}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
