import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getDailyTraffic,
  getFormNames,
  getFormSchemas,
  getFormSubmissions,
  getTopPages,
  getWixStatus,
  triggerWixSync,
  wixInstallUrl,
} from "../api";
import type { DailyTraffic, FormSchema, FormSubmission, TopPage, WixStatus, WixSyncRun } from "../types";
import { formatDateTime, formatNumber } from "../format";
import { StatTile } from "./StatTile";
import { LineChart } from "./LineChart";
import { SubmissionDetailDrawer } from "./SubmissionDetailDrawer";

type RangePreset = 7 | 30 | 90 | 365 | "all";

// Fixed categorical order (never cycled/reassigned by selection) -- see the
// dataviz skill's palette.md. Forms are colored by their position in the
// sorted master list of all known form names, not by which ones are
// currently toggled on, so a form's color never changes as others are
// toggled.
const FORM_COLOR_SLOTS = [
  "var(--series-blue)",
  "var(--series-green)",
  "var(--series-magenta)",
  "var(--series-yellow)",
  "var(--series-aqua)",
  "var(--series-orange)",
  "var(--series-violet)",
  "var(--series-red)",
];

const DEFAULT_FORM_NAME = "Project Inquiry";

// Sessions/views/visitors are all "count of site events per day" -- the
// same unit and a comparable scale -- so they validly share one axis.
// Forms get the second axis since submission counts are a different unit
// entirely (a handful per day vs. hundreds of sessions); see LineChart's
// axis labels, which always name the unit so the two scales read
// unambiguously rather than inviting a false comparison.
const METRIC_CONFIG: { key: "sessions" | "views" | "visitors"; label: string; color: string }[] = [
  { key: "sessions", label: "Sessions", color: "var(--series-blue)" },
  { key: "views", label: "Views", color: "var(--series-aqua)" },
  { key: "visitors", label: "Visitors", color: "var(--series-violet)" },
];

interface WebsiteTrafficPanelProps {
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
  onRangeChange?: (range: { start: string; end: string }) => void;
}

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

export function WebsiteTrafficPanel({ selectedDate, onSelectDate, onRangeChange }: WebsiteTrafficPanelProps) {
  const [status, setStatus] = useState<WixStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<WixSyncRun | null>(null);

  const [preset, setPreset] = useState<RangePreset>(30);
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null);
  const [showCustomRange, setShowCustomRange] = useState(false);

  const [daily, setDaily] = useState<DailyTraffic[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [formNames, setFormNames] = useState<string[]>([]);
  const [formSchemas, setFormSchemas] = useState<FormSchema[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<FormSubmission | null>(null);
  const [selectedForms, setSelectedForms] = useState<Set<string> | null>(null);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    () => new Set(METRIC_CONFIG.map((m) => m.key))
  );
  const [dataLoading, setDataLoading] = useState(false);

  const range = useMemo(() => customRange ?? rangeForPreset(preset), [customRange, preset]);

  // Lets the posts table below scope itself to the same range as these
  // charts, so "all the graphs and posts" agree on one window -- only
  // once actually connected, since an unconnected panel's range is
  // meaningless as a posts filter.
  useEffect(() => {
    if (status?.connected) onRangeChange?.(range);
  }, [status?.connected, range.start, range.end, onRangeChange]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      setStatus(await getWixStatus());
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const refreshData = useCallback(async () => {
    if (!status?.connected) return;
    setDataLoading(true);
    try {
      const [dailyRes, pagesRes, subsRes, namesRes, schemasRes] = await Promise.all([
        getDailyTraffic(range.start, range.end),
        getTopPages(range.start, range.end, 8),
        getFormSubmissions(range.start, range.end),
        getFormNames(),
        getFormSchemas(),
      ]);
      setDaily(dailyRes);
      setTopPages(pagesRes);
      setSubmissions(subsRes);
      setFormNames(namesRes);
      setFormSchemas(schemasRes);
    } finally {
      setDataLoading(false);
    }
  }, [status?.connected, range.start, range.end]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Default to just the real project-application form once we know what
  // forms exist; only runs once (selectedForms starts null) so a user's
  // manual toggle choices are never overwritten by a later refresh.
  useEffect(() => {
    if (selectedForms !== null || formNames.length === 0) return;
    setSelectedForms(new Set(formNames.includes(DEFAULT_FORM_NAME) ? [DEFAULT_FORM_NAME] : formNames));
  }, [formNames, selectedForms]);

  const formColor = useMemo(() => {
    const sorted = [...formNames].sort();
    const map = new Map<string, string>();
    sorted.forEach((name, i) => map.set(name, FORM_COLOR_SLOTS[i % FORM_COLOR_SLOTS.length]));
    return map;
  }, [formNames]);

  const handleSync = async (full = false) => {
    setSyncing(true);
    try {
      const run = await triggerWixSync(full);
      setLastSync(run);
      await refreshData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const toggleForm = (name: string) => {
    setSelectedForms((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const activeForms = selectedForms ?? new Set<string>();

  const totals = daily.reduce(
    (acc, d) => {
      let applications = acc.applications;
      for (const [form, count] of Object.entries(d.submissions_by_form)) {
        if (activeForms.has(form)) applications += count;
      }
      return {
        sessions: acc.sessions + d.sessions,
        views: acc.views + d.views,
        visitors: acc.visitors + d.visitors,
        applications,
      };
    },
    { sessions: 0, views: 0, visitors: 0, applications: 0 }
  );

  const dates = daily.map((d) => d.date);
  const combinedSeries = useMemo(() => {
    const metricSeries = METRIC_CONFIG.filter((m) => selectedMetrics.has(m.key)).map((m) => ({
      key: m.key,
      label: m.label,
      color: m.color,
      values: daily.map((d) => d[m.key]),
      axis: "left" as const,
    }));
    const formSeries = [...activeForms].map((name) => ({
      key: name,
      label: name,
      color: formColor.get(name) ?? "var(--text-muted)",
      values: daily.map((d) => d.submissions_by_form[name] ?? 0),
      axis: "right" as const,
    }));
    return [...metricSeries, ...formSeries];
  }, [selectedMetrics, activeForms, daily, formColor]);

  const recentSubmissions = submissions.filter((s) => activeForms.has(s.form_name ?? ""));

  if (statusLoading) {
    return <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Checking Wix connection…</p>;
  }

  if (!status?.connected) {
    return (
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: 20,
          textAlign: "center",
          background: "var(--surface-1)",
        }}
      >
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 12 }}>
          Connect your Wix site to correlate traffic and form submissions with your posts.
        </p>
        <a
          href={wixInstallUrl()}
          style={{
            display: "inline-block",
            background: "var(--series-blue)",
            color: "#fff",
            borderRadius: 8,
            padding: "8px 16px",
            fontSize: 14,
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Connect Wix
        </a>
        <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 10 }}>
          You'll land on a Wix confirmation page after approving -- come back to this tab
          afterward and refresh.
        </p>
      </div>
    );
  }

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 16, background: "var(--surface-1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            aria-hidden
            style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--status-good)", display: "inline-block" }}
          />
          <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
            {status.site_display_name ? `Connected: ${status.site_display_name}` : "Wix connected"}
          </span>
          {lastSync && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              · last sync: {lastSync.status} ({lastSync.rows_synced} rows)
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => handleSync(false)}
            disabled={syncing}
            style={{
              background: "transparent",
              color: "var(--text-primary)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "6px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: syncing ? "default" : "pointer",
              opacity: syncing ? 0.6 : 1,
            }}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button
            onClick={() => {
              if (
                confirm(
                  "Re-fetch and re-clean the full historical window (not just the last 60 days)? Use this after a fix that changes what counts as a submission/traffic row, to purge old bad data that a normal sync won't reach. This can take longer than a normal sync."
                )
              ) {
                handleSync(true);
              }
            }}
            disabled={syncing}
            title="Re-fetch and re-clean the full historical window, not just the recent rolling one"
            style={{
              background: "transparent",
              color: "var(--text-muted)",
              border: "none",
              borderBottom: "1px dashed var(--border)",
              padding: "4px 2px",
              fontSize: 12,
              cursor: syncing ? "default" : "pointer",
            }}
          >
            Force full resync
          </button>
        </div>
      </div>

      {/* Date range: presets first, custom range tucked behind a disclosure. */}
      <div style={{ marginBottom: 12 }}>
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
            onClick={() => setShowCustomRange((v) => !v)}
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
        {showCustomRange && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--border)" }}>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              From{" "}
              <input
                type="date"
                value={toDateInputValue(customRange?.start ?? range.start)}
                onChange={(e) =>
                  setCustomRange({
                    start: new Date(e.target.value).toISOString(),
                    end: customRange?.end ?? range.end,
                  })
                }
                style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
              />
            </label>
            <label style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              To{" "}
              <input
                type="date"
                value={toDateInputValue(customRange?.end ?? range.end)}
                onChange={(e) =>
                  setCustomRange({
                    start: customRange?.start ?? range.start,
                    end: new Date(e.target.value).toISOString(),
                  })
                }
                style={{ background: "var(--surface-1)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, padding: "4px 6px", fontSize: 12 }}
              />
            </label>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatTile label="Sessions" value={formatNumber(totals.sessions)} accent="var(--series-blue)" />
        <StatTile label="Views" value={formatNumber(totals.views)} accent="var(--series-aqua)" />
        <StatTile label="Visitors" value={formatNumber(totals.visitors)} accent="var(--series-violet)" />
        <StatTile label="Applications" value={formatNumber(totals.applications)} accent="var(--series-orange)" />
      </div>

      {/* Toggle rows -- metrics share the left axis, forms the right one.
          Each chip's color is fixed regardless of what else is toggled. */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Traffic:</span>
          {METRIC_CONFIG.map((m) => {
            const active = selectedMetrics.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: active ? "var(--gridline)" : "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 999,
                  padding: "4px 10px",
                  fontSize: 12,
                  color: active ? "var(--text-primary)" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 8, height: 8, borderRadius: "50%", background: active ? m.color : "var(--gridline)", display: "inline-block" }}
                />
                {m.label}
              </button>
            );
          })}
        </div>
        {formNames.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Forms:</span>
            {formNames.map((name) => {
              const active = activeForms.has(name);
              const color = formColor.get(name) ?? "var(--text-muted)";
              return (
                <button
                  key={name}
                  onClick={() => toggleForm(name)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: active ? "var(--gridline)" : "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: 999,
                    padding: "4px 10px",
                    fontSize: 12,
                    color: active ? "var(--text-primary)" : "var(--text-muted)",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: active ? color : "var(--gridline)",
                      display: "inline-block",
                    }}
                  />
                  {name}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {dataLoading ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <LineChart
          dates={dates}
          series={combinedSeries}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          leftAxisLabel="Website traffic"
          rightAxisLabel="Form submissions"
          height={280}
        />
      )}

      {selectedDate && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-secondary)" }}>
          Filtering posts within 3 days of {selectedDate.slice(0, 10)}.{" "}
          <button
            onClick={() => onSelectDate(null)}
            style={{ background: "none", border: "none", color: "var(--series-blue)", cursor: "pointer", padding: 0, fontSize: 12 }}
          >
            Clear
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, marginTop: 20, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 280px" }}>
          <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Top pages</h3>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              {topPages.map((p) => (
                <tr key={p.page_path} style={{ borderBottom: "1px solid var(--gridline)" }}>
                  <td style={{ padding: "6px 0", color: "var(--text-primary)" }}>{p.page_path || "/"}</td>
                  <td style={{ padding: "6px 0", textAlign: "right", color: "var(--text-secondary)" }}>
                    {formatNumber(p.views)} views
                  </td>
                </tr>
              ))}
              {topPages.length === 0 && (
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--text-muted)" }}>No page data yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ flex: "1 1 280px" }}>
          <h3 style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Recent applications</h3>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <tbody>
              {recentSubmissions.slice(0, 8).map((s) => (
                <tr
                  key={s.id}
                  onClick={() => setSelectedSubmission(s)}
                  style={{ borderBottom: "1px solid var(--gridline)", cursor: "pointer" }}
                >
                  <td style={{ padding: "6px 0", color: "var(--text-primary)" }}>
                    {s.contact_name || s.contact_email || "Unknown"}
                    {s.form_name && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>
                        <span
                          aria-hidden
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            background: formColor.get(s.form_name) ?? "var(--text-muted)",
                            display: "inline-block",
                          }}
                        />
                        {s.form_name}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "6px 0", textAlign: "right", color: "var(--text-muted)", fontSize: 12 }}>
                    {formatDateTime(s.submitted_at)}
                  </td>
                </tr>
              ))}
              {recentSubmissions.length === 0 && (
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--text-muted)" }}>No applications in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SubmissionDetailDrawer
        submission={selectedSubmission}
        schema={formSchemas.find((s) => s.form_id === selectedSubmission?.wix_form_id) ?? null}
        loading={false}
        onClose={() => setSelectedSubmission(null)}
      />
    </div>
  );
}
