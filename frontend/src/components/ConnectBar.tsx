import type { AccountStatus, SyncRun } from "../types";

interface ConnectBarProps {
  platformLabel: string;
  status: AccountStatus | null;
  loading: boolean;
  syncing: boolean;
  lastSync: SyncRun | null;
  onConnect: () => void;
  onSync: () => void;
}

export function ConnectBar({ platformLabel, status, loading, syncing, lastSync, onConnect, onSync }: ConnectBarProps) {
  return (
    <div style={{ padding: "12px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            aria-hidden
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: status?.connected ? "var(--status-good)" : "var(--text-muted)",
              display: "inline-block",
            }}
          />
          <span style={{ color: "var(--text-secondary)", fontSize: 14 }}>
            {loading
              ? "Checking connection…"
              : status?.connected
                ? `Connected as @${status.username ?? "unknown"}`
                : `${platformLabel} not connected`}
          </span>
          {lastSync && (
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
              {" · "}
              last sync: {lastSync.status} ({lastSync.posts_synced} posts)
            </span>
          )}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          {!status?.connected && (
            <button
              onClick={onConnect}
              style={{
                background: "var(--series-blue)",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Connect {platformLabel}
            </button>
          )}
          {status?.connected && (
            <button
              onClick={onSync}
              disabled={syncing}
              style={{
                background: "transparent",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: "8px 16px",
                fontSize: 14,
                fontWeight: 600,
                cursor: syncing ? "default" : "pointer",
                opacity: syncing ? 0.6 : 1,
              }}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          )}
        </div>
      </div>

      {lastSync?.error_message && (
        <p
          style={{
            fontSize: 12,
            color: lastSync.status === "failed" ? "var(--status-critical)" : "var(--text-muted)",
            margin: "6px 0 0",
          }}
        >
          {lastSync.error_message}
        </p>
      )}
    </div>
  );
}
