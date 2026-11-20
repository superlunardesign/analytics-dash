// Bakes per-page social share meta tags (og:title, og:image, etc) into
// index.html at build time. Runs on every `npm run build`, but is a no-op
// unless this is the dedicated public-bio-page deploy (VITE_PUBLIC_PAGE_SLUG
// set) -- the regular dashboard build has no single page to describe and
// is never shared as a link anyway.
//
// This has to happen at build time, not runtime, because social-media link
// unfurlers (iMessage, Slack, Instagram, Facebook, etc) fetch a URL's raw
// HTML and read its <meta> tags WITHOUT running any JavaScript -- tags set
// after the page loads, the normal way a React SPA would do it, are
// invisible to them. Baking the tags into the actual file Render serves is
// the only way a share card shows the right title/image for this app's
// architecture (a static SPA with no server-side rendering).
//
// Soft-fails on any error (missing env vars, network failure, page not
// found) -- never breaks the build. A failed injection just means the
// share card falls back to the generic defaults already in index.html,
// not that the site stops working.

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function main() {
  if (!slug || !apiBaseUrl) {
    console.log("[inject-social-meta] VITE_PUBLIC_PAGE_SLUG/VITE_API_BASE_URL not set -- skipping (this isn't the public-page build).");
    return;
  }

  let page;
  try {
    const resp = await fetch(`${apiBaseUrl}/api/public/pages/${encodeURIComponent(slug)}`);
    if (!resp.ok) {
      console.warn(`[inject-social-meta] /api/public/pages/${slug} returned ${resp.status} -- leaving default meta tags in place.`);
      return;
    }
    page = await resp.json();
  } catch (err) {
    console.warn(`[inject-social-meta] Couldn't fetch page data (${err.message}) -- leaving default meta tags in place.`);
    return;
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

  let html = await readFile(indexPath, "utf-8");

  // Remove any existing <title> (so we don't end up with two) and replace
  // everything between the fixed START/END markers, not the markers
  // themselves -- so running this more than once against an
  // already-injected file (re-running the build locally without reverting,
  // for instance) stays correct instead of only matching on the very first
  // run and silently leaving stale tags in place on every run after that.
  html = html.replace(/<title>.*?<\/title>\s*/s, "");
  html = html.replace(
    /<!-- SOCIAL_META:START -->[\s\S]*?<!-- SOCIAL_META:END -->/,
    `<!-- SOCIAL_META:START -->\n    ${tags}\n    <!-- SOCIAL_META:END -->`
  );

  await writeFile(indexPath, html);
  console.log(`[inject-social-meta] Injected social preview tags for page "${slug}" (title: "${title}").`);
}

await main();
