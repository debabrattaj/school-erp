import { useId, useState } from "react";

const INK_PRIMARY = "#172033";
const INK_SECONDARY = "#52514e";
const INK_MUTED = "#898781";
const GRIDLINE = "#e4e2da";
const SURFACE_GAP = "#ffffff";

const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#a7a49c",
};

const SEQUENTIAL_HUE = "#2a78d6";

function Tooltip({ x, y, children }) {
  if (x == null) return null;
  return (
    <div
      className="chart-tooltip"
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: "translate(-50%, -100%)",
        pointerEvents: "none",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Part-to-whole across 4 named states (Present/Absent/Late/Excused).
 * Horizontal stacked bar per choosing-a-form.md; 4 series crosses the CVD
 * floor so every segment carries a direct label, not color alone.
 */
export function AttendanceStackedBar({ present = 0, absent = 0, late = 0, excused = 0 }) {
  const total = present + absent + late + excused;
  const segments = [
    { key: "present", label: "Present", value: present, color: STATUS.good },
    { key: "late", label: "Late", value: late, color: STATUS.warning },
    { key: "excused", label: "Excused", value: excused, color: STATUS.neutral },
    { key: "absent", label: "Absent", value: absent, color: STATUS.critical },
  ].filter((s) => s.value > 0);

  const [tooltip, setTooltip] = useState(null);

  if (total === 0) {
    return <p className="chart-empty">No attendance recorded for today yet.</p>;
  }

  const gap = 2;
  const barHeight = 34;

  return (
    <div className="chart-block">
      <div className="chart-stacked-bar-wrap" style={{ position: "relative" }}>
        <svg width="100%" height={barHeight} viewBox="0 0 400 34" preserveAspectRatio="none" role="img" aria-label="Today's attendance breakdown">
          {(() => {
            let x = 0;
            return segments.map((seg) => {
              const widthPct = (seg.value / total) * 100;
              const widthUnits = (widthPct / 100) * 400;
              const rect = (
                <rect
                  key={seg.key}
                  x={x}
                  y={0}
                  width={Math.max(widthUnits - gap, 0)}
                  height={barHeight}
                  rx={4}
                  fill={seg.color}
                  onPointerMove={(e) => {
                    const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - box.left,
                      y: e.clientY - box.top - 12,
                      seg,
                      pct: widthPct,
                    });
                  }}
                  onPointerLeave={() => setTooltip(null)}
                  tabIndex={0}
                  onFocus={() => setTooltip({ x: x + widthUnits / 2, y: -12, seg, pct: widthPct })}
                  onBlur={() => setTooltip(null)}
                />
              );
              x += widthUnits;
              return rect;
            });
          })()}
        </svg>
        {tooltip && (
          <Tooltip x={tooltip.x} y={(tooltip.y / 34) * barHeight}>
            <strong>{tooltip.seg.value}</strong> {tooltip.seg.label} ({tooltip.pct.toFixed(0)}%)
          </Tooltip>
        )}
      </div>

      <ul className="chart-legend">
        {segments.map((seg) => (
          <li key={seg.key}>
            <span className="chart-legend-swatch" style={{ background: seg.color }} />
            {seg.label} <strong>{seg.value}</strong>
            <span className="chart-legend-pct"> ({((seg.value / total) * 100).toFixed(0)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A single ratio against a limit (collection % of total fees) is a Meter,
 * not a pie of 2 slices. Fill carries severity per marks-and-anatomy.md.
 */
export function CollectionMeter({ percentage = 0, collected, due, formatMoney }) {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const severityColor = pct >= 80 ? STATUS.good : pct >= 50 ? STATUS.warning : STATUS.critical;
  const trackColor = "#cde2fb";
  const gid = useId();

  return (
    <div className="chart-block">
      <div className="chart-meter-row">
        <svg width="100%" height={16} viewBox="0 0 400 16" preserveAspectRatio="none" role="img" aria-label={`Fee collection ${pct}% of total`}>
          <rect x={0} y={0} width={400} height={16} rx={8} fill={trackColor} />
          <rect x={0} y={0} width={(pct / 100) * 400} height={16} rx={8} fill={severityColor} />
        </svg>
        <span className="chart-meter-value" style={{ color: severityColor }}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="chart-meter-caption">
        <span>{formatMoney(collected)} collected</span>
        <span>{formatMoney(due)} outstanding</span>
      </div>
      <span className="sr-only" id={gid} />
    </div>
  );
}

/**
 * Magnitude comparison across categories -> column chart, sequential
 * (one hue) since the categories are not competing identities.
 */
export function CategoryBarChart({ data, valueFormatter, emptyText = "No data yet." }) {
  const [tooltip, setTooltip] = useState(null);
  const items = (data || []).filter((d) => d.value > 0 || data.length <= 12);

  if (!items.length) {
    return <p className="chart-empty">{emptyText}</p>;
  }

  const max = Math.max(...items.map((d) => d.value), 1);
  const width = 600;
  const height = 200;
  const padLeft = 34;
  const padTop = 20;
  const padBottom = 28;
  const plotW = width - padLeft - 8;
  const plotH = height - padBottom - padTop;
  const barGap = 10;
  const barWidth = Math.min(24, plotW / items.length - barGap);
  const step = plotW / items.length;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));

  return (
    <div className="chart-block" style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Category comparison">
        {ticks.map((t, i) => {
          const y = padTop + plotH - (t / max) * plotH;
          return (
            <g key={i}>
              <line x1={padLeft} y1={y} x2={width - 4} y2={y} stroke={GRIDLINE} strokeWidth={1} />
              <text x={padLeft - 6} y={y + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>
                {t.toLocaleString()}
              </text>
            </g>
          );
        })}

        {items.map((d, i) => {
          const barH = (d.value / max) * plotH;
          const x = padLeft + i * step + (step - barWidth) / 2;
          const y = padTop + plotH - barH;
          return (
            <g key={d.label}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={Math.max(barH, 1)}
                rx={4}
                fill={SEQUENTIAL_HUE}
                onPointerMove={(e) => {
                  const box = e.currentTarget.ownerSVGElement.getBoundingClientRect();
                  setTooltip({ x: e.clientX - box.left, y: e.clientY - box.top - 10, d });
                }}
                onPointerLeave={() => setTooltip(null)}
                tabIndex={0}
                onFocus={() => setTooltip({ x: x + barWidth / 2, y: y - 10, d })}
                onBlur={() => setTooltip(null)}
              />
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize={10}
                fill={INK_SECONDARY}
              >
                {barH > 14 ? d.value : ""}
              </text>
              <text
                x={x + barWidth / 2}
                y={height - padBottom + 14}
                textAnchor="middle"
                fontSize={10}
                fill={INK_MUTED}
              >
                {d.label.length > 8 ? `${d.label.slice(0, 7)}…` : d.label}
              </text>
            </g>
          );
        })}
      </svg>
      {tooltip && (
        <Tooltip x={tooltip.x} y={tooltip.y}>
          <strong>{valueFormatter ? valueFormatter(tooltip.d.value) : tooltip.d.value}</strong>{" "}
          {tooltip.d.label}
        </Tooltip>
      )}
    </div>
  );
}
