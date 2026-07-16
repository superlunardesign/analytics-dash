import { useMemo, useState } from "react";
import type { DailyTraffic } from "../types";
import { formatDate, formatNumber } from "../format";

type Metric = "sessions" | "views" | "visitors";

interface TrafficChartProps {
  data: DailyTraffic[];
  metric: Metric;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}

const WIDTH = 760;
const HEIGHT = 220;
const PAD_LEFT = 40;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 28;

export function TrafficChart({ data, metric, selectedDate, onSelectDate }: TrafficChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const plot = useMemo(() => {
    const values = data.map((d) => d[metric]);
    const maxValue = Math.max(1, ...values);
    const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

    const xFor = (i: number) => PAD_LEFT + (data.length <= 1 ? innerWidth / 2 : (i / (data.length - 1)) * innerWidth);
    const yFor = (v: number) => PAD_TOP + innerHeight - (v / maxValue) * innerHeight;

    const points = data.map((d, i) => ({ x: xFor(i), y: yFor(d[metric]), d }));
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");

    // Form-submission marker row, just above the x-axis.
    const markerY = PAD_TOP + innerHeight + 14;

    return { points, path, maxValue, markerY, yFor };
  }, [data, metric]);

  if (data.length === 0) {
    return (
      <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No traffic data for this range yet.
      </div>
    );
  }

  const nearestIndexForEvent = (e: React.MouseEvent<SVGSVGElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    let nearest = 0;
    let nearestDist = Infinity;
    plot.points.forEach((p, i) => {
      const dist = Math.abs(p.x - mouseX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    return nearest;
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    setHoverIndex(nearestIndexForEvent(e));
  };

  // Computed directly from the click event rather than reading `hovered`
  // state, since a mousemove-then-click pair can otherwise race: the
  // click's onClick closure isn't guaranteed to see the hover state set
  // by the immediately-preceding mousemove if React hasn't re-rendered
  // between the two native events yet.
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const index = nearestIndexForEvent(e);
    onSelectDate(plot.points[index].d.date);
  };

  const hovered = hoverIndex !== null ? plot.points[hoverIndex] : null;

  // A handful of evenly spaced date ticks along the x-axis.
  const tickCount = Math.min(6, data.length);
  const tickIndices =
    data.length <= 1
      ? [0]
      : Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (data.length - 1)));

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        onClick={handleClick}
      >
        {/* Gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD_TOP + t * (HEIGHT - PAD_TOP - PAD_BOTTOM);
          return <line key={t} x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="var(--gridline)" strokeWidth={1} />;
        })}

        {/* Date ticks */}
        {tickIndices.map((i) => (
          <text
            key={i}
            x={plot.points[i].x}
            y={HEIGHT - 8}
            fontSize={10}
            fill="var(--text-muted)"
            textAnchor="middle"
          >
            {formatDate(data[i].date)}
          </text>
        ))}

        {/* The line */}
        <path d={plot.path} fill="none" stroke="var(--series-blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* Form-submission markers */}
        {plot.points.map(
          (p, i) =>
            p.d.form_submissions > 0 && (
              <circle key={`sub-${i}`} cx={p.x} cy={plot.markerY} r={3} fill="var(--series-orange)" />
            )
        )}

        {/* Selected-date indicator */}
        {selectedDate &&
          plot.points
            .filter((p) => p.d.date.slice(0, 10) === selectedDate.slice(0, 10))
            .map((p, i) => (
              <line
                key={`sel-${i}`}
                x1={p.x}
                x2={p.x}
                y1={PAD_TOP}
                y2={HEIGHT - PAD_BOTTOM}
                stroke="var(--series-violet)"
                strokeWidth={2}
                strokeDasharray="3,3"
              />
            ))}

        {/* Hover crosshair + dot */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_TOP}
              y2={HEIGHT - PAD_BOTTOM}
              stroke="var(--baseline)"
              strokeWidth={1}
            />
            <circle cx={hovered.x} cy={hovered.y} r={4} fill="var(--series-blue)" stroke="var(--surface-1)" strokeWidth={2} />
          </>
        )}
      </svg>

      {hovered && (
        <div
          style={{
            position: "absolute",
            left: `${(hovered.x / WIDTH) * 100}%`,
            top: 0,
            transform: "translateX(-50%)",
            background: "var(--surface-1)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: "6px 10px",
            fontSize: 12,
            pointerEvents: "none",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
          }}
        >
          <div style={{ color: "var(--text-secondary)" }}>{formatDate(hovered.d.date)}</div>
          <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
            {formatNumber(hovered.d[metric])} {metric}
          </div>
          {hovered.d.form_submissions > 0 && (
            <div style={{ color: "var(--series-orange)" }}>{hovered.d.form_submissions} application(s)</div>
          )}
          <div style={{ color: "var(--text-muted)", fontSize: 11 }}>Click to filter posts ±3 days</div>
        </div>
      )}
    </div>
  );
}
