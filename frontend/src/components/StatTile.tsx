interface StatTileProps {
  label: string;
  value: string;
  accent?: string;
}

export function StatTile({ label, value, accent }: StatTileProps) {
  return (
    <div
      style={{
        background: "var(--surface-1)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "14px 18px",
        minWidth: 140,
        borderTop: accent ? `3px solid ${accent}` : undefined,
      }}
    >
      <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
    </div>
  );
}
