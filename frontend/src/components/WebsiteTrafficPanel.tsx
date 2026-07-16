import { useCallback, useEffect, useState } from "react";
import {
  getDailyTraffic,
  getFormSubmissions,
  getTopPages,
  getWixStatus,
  triggerWixSync,
  wixInstallUrl,
} from "../api";
import type { DailyTraffic, FormSubmission, TopPage, WixStatus, WixSyncRun } from "../types";
import { formatDateTime, formatNumber } from "../format";
import { StatTile } from "./StatTile";
import { TrafficChart } from "./TrafficChart";

type Metric = "sessions" | "views" | "visitors";
type RangePreset = 7 | 30 | 90;

interface WebsiteTrafficPanelProps {
  selectedDate: string | null;
  onSelectDate: (date: string | null) => void;
}

function rangeForPreset(days: RangePreset): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function WebsiteTrafficPanel({ selectedDate, onSelectDate }: WebsiteTrafficPanelProps) {
  const [status, setStatus] = useState<WixStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<WixSyncRun | null>(null);

  const [preset, setPreset] = useState<RangePreset>(30);
  const [metric, setMetric] = useState<Metric>("sessions");
  const [daily, setDaily] = useState<DailyTraffic[]>([]);
  const [topPages, setTopPages] = useState<TopPage[]>([]);
  const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
  const [dataLoading, setDataLoading] = useState(false);

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
      const { start, end } = rangeForPreset(preset);
      const [dailyRes, pagesRes, subsRes] = await Promise.all([
        getDailyTraffic(start, end),
        getTopPages(start, end, 8),
        getFormSubmissions(start, end),
      ]);
      setDaily(dailyRes);
      setTopPages(pagesRes);
      setSubmissions(subsRes);
    } finally {
      setDataLoading(false);
    }
  }, [status?.connected, preset]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const run = await triggerWixSync();
      setLastSync(run);
      await refreshData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const totals = daily.reduce(
    (acc, d) => ({
      sessions: acc.sessions + d.sessions,
      views: acc.views + d.views,
      visitors: acc.visitors + d.visitors,
      applications: acc.applications + d.form_submissions,
    }),
    { sessions: 0, views: 0, visitors: 0, applications: 0 }
  );

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
        <button
          onClick={handleSync}
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
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {([7, 30, 90] as RangePreset[]).map((p) => (
            <button
              key={p}
              onClick={() => setPreset(p)}
              style={{
                background: preset === p ? "var(--series-blue)" : "transparent",
                color: preset === p ? "#fff" : "var(--text-secondary)",
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
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {(["sessions", "views", "visitors"] as Metric[]).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              style={{
                background: "transparent",
                color: metric === m ? "var(--text-primary)" : "var(--text-muted)",
                border: "none",
                borderBottom: metric === m ? "2px solid var(--series-blue)" : "2px solid transparent",
                padding: "2px 6px",
                fontSize: 12,
                fontWeight: metric === m ? 600 : 400,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <StatTile label="Sessions" value={formatNumber(totals.sessions)} accent="var(--series-blue)" />
        <StatTile label="Views" value={formatNumber(totals.views)} accent="var(--series-aqua)" />
        <StatTile label="Visitors" value={formatNumber(totals.visitors)} accent="var(--series-violet)" />
        <StatTile label="Applications" value={formatNumber(totals.applications)} accent="var(--series-orange)" />
      </div>

      {dataLoading ? (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
      ) : (
        <TrafficChart data={daily} metric={metric} selectedDate={selectedDate} onSelectDate={onSelectDate} />
      )}

      {selectedDate && (
        <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
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
              {submissions.slice(0, 8).map((s, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--gridline)" }}>
                  <td style={{ padding: "6px 0", color: "var(--text-primary)" }}>{s.contact_name || s.contact_email || "Unknown"}</td>
                  <td style={{ padding: "6px 0", textAlign: "right", color: "var(--text-muted)", fontSize: 12 }}>
                    {formatDateTime(s.submitted_at)}
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && (
                <tr>
                  <td style={{ padding: "6px 0", color: "var(--text-muted)" }}>No applications in this range.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
