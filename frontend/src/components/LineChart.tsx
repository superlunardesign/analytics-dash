import { useMemo, useState } from "react";
import { formatDate } from "../format";

export interface LineChartSeries {
  key: string;
  label: string;
  color: string;
  values: (number | null)[];
}

interface LineChartProps {
  dates: string[];
  series: LineChartSeries[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  valueFormatter?: (v: number) => string;
  height?: number;
}

const WIDTH = 720;
const PAD_LEFT = 48;
const PAD_RIGHT = 16;
const PAD_TOP = 14;
const PAD_BOTTOM = 28;

// Rounds a max value up to a "nice" step (1/2/5 x 10^n) so axis ticks read
// as clean numbers (0 / 1,000 / 2,000) rather than arbitrary fractions.
function niceTicks(maxValue: number, targetCount = 4): number[] {
  if (maxValue <= 0) return [0];
  const rawStep = maxValue / targetCount;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceResidual: number;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  const step = niceResidual * magnitude;
  const niceMax = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= niceMax + step / 1000; v += step) {
    ticks.push(Math.round((v + Number.EPSILON) * 100) / 100);
  }
  return ticks;
}

function defaultFormat(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}K`;
  return String(v);
}

export function LineChart({ dates, series, selectedDate, onSelectDate, valueFormatter, height = 200 }: LineChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const format = valueFormatter ?? defaultFormat;

  const plot = useMemo(() => {
    const innerWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
    const innerHeight = height - PAD_TOP - PAD_BOTTOM;

    const maxValue = Math.max(1, ...series.flatMap((s) => s.values.filter((v): v is number => v != null)));
    const ticks = niceTicks(maxValue);
    const tickMax = ticks[ticks.length - 1];

    const xFor = (i: number) => PAD_LEFT + (dates.length <= 1 ? innerWidth / 2 : (i / (dates.length - 1)) * innerWidth);
    const yFor = (v: number) => PAD_TOP + innerHeight - (v / tickMax) * innerHeight;

    const seriesPaths = series.map((s) => {
      const points = s.values.map((v, i) => ({ x: xFor(i), y: v == null ? null : yFor(v), v, i }));
      let path = "";
      let drawing = false;
      for (const p of points) {
        if (p.y == null) {
          drawing = false;
          continue;
        }
        path += `${drawing ? "L" : "M"} ${p.x.toFixed(1)} ${p.y.toFixed(1)} `;
        drawing = true;
      }
      return { ...s, points, path };
    });

    // X positions shared across all series (dates are aligned).
    const xPositions = dates.map((_, i) => xFor(i));

    return { xPositions, seriesPaths, ticks, tickMax, yFor, innerWidth, innerHeight };
  }, [dates, series, height]);

  if (dates.length === 0) {
    return (
      <div style={{ padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
        No data for this range yet.
      </div>
    );
  }

  const nearestIndexForEvent = (e: React.MouseEvent<SVGSVGElement>): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = WIDTH / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    let nearest = 0;
    let nearestDist = Infinity;
    plot.xPositions.forEach((x, i) => {
      const dist = Math.abs(x - mouseX);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    return nearest;
  };

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => setHoverIndex(nearestIndexForEvent(e));

  // Computed directly from the click event rather than reading `hoverIndex`
  // state, since a mousemove-then-click pair can otherwise race.
  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const index = nearestIndexForEvent(e);
    onSelectDate(dates[index]);
  };

  const tickCount = Math.min(6, dates.length);
  const tickIndices =
    dates.length <= 1 ? [0] : Array.from({ length: tickCount }, (_, i) => Math.round((i / (tickCount - 1)) * (dates.length - 1)));

  const selectedIndex = selectedDate ? dates.findIndex((d) => d.slice(0, 10) === selectedDate.slice(0, 10)) : -1;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        style={{ width: "100%", height: "auto", display: "block" }}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
        onClick={handleClick}
      >
        {/* Y-axis gridlines + tick labels */}
        {plot.ticks.map((t) => {
          const y = plot.yFor(t);
          return (
            <g key={t}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} stroke="var(--gridline)" strokeWidth={1} />
              <text x={PAD_LEFT - 8} y={y} dy={3} fontSize={10} fill="var(--text-muted)" textAnchor="end">
                {format(t)}
              </text>
            </g>
          );
        })}

        {/* X-axis date ticks */}
        {tickIndices.map((i) => (
          <text key={i} x={plot.xPositions[i]} y={height - 8} fontSize={10} fill="var(--text-muted)" textAnchor="middle">
            {formatDate(dates[i])}
          </text>
        ))}

        {/* Selected-date indicator */}
        {selectedIndex >= 0 && (
          <line
            x1={plot.xPositions[selectedIndex]}
            x2={plot.xPositions[selectedIndex]}
            y1={PAD_TOP}
            y2={height - PAD_BOTTOM}
            stroke="var(--series-violet)"
            strokeWidth={2}
            strokeDasharray="3,3"
          />
        )}

        {/* Lines */}
        {plot.seriesPaths.map((s) => (
          <path key={s.key} d={s.path} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}

        {/* Hover crosshair + dots */}
        {hoverIndex !== null && (
          <>
            <line
              x1={plot.xPositions[hoverIndex]}
              x2={plot.xPositions[hoverIndex]}
              y1={PAD_TOP}
              y2={height - PAD_BOTTOM}
              stroke="var(--baseline)"
              strokeWidth={1}
            />
            {plot.seriesPaths.map((s) => {
              const p = s.points[hoverIndex];
              if (p.y == null) return null;
              return <circle key={s.key} cx={p.x} cy={p.y} r={4} fill={s.color} stroke="var(--surface-1)" strokeWidth={2} />;
            })}
          </>
        )}
      </svg>

      {hoverIndex !== null && (
        <div
          style={{
            position: "absolute",
            left: `${(plot.xPositions[hoverIndex] / WIDTH) * 100}%`,
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
            zIndex: 1,
          }}
        >
          <div style={{ color: "var(--text-secondary)", marginBottom: 2 }}>{formatDate(dates[hoverIndex])}</div>
          {plot.seriesPaths.map((s) => {
            const v = s.values[hoverIndex];
            return (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ display: "inline-block", width: 10, height: 2, background: s.color }} />
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{v == null ? "—" : format(v)}</span>
                <span style={{ color: "var(--text-secondary)" }}>{s.label}</span>
              </div>
            );
          })}
          <div style={{ color: "var(--text-muted)", fontSize: 11, marginTop: 2 }}>Click to filter posts ±3 days</div>
        </div>
      )}

      {series.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 6 }}>
          {series.map((s) => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--text-secondary)" }}>
              <span style={{ display: "inline-block", width: 10, height: 2, background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
