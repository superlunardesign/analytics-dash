import { useEffect, useMemo, useState } from "react";
import { getPageVisits, getTopLinkClicks, getTopProducts, listPages } from "../api";
import { LineChart } from "../components/LineChart";
import { StatTile } from "../components/StatTile";
import { formatNumber, parseDateInputToISO } from "../format";
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

  const totals = useMemo(() => {
    const totalVisits = visits.reduce((sum, v) => sum + v.visits, 0);
    const totalClicks = topLinks.reduce((sum, l) => sum + l.clicks, 0);
    return { totalVisits, totalClicks };
  }, [visits, topLinks]);

  const dates = visits.map((v) => v.date);
  const series = [{ key: "visits", label: "Page visits", color: "var(--series-blue)", values: visits.map((v) => v.visits), axis: "left" as const }];

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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "6px 10px", fontSize: 13 }}
        >
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
                background: !customRange && preset === p ? "var(--series-blue)" : "transparent",
                color: !customRange && preset === p ? "#fff" : "var(--text-secondary)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "4px 10px",
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
              background: !customRange && preset === "all" ? "var(--series-blue)" : "transparent",
              color: !customRange && preset === "all" ? "#fff" : "var(--text-secondary)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              padding: "4px 10px",
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
              background: customRange ? "var(--series-blue)" : "transparent",
              color: customRange ? "#fff" : "var(--text-muted)",
              border: "none",
              borderBottom: "1px dashed var(--border)",
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
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, paddingBottom: 10, borderBottom: "1px solid var(--border)" }}>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            From{" "}
            <input
              type="date"
              value={toDateInputValue(pendingRange?.start ?? range.start)}
              onChange={(e) => setPendingRange((prev) => ({ start: parseDateInputToISO(e.target.value, prev?.start ?? range.start), end: prev?.end ?? range.end }))}
              style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            To{" "}
            <input
              type="date"
              value={toDateInputValue(pendingRange?.end ?? range.end)}
              onChange={(e) => setPendingRange((prev) => ({ start: prev?.start ?? range.start, end: parseDateInputToISO(e.target.value, prev?.end ?? range.end) }))}
              style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
            />
          </label>
          <button
            onClick={() => {
              if (pendingRange) setCustomRange(pendingRange);
            }}
            style={{ background: "var(--series-blue)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
          >
            Apply
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
        <StatTile label="Page visits" value={formatNumber(totals.totalVisits)} accent="var(--series-blue)" />
        <StatTile label="Link clicks" value={formatNumber(totals.totalClicks)} accent="var(--series-magenta)" />
      </div>

      {loading ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 24 }}>
          <div style={{ flex: "2 1 500px" }}>
            <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Page Visits</h3>
            {visits.length > 0 ? (
              <LineChart dates={dates} series={series} selectedDate={null} onSelectDate={() => {}} leftAxisLabel="Visits" height={220} />
            ) : (
              <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No visits in this range yet.</p>
            )}
          </div>

          <div style={{ flex: "1 1 280px" }}>
            <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Top Link Clicks</h3>
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {topLinks.map((l) => (
                  <tr key={l.link_url} style={{ borderBottom: "1px solid var(--gridline)" }}>
                    <td style={{ padding: "6px 0", color: "var(--text-primary)", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.link_url}>
                      {l.link_url}
                    </td>
                    <td style={{ padding: "6px 0", textAlign: "right", color: "var(--text-secondary)" }}>{formatNumber(l.clicks)}</td>
                  </tr>
                ))}
                {topLinks.length === 0 && (
                  <tr>
                    <td style={{ padding: "6px 0", color: "var(--text-muted)" }}>No clicks in this range yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 10 }}>Top Products</h3>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        {topProducts.map(({ product, clicks }) => (
          <div key={product.id} style={{ width: 160, border: "1px solid var(--border)", borderRadius: 10, padding: 10, background: "var(--surface-1)" }}>
            <div style={{ width: "100%", height: 100, borderRadius: 8, background: "var(--gridline)", overflow: "hidden", marginBottom: 8 }}>
              {product.image_url && <img src={product.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>{product.name}</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>{formatNumber(clicks)} clicks</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => handleCopy(product.source_url)}
                title="Copy link"
                style={{ flex: 1, background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0", fontSize: 11, color: "var(--text-secondary)", cursor: "pointer" }}
              >
                {copiedUrl === product.source_url ? "Copied!" : "Copy"}
              </button>
              <a
                href={product.source_url}
                target="_blank"
                rel="noreferrer"
                style={{ flex: 1, textAlign: "center", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 0", fontSize: 11, color: "var(--text-secondary)", textDecoration: "none" }}
              >
                Open
              </a>
            </div>
          </div>
        ))}
        {topProducts.length === 0 && <p style={{ fontSize: 12, color: "var(--text-muted)" }}>No product clicks in this range yet.</p>}
      </div>
    </div>
  );
}
