// Bakes per-page social share meta tags (og:title, og:image, etc) and any
// third-party head scripts (e.g. Microsoft Clarity) into index.html at
// build time. Runs on every `npm run build`, but is a no-op unless this is
// the dedicated public-bio-page deploy (VITE_PUBLIC_PAGE_SLUG set) -- the
// regular dashboard build has no single page to describe, and dashboard
// usage shouldn't be mixed into the public page's own visitor analytics.
//
// The social-preview part has to happen at build time, not runtime,
// because social-media link unfurlers (iMessage, Slack, Instagram,
// Facebook, etc) fetch a URL's raw HTML and read its <meta> tags WITHOUT
// running any JavaScript -- tags set after the page loads, the normal way
// a React SPA would do it, are invisible to them. Baking the tags into the
// actual file Render serves is the only way a share card shows the right
// title/image for this app's architecture (a static SPA with no
// server-side rendering).
//
// The social-preview fetch soft-fails on any error (missing env vars,
// network failure, page not found) -- never breaks the build. A failed
// fetch just means the share card falls back to the generic defaults
// already in index.html, not that the site stops working. The
// third-party-script injection doesn't depend on that fetch at all, so it
// still runs even if the page-data fetch fails.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, "..", "index.html");

const slug = process.env.VITE_PUBLIC_PAGE_SLUG;
const apiBaseUrl = process.env.VITE_API_BASE_URL;
// Optional -- the real public-facing URL (custom domain) for og:url. Omitted
// from the card entirely if not set, rather than guessing wrong.
const siteUrl = process.env.VITE_PUBLIC_SITE_URL;
// Optional -- Microsoft Clarity project id (the "zgutxt0obl"-shaped string
// from clarity.ms). Omitted entirely if not set.
const clarityProjectId = process.env.VITE_CLARITY_PROJECT_ID;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function replaceBetweenMarkers(html, markerName, content) {
  return html.replace(
    new RegExp(`<!-- ${markerName}:START -->[\\s\\S]*?<!-- ${markerName}:END -->`),
    `<!-- ${markerName}:START -->\n    ${content}\n    <!-- ${markerName}:END -->`
  );
}

async function injectThirdPartyScripts(html) {
  // Gated on the same "is this the public-page build" check as the social
  // tags -- this is visitor analytics for the bio page specifically, never
  // meant to load on the dashboard even if this var got set there by mistake.
  if (!slug || !apiBaseUrl || !clarityProjectId) return html;
  // Microsoft's own loader snippet, verbatim (just re-indented) -- a
  // project id is not a secret (it's meant to sit in public page source),
  // so this is safe to bake into the static file.
  const clarityScript = `<script type="text/javascript">
      (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${clarityProjectId}");
    </script>`;
  return replaceBetweenMarkers(html, "THIRD_PARTY_SCRIPTS", clarityScript);
}

async function injectSocialMeta(html) {
  if (!slug || !apiBaseUrl) {
    console.log("[inject-head] VITE_PUBLIC_PAGE_SLUG/VITE_API_BASE_URL not set -- skipping social preview tags (this isn't the public-page build).");
    return html;
  }

  let page;
  try {
    const resp = await fetch(`${apiBaseUrl}/api/public/pages/${encodeURIComponent(slug)}`);
    if (!resp.ok) {
      console.warn(`[inject-head] /api/public/pages/${slug} returned ${resp.status} -- leaving default meta tags in place.`);
      return html;
    }
    page = await resp.json();
  } catch (err) {
    console.warn(`[inject-head] Couldn't fetch page data (${err.message}) -- leaving default meta tags in place.`);
    return html;
  }

  const title = page.og_title || page.title || "Link in bio";
  const description = page.og_description || `Check out ${page.handle ? "@" + page.handle.replace(/^@/, "") : page.title}'s links`;
  const image = page.og_image_url || page.avatar_url || null;

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}" />` : null,
    siteUrl ? `<meta property="og:url" content="${escapeHtml(siteUrl)}" />` : null,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}" />` : null,
  ]
    .filter(Boolean)
    .join("\n    ");

  // Remove any existing <title> (so we don't end up with two) before
  // replacing the marker block with the new tags.
  html = html.replace(/<title>.*?<\/title>\s*/s, "");
  html = replaceBetweenMarkers(html, "SOCIAL_META", tags);
  console.log(`[inject-head] Injected social preview tags for page "${slug}" (title: "${title}").`);
  return html;
}

async function main() {
  let html = await readFile(indexPath, "utf-8");
  // Order matters: the title removal in injectSocialMeta runs on whatever
  // html already has from a possible earlier run, so do it first; the
  // third-party scripts marker is independent of that.
  html = await injectSocialMeta(html);
  html = await injectThirdPartyScripts(html);
  await writeFile(indexPath, html);
}

await main();
