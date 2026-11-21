import { Check, Copy, ExternalLink } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getPageVisits, getTopLinkClicks, getTopProducts, listPages } from "../api";
import { LineChart } from "../components/LineChart";
import { formatNumber, parseDateInputToISO } from "../format";
import { TINASUZE_ACCENT, TINASUZE_ACCENT_SOFT, TINASUZE_BORDER, TINASUZE_CARD, TINASUZE_TEXT, TINASUZE_TEXT_MUTED } from "../tinasuzeTheme";
import type { CreatorPage, PageVisitPoint, TopLinkClick, TopProduct } from "../types";

type RangePreset = 7 | 30 | 90 | 365 | "all";

function rangeForPreset(preset: RangePreset): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  if (preset === "all") {
    start.setDate(start.getDate() - 3 * 365);
  } else {
    start.setDate(start.getDate() - preset);
  }
  return { start: start.toISOString(), end: end.toISOString() };
}

function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

const controlStyle: React.CSSProperties = {
  border: `1px solid ${TINASUZE_BORDER}`,
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 13,
  background: "#fff",
  color: TINASUZE_TEXT,
};

export function BuilderAnalyticsPage() {
  const [pages, setPages] = useState<CreatorPage[]>([]);
  const [pageId, setPageId] = useState<string>("");

  const [preset, setPreset] = useState<RangePreset>(30);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [pendingRange, setPendingRange] = useState<{ start: string; end: string } | null>(null);

  const [visits, setVisits] = useState<PageVisitPoint[]>([]);
  const [topLinks, setTopLinks] = useState<TopLinkClick[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const range = useMemo(() => customRange ?? rangeForPreset(preset), [customRange, preset]);

  useEffect(() => {
    listPages().then(setPages);
  }, []);

  useEffect(() => {
    setLoading(true);
    const scopedPageId = pageId || undefined;
    Promise.all([
      getPageVisits(range.start, range.end, scopedPageId),
      getTopLinkClicks(range.start, range.end, scopedPageId),
      getTopProducts(range.start, range.end, scopedPageId),
    ])
      .then(([visitsRes, linksRes, productsRes]) => {
        setVisits(visitsRes);
        setTopLinks(linksRes);
        setTopProducts(productsRes);
      })
      .finally(() => setLoading(false));
  }, [range.start, range.end, pageId]);

  const dates = visits.map((v) => v.date);
  const series = [{ key: "visits", label: "Page visits", color: TINASUZE_ACCENT, values: visits.map((v) => v.visits), axis: "left" as const }];

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl((prev) => (prev === url ? null : prev)), 1500);
    } catch {
      // clipboard permissions can be denied -- not worth surfacing as an error
    }
  };

  return (
    <div style={{ maxWidth: 1400, margin: "0 auto", padding: "0 24px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={pageId} onChange={(e) => setPageId(e.target.value)} style={controlStyle}>
          <option value="">All pages</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {([7, 30, 90, 365] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPreset(p);
                setCustomRange(null);
              }}
              style={{
                ...controlStyle,
                background: !customRange && preset === p ? TINASUZE_ACCENT : "#fff",
                color: !customRange && preset === p ? "#fff" : TINASUZE_TEXT_MUTED,
                border: !customRange && preset === p ? "none" : controlStyle.border,
                padding: "5px 10px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              Last {p}d
            </button>
          ))}
          <button
            onClick={() => {
              setPreset("all");
              setCustomRange(null);
            }}
            style={{
              ...controlStyle,
              background: !customRange && preset === "all" ? TINASUZE_ACCENT : "#fff",
              color: !customRange && preset === "all" ? "#fff" : TINASUZE_TEXT_MUTED,
              border: !customRange && preset === "all" ? "none" : controlStyle.border,
              padding: "5px 10px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            All time
          </button>
          <button
            onClick={() => {
              if (showCustomRange) {
                setShowCustomRange(false);
              } else {
                setPendingRange(customRange ?? range);
                setShowCustomRange(true);
              }
            }}
            style={{
              background: "transparent",
              color: customRange ? TINASUZE_ACCENT : TINASUZE_TEXT_MUTED,
              border: "none",
              borderBottom: `1px dashed ${TINASUZE_BORDER}`,
              padding: "4px 6px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Custom range…
          </button>
        </div>
      </div>

      {showCustomRange && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>
            From{" "}
            <input
              type="date"
              value={toDateInputValue(pendingRange?.start ?? range.start)}
              onChange={(e) => setPendingRange((prev) => ({ start: parseDateInputToISO(e.target.value, prev?.start ?? range.start), end: prev?.end ?? range.end }))}
              style={{ ...controlStyle, padding: "4px 6px", fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>
            To{" "}
            <input
              type="date"
              value={toDateInputValue(pendingRange?.end ?? range.end)}
              onChange={(e) => setPendingRange((prev) => ({ start: prev?.start ?? range.start, end: parseDateInputToISO(e.target.value, prev?.end ?? range.end) }))}
              style={{ ...controlStyle, padding: "4px 6px", fontSize: 12 }}
            />
          </label>
          <button
            onClick={() => {
              if (pendingRange) setCustomRange(pendingRange);
            }}
            style={{ background: TINASUZE_ACCENT, color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            Apply
          </button>
        </div>
      )}

      <div style={{ background: TINASUZE_CARD, borderRadius: 20, padding: 28, boxShadow: "0 10px 30px rgba(21,17,13,0.06)" }}>
        {loading ? (
          <p style={{ fontSize: 13, color: TINASUZE_TEXT_MUTED }}>Loading…</p>
        ) : (
          <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 32 }}>
            <div style={{ flex: "1 1 240px", maxWidth: 320, minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: TINASUZE_TEXT, marginBottom: 14 }}>Top Link Clicks</h3>
              {topLinks.length === 0 ? (
                <p style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>No clicks in this range yet.</p>
              ) : (
                <div style={{ minWidth: 0 }}>
                  {topLinks.map((l, i) => (
                    <div
                      key={l.link_url}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        fontSize: 13,
                        minWidth: 0,
                        padding: "9px 0",
                        borderBottom: i < topLinks.length - 1 ? `1px solid ${TINASUZE_ACCENT_SOFT}` : "none",
                      }}
                    >
                      <div style={{ minWidth: 0, overflow: "hidden" }}>
                        {l.label && (
                          <span
                            style={{
                              display: "block",
                              fontSize: 11,
                              color: TINASUZE_TEXT_MUTED,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {l.label}
                          </span>
                        )}
                        <span
                          style={{
                            color: TINASUZE_ACCENT,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            display: "block",
                            minWidth: 0,
                          }}
                          title={l.link_url}
                        >
                          {l.link_url}
                        </span>
                      </div>
                      <span style={{ color: TINASUZE_ACCENT, fontWeight: 700, flexShrink: 0 }}>{formatNumber(l.clicks)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ flex: "2 1 500px", minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: TINASUZE_TEXT, marginBottom: 14 }}>Page Visits</h3>
              {visits.length > 0 ? (
                <LineChart dates={dates} series={series} selectedDate={null} onSelectDate={() => {}} height={220} />
              ) : (
                <p style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>No visits in this range yet.</p>
              )}
            </div>
          </div>
        )}

        <h3 style={{ fontSize: 15, fontWeight: 800, color: TINASUZE_TEXT, marginBottom: 14 }}>Top Products</h3>
        {topProducts.length === 0 ? (
          <p style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED }}>No product clicks in this range yet.</p>
        ) : (
          <div style={{ display: "flex", gap: 18, overflowX: "auto", paddingBottom: 10 }}>
            {topProducts.map(({ product, clicks }) => (
              <div key={product.id} style={{ width: 170, flexShrink: 0 }}>
                <div style={{ width: "100%", aspectRatio: "1 / 1", borderRadius: 10, background: "#efece6", overflow: "hidden", marginBottom: 10 }}>
                  {product.image_url && <img src={product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: TINASUZE_TEXT,
                    marginBottom: 2,
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    lineHeight: 1.3,
                    height: "2.6em",
                  }}
                >
                  {product.name}
                </div>
                <div style={{ fontSize: 12, color: TINASUZE_TEXT_MUTED, marginBottom: 10 }}>{formatNumber(clicks)} Clicks</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    background: "#f3f1ee",
                    borderRadius: 999,
                    padding: "5px 6px 5px 12px",
                  }}
                >
                  <span style={{ fontSize: 11, color: TINASUZE_TEXT_MUTED, fontWeight: 600 }}>Affiliate Link</span>
                  <div style={{ display: "flex", gap: 2 }}>
                    <button
                      onClick={() => handleCopy(product.source_url)}
                      title="Copy link"
                      style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", border: "none", borderRadius: "50%", color: TINASUZE_TEXT, cursor: "pointer" }}
                    >
                      {copiedUrl === product.source_url ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                    <a
                      href={product.source_url}
                      target="_blank"
                      rel="noreferrer"
                      style={{ width: 22, height: 22, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", borderRadius: "50%", color: TINASUZE_TEXT, textDecoration: "none" }}
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
