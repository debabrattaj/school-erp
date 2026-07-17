import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  Pencil,
  Check,
  BarChart3,
  PieChart,
  LineChart,
  Hash,
  Table as TableIcon,
  Trash2,
  LayoutGrid,
} from "lucide-react";
import API from "../api";
import { getUser } from "../auth";
import { CategoryBarChart } from "./DashboardCharts";

/* Cohesive categorical palette (matches the KPI-card accents). Fixed order,
   never cycled; a 9th+ category folds into "Other". */
const PALETTE = [
  "#5b4fe9", "#0d9488", "#f59e0b", "#e11d48",
  "#2563eb", "#16a34a", "#7c3aed", "#0891b2",
];
const OTHER = "#94a3b8";

const CHART_TYPES = [
  { id: "bar", label: "Bar", icon: BarChart3 },
  { id: "donut", label: "Donut", icon: PieChart },
  { id: "pie", label: "Pie", icon: PieChart },
  { id: "line", label: "Line", icon: LineChart },
  { id: "area", label: "Area", icon: LineChart },
  { id: "stat", label: "Stat", icon: Hash },
  { id: "table", label: "Table", icon: TableIcon },
];

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function defaultWidget() {
  return {
    id: uid(),
    title: "Students by Class",
    source: "students",
    groupBy: "class_name",
    measure: "count",
    chartType: "bar",
    academicYear: "",
    status: "",
  };
}

const STARTER = [
  { id: uid(), title: "Students by House", source: "students", groupBy: "house", measure: "count", chartType: "donut", academicYear: "", status: "" },
  { id: uid(), title: "Collected by Fee Type", source: "fees", groupBy: "fee_type", measure: "paid_amount", chartType: "bar", academicYear: "", status: "" },
  { id: uid(), title: "Grade Distribution", source: "marks", groupBy: "grade", measure: "count", chartType: "bar", academicYear: "", status: "" },
  { id: uid(), title: "Outstanding by Status", source: "fees", groupBy: "payment_status", measure: "due_amount", chartType: "pie", academicYear: "", status: "" },
];

function storageKey() {
  const u = getUser();
  return `school_erp_dashboard_widgets_${u?.id || u?.email || "me"}`;
}

export default function DashboardBuilder({ formatMoney }) {
  const [catalog, setCatalog] = useState(null);
  const [widgets, setWidgets] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey());
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return STARTER;
  });
  const [editingId, setEditingId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Load the catalog and the user's saved layout from the server. localStorage
  // seeded the initial state for an instant paint; the server is the source of
  // truth so the layout follows the user across devices.
  useEffect(() => {
    let active = true;
    Promise.all([
      API.get("/dashboard/report/catalog").then((r) => { if (active) setCatalog(r.data); }).catch(() => {}),
      API.get("/dashboard/layout").then((r) => {
        if (active && Array.isArray(r.data?.widgets)) setWidgets(r.data.widgets);
      }).catch(() => { /* offline: keep the local copy */ }),
    ]).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  // Persist to the server (debounced) once the initial load has settled, and
  // mirror to localStorage as an offline cache.
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(storageKey(), JSON.stringify(widgets)); } catch { /* ignore */ }
    const t = setTimeout(() => {
      API.put("/dashboard/layout", { widgets }).catch(() => { /* keep local copy */ });
    }, 600);
    return () => clearTimeout(t);
  }, [widgets, loaded]);

  function addWidget() {
    const w = defaultWidget();
    setWidgets((prev) => [...prev, w]);
    setEditingId(w.id);
  }
  function removeWidget(id) {
    setWidgets((prev) => prev.filter((w) => w.id !== id));
    if (editingId === id) setEditingId(null);
  }
  function updateWidget(id, patch) {
    setWidgets((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  return (
    <div className="builder">
      <div className="builder-toolbar">
        <div className="builder-toolbar-title">
          <LayoutGrid size={18} />
          <span>My Dashboard</span>
          <em>{widgets.length} widget{widgets.length === 1 ? "" : "s"}</em>
        </div>
        <button type="button" className="builder-add" onClick={addWidget}>
          <Plus size={16} /> Add widget
        </button>
      </div>

      {widgets.length === 0 ? (
        <div className="builder-empty">
          <p>No widgets yet. Click <strong>Add widget</strong> to build your dashboard.</p>
        </div>
      ) : (
        <div className="builder-grid">
          {widgets.map((w) => (
            <WidgetCard
              key={w.id}
              widget={w}
              catalog={catalog}
              formatMoney={formatMoney}
              editing={editingId === w.id}
              onEdit={() => setEditingId(w.id)}
              onCloseEdit={() => setEditingId(null)}
              onRemove={() => removeWidget(w.id)}
              onChange={(patch) => updateWidget(w.id, patch)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function WidgetCard({ widget, catalog, formatMoney, editing, onEdit, onCloseEdit, onRemove, onChange }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { source, groupBy, measure, academicYear, status } = widget;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const params = { source, group_by: groupBy, measure };
    if (academicYear) params.academic_year = academicYear;
    if (status) params.status = status;
    API.get("/dashboard/report", { params })
      .then((r) => { if (active) { setReport(r.data); setLoading(false); } })
      .catch((e) => { if (active) { setError(e?.response?.data?.detail || "Could not load report"); setLoading(false); } });
    return () => { active = false; };
  }, [source, groupBy, measure, academicYear, status]);

  const fmt = (v) => (report?.is_currency && formatMoney ? formatMoney(v) : v.toLocaleString());

  return (
    <div className={`widget-card ${editing ? "widget-card-editing" : ""}`}>
      <div className="widget-head">
        <div className="widget-title">
          <h3>{widget.title || "Untitled"}</h3>
          {report && <p>{report.measure_label} by {report.dimension_label}</p>}
        </div>
        <div className="widget-actions">
          <button type="button" title="Configure" onClick={editing ? onCloseEdit : onEdit}>
            {editing ? <Check size={16} /> : <Pencil size={15} />}
          </button>
          <button type="button" title="Remove" className="widget-remove" onClick={onRemove}>
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {editing ? (
        <WidgetConfig widget={widget} catalog={catalog} onChange={onChange} />
      ) : (
        <div className="widget-body">
          {loading ? (
            <div className="widget-loading">Loading…</div>
          ) : error ? (
            <div className="widget-error">{error}</div>
          ) : !report || report.labels.length === 0 ? (
            <div className="widget-loading">No data for this selection.</div>
          ) : (
            <WidgetChart type={widget.chartType} report={report} fmt={fmt} />
          )}
        </div>
      )}
    </div>
  );
}

function WidgetConfig({ widget, catalog, onChange }) {
  if (!catalog) return <div className="widget-body"><div className="widget-loading">Loading options…</div></div>;
  const sources = Object.entries(catalog);
  const src = catalog[widget.source] || {};
  const dimensions = Object.entries(src.dimensions || {});
  const measures = Object.entries(src.measures || {});

  function changeSource(source) {
    const next = catalog[source] || {};
    const dims = Object.keys(next.dimensions || {});
    const meas = Object.keys(next.measures || {});
    onChange({
      source,
      groupBy: dims[0] || "",
      measure: meas.includes(widget.measure) ? widget.measure : meas[0] || "count",
    });
  }

  return (
    <div className="widget-config">
      <label>
        <span>Title</span>
        <input type="text" value={widget.title} onChange={(e) => onChange({ title: e.target.value })} />
      </label>
      <div className="widget-config-row">
        <label>
          <span>Report</span>
          <select value={widget.source} onChange={(e) => changeSource(e.target.value)}>
            {sources.map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        <label>
          <span>Group by</span>
          <select value={widget.groupBy} onChange={(e) => onChange({ groupBy: e.target.value })}>
            {dimensions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <div className="widget-config-row">
        <label>
          <span>Measure</span>
          <select value={widget.measure} onChange={(e) => onChange({ measure: e.target.value })}>
            {measures.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          <span>Chart</span>
          <select value={widget.chartType} onChange={(e) => onChange({ chartType: e.target.value })}>
            {CHART_TYPES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      </div>
      <div className="widget-config-row">
        <label>
          <span>Academic year (filter)</span>
          <input type="text" placeholder="e.g. 2026-27" value={widget.academicYear} onChange={(e) => onChange({ academicYear: e.target.value })} />
        </label>
        <label>
          <span>Status (filter)</span>
          <input type="text" placeholder="e.g. Active / Paid" value={widget.status} onChange={(e) => onChange({ status: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

/* ---------- generic chart renderer ---------- */

function WidgetChart({ type, report, fmt }) {
  const { labels, values } = report;
  if (type === "bar") {
    const data = labels.map((label, i) => ({ label, value: values[i] }));
    return <CategoryBarChart data={data} valueFormatter={fmt} />;
  }
  if (type === "stat") {
    const total = values.reduce((a, b) => a + b, 0);
    return (
      <div className="widget-stat">
        <strong>{fmt(total)}</strong>
        <span>{report.measure_label} across {labels.length} {report.dimension_label.toLowerCase()} groups</span>
      </div>
    );
  }
  if (type === "table") {
    return (
      <div className="widget-table-wrap">
        <table className="widget-table">
          <thead><tr><th>{report.dimension_label}</th><th>{report.measure_label}</th></tr></thead>
          <tbody>
            {labels.map((l, i) => (
              <tr key={l}><td>{l}</td><td>{fmt(values[i])}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (type === "line" || type === "area") {
    return <GenericLine labels={labels} values={values} fmt={fmt} area={type === "area"} />;
  }
  // donut / pie
  return <GenericPie labels={labels} values={values} fmt={fmt} donut={type === "donut"} />;
}

function colorFor(i) {
  return i < PALETTE.length ? PALETTE[i] : OTHER;
}

function GenericPie({ labels, values, fmt, donut }) {
  const [hover, setHover] = useState(null);
  const total = values.reduce((a, b) => a + b, 0) || 1;
  const size = 180;
  const cx = size / 2, cy = size / 2, r = 82, rInner = donut ? 50 : 0;
  const gap = 0.02;
  let angle = -Math.PI / 2;

  const polar = (rad, a) => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  const arcs = labels.map((label, i) => {
    const sweep = (values[i] / total) * Math.PI * 2;
    const a0 = angle + gap / 2;
    const a1 = angle + sweep - gap / 2;
    angle += sweep;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x1, y1] = polar(r, a0);
    const [x2, y2] = polar(r, Math.max(a1, a0 + 0.001));
    let d;
    if (rInner > 0) {
      const [x3, y3] = polar(rInner, Math.max(a1, a0 + 0.001));
      const [x4, y4] = polar(rInner, a0);
      d = `M${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} L${x3},${y3} A${rInner},${rInner} 0 ${large} 0 ${x4},${y4} Z`;
    } else {
      d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large} 1 ${x2},${y2} Z`;
    }
    return { label, value: values[i], color: colorFor(i), d };
  });

  return (
    <div className="widget-pie-block">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
        {arcs.map((a, i) => (
          <path key={a.label} d={a.d} fill={a.color} stroke="#fff" strokeWidth={2}
            opacity={hover != null && hover !== i ? 0.45 : 1}
            onPointerMove={() => setHover(i)} onPointerLeave={() => setHover(null)}
            style={{ transition: "opacity .15s" }} />
        ))}
        {donut && (
          <>
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize={20} fontWeight={800} fill="#172033">
              {hover != null ? fmt(arcs[hover].value) : fmt(total)}
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize={10} fill="#898781">
              {hover != null ? arcs[hover].label : "total"}
            </text>
          </>
        )}
      </svg>
      <ul className="chart-legend chart-legend-grid">
        {arcs.map((a) => (
          <li key={a.label}>
            <span className="chart-legend-swatch" style={{ background: a.color }} />
            {a.label} <strong>{fmt(a.value)}</strong>
            <span className="chart-legend-pct"> ({((a.value / total) * 100).toFixed(0)}%)</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function GenericLine({ labels, values, fmt, area }) {
  const [hover, setHover] = useState(null);
  const width = 560, height = 200, padL = 40, padR = 12, padT = 14, padB = 30;
  const plotW = width - padL - padR, plotH = height - padT - padB;
  const max = Math.max(...values, 1);
  const n = values.length;
  const x = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v) => padT + plotH - (v / max) * plotH;
  const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const areaPath = `${line} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`;
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  const every = Math.ceil(n / 8);

  return (
    <div className="chart-block" style={{ position: "relative" }}>
      <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const rx = ((e.clientX - box.left) / box.width) * width;
          let best = Infinity, idx = null;
          values.forEach((_, i) => { const d = Math.abs(x(i) - rx); if (d < best) { best = d; idx = i; } });
          setHover(idx);
        }}
        onPointerLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="wline" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5b4fe9" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#5b4fe9" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} y1={y(t)} x2={width - padR} y2={y(t)} stroke="#e4e2da" strokeWidth={1} />
            <text x={padL - 6} y={y(t) + 3} textAnchor="end" fontSize={10} fill="#898781">{t.toLocaleString()}</text>
          </g>
        ))}
        {area && <path d={areaPath} fill="url(#wline)" />}
        <path d={line} fill="none" stroke="#5b4fe9" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {values.map((v, i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3} fill="#5b4fe9" stroke="#fff" strokeWidth={2} />
        ))}
        {labels.map((l, i) => (i % every === 0 ? (
          <text key={i} x={x(i)} y={height - 10} textAnchor="middle" fontSize={9.5} fill="#898781">
            {String(l).length > 8 ? String(l).slice(0, 7) + "…" : l}
          </text>
        ) : null))}
        {hover != null && <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + plotH} stroke="#5b4fe9" strokeDasharray="3 3" opacity={0.5} />}
      </svg>
      {hover != null && (
        <div className="chart-tooltip" style={{ position: "absolute", left: `${(x(hover) / width) * 100}%`, top: `${(y(values[hover]) / height) * 100}%`, transform: "translate(-50%,-120%)", pointerEvents: "none" }}>
          <strong>{fmt(values[hover])}</strong> · {labels[hover]}
        </div>
      )}
    </div>
  );
}
