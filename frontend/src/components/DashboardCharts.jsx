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

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function annularSector(cx, cy, rOuter, rInner, startAngle, endAngle) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const [x1, y1] = polar(cx, cy, rOuter, startAngle);
  const [x2, y2] = polar(cx, cy, rOuter, endAngle);
  const [x3, y3] = polar(cx, cy, rInner, endAngle);
  const [x4, y4] = polar(cx, cy, rInner, startAngle);
  return [
    `M${x1},${y1}`,
    `A${rOuter},${rOuter} 0 ${largeArc} 1 ${x2},${y2}`,
    `L${x3},${y3}`,
    `A${rInner},${rInner} 0 ${largeArc} 0 ${x4},${y4}`,
    "Z",
  ].join(" ");
}

/**
 * Part-to-whole donut for today's attendance. The hole carries the headline
 * figure (present %), so it's a figure-in-a-ring, not a 2-slice pie. Status
 * colors, each direct-labeled in the legend — never color alone.
 */
export function AttendanceDonut({ present = 0, absent = 0, late = 0, excused = 0 }) {
  const total = present + absent + late + excused;
  const [hover, setHover] = useState(null);

  if (total === 0) {
    return <p className="chart-empty">No attendance recorded for today yet.</p>;
  }

  const segments = [
    { key: "present", label: "Present", value: present, color: STATUS.good },
    { key: "late", label: "Late", value: late, color: STATUS.warning },
    { key: "excused", label: "Excused", value: excused, color: STATUS.neutral },
    { key: "absent", label: "Absent", value: absent, color: STATUS.critical },
  ].filter((s) => s.value > 0);

  const size = 190;
  const cx = size / 2;
  const cy = size / 2;
  const rOuter = 84;
  const rInner = 56;
  const gap = 0.03; // radians between slices
  const start = -Math.PI / 2;
  const presentPct = Math.round(((present + late * 0.5) / total) * 100);

  let angle = start;
  const arcs = segments.map((seg) => {
    const sweep = (seg.value / total) * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = angle + sweep - gap / 2;
    angle += sweep;
    return { seg, d: annularSector(cx, cy, rOuter, rInner, a0, Math.max(a1, a0 + 0.001)) };
  });

  return (
    <div className="chart-block chart-donut-block">
      <div className="chart-donut" style={{ position: "relative" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Today's attendance breakdown">
          {arcs.map(({ seg, d }) => (
            <path
              key={seg.key}
              d={d}
              fill={seg.color}
              stroke={SURFACE_GAP}
              strokeWidth={2}
              onPointerMove={() => setHover(seg)}
              onPointerLeave={() => setHover(null)}
              tabIndex={0}
              onFocus={() => setHover(seg)}
              onBlur={() => setHover(null)}
              style={{ cursor: "pointer", transition: "opacity 0.15s" }}
              opacity={hover && hover.key !== seg.key ? 0.45 : 1}
            />
          ))}
          <text x={cx} y={cy - 4} textAnchor="middle" fontSize={30} fontWeight={800} fill={INK_PRIMARY}>
            {hover ? hover.value : `${presentPct}%`}
          </text>
          <text x={cx} y={cy + 18} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
            {hover ? hover.label : "present"}
          </text>
        </svg>
      </div>
      <ul className="chart-legend chart-legend-grid">
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
 * Radial half-gauge for a single ratio (collection %). One severity-colored arc
 * on a track, with the figure in the center. Reads as a speedometer.
 */
export function RadialGauge({ percentage = 0, collected, due, formatMoney }) {
  const pct = Math.max(0, Math.min(100, Number(percentage) || 0));
  const color = pct >= 80 ? STATUS.good : pct >= 50 ? STATUS.warning : STATUS.critical;
  const width = 240;
  const height = 150;
  const cx = width / 2;
  const cy = height - 12;
  const r = 100;
  const track = 16;
  const a0 = Math.PI; // 180deg (left)
  const a1 = Math.PI + (pct / 100) * Math.PI;

  const arc = (start, end) => {
    const [x1, y1] = polar(cx, cy, r, start);
    const [x2, y2] = polar(cx, cy, r, end);
    const large = end - start > Math.PI ? 1 : 0;
    return `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2}`;
  };

  return (
    <div className="chart-block">
      <div className="chart-gauge" style={{ position: "relative" }}>
        <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Fee collection ${pct}% of total`}>
          <path d={arc(a0, 2 * Math.PI)} fill="none" stroke="#e6ecf5" strokeWidth={track} strokeLinecap="round" />
          <path d={arc(a0, a1)} fill="none" stroke={color} strokeWidth={track} strokeLinecap="round" />
          <text x={cx} y={cy - 26} textAnchor="middle" fontSize={34} fontWeight={800} fill={color}>
            {pct.toFixed(0)}%
          </text>
          <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={INK_MUTED}>
            collected
          </text>
        </svg>
      </div>
      <div className="chart-meter-caption">
        <span><strong style={{ color: STATUS.good }}>{formatMoney(collected)}</strong> collected</span>
        <span><strong style={{ color: STATUS.critical }}>{formatMoney(due)}</strong> outstanding</span>
      </div>
    </div>
  );
}

/**
 * Change-over-time for a single measure (daily attendance %). Area+line, one
 * series so no legend; crosshair tooltip on hover; nulls break the line.
 */
export function TrendArea({ data = [], color = "#5b4fe9", unit = "%", emptyText = "No trend data yet." }) {
  const [hover, setHover] = useState(null);
  const gid = useId();
  const points = (data || []).map((d, i) => ({ ...d, i }));
  const hasData = points.some((p) => p.percentage != null);
  if (!hasData) return <p className="chart-empty">{emptyText}</p>;

  const width = 640;
  const height = 200;
  const padL = 30;
  const padR = 12;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const n = points.length;
  const x = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => padT + plotH - (v / 100) * plotH;

  // Build line as subpaths broken on null; area only for contiguous runs.
  const runs = [];
  let cur = [];
  for (const p of points) {
    if (p.percentage == null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length) runs.push(cur);

  const linePath = runs
    .map((run) => run.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.percentage).toFixed(1)}`).join(" "))
    .join(" ");
  const areaPath = runs
    .map((run) => {
      const top = run.map((p, k) => `${k === 0 ? "M" : "L"}${x(p.i).toFixed(1)},${y(p.percentage).toFixed(1)}`).join(" ");
      const first = run[0], last = run[run.length - 1];
      return `${top} L${x(last.i).toFixed(1)},${y(0)} L${x(first.i).toFixed(1)},${y(0)} Z`;
    })
    .join(" ");

  const ticks = [0, 25, 50, 75, 100];
  const labelEvery = Math.ceil(n / 7);

  function onMove(e) {
    const box = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - box.left) / box.width) * width;
    let nearest = null, best = Infinity;
    for (const p of points) {
      if (p.percentage == null) continue;
      const dx = Math.abs(x(p.i) - relX);
      if (dx < best) { best = dx; nearest = p; }
    }
    if (nearest) setHover(nearest);
  }

  return (
    <div className="chart-block" style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Attendance trend"
           onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={width - padR} y2={y(t)} stroke={GRIDLINE} strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill={INK_MUTED}>{t}</text>
          </g>
        ))}
        <path d={areaPath} fill={`url(#grad-${gid})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {points.filter((p) => p.percentage != null).map((p) => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.percentage)} r={hover && hover.i === p.i ? 5 : 3}
                  fill={color} stroke={SURFACE_GAP} strokeWidth={2} />
        ))}
        {points.map((p, k) =>
          k % labelEvery === 0 ? (
            <text key={p.i} x={x(p.i)} y={height - 8} textAnchor="middle" fontSize={9.5} fill={INK_MUTED}>
              {(p.date || "").slice(5)}
            </text>
          ) : null
        )}
        {hover && <line x1={x(hover.i)} y1={padT} x2={x(hover.i)} y2={padT + plotH} stroke={color} strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
      </svg>
      {hover && (
        <Tooltip x={(x(hover.i) / width) * 100 + "%"} y={(y(hover.percentage) / height) * 100 + "%"}>
          <strong>{hover.percentage}{unit}</strong> · {(hover.date || "").slice(5)}
        </Tooltip>
      )}
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
