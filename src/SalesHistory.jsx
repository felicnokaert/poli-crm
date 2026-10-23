import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { GOAL_METRICS } from "./sales-model.mjs";
import { GRANULARITIES, availableYears, defaultMetric, salesSeries, seriesSummary } from "./sales-history.mjs";

const compact = (value, metric) => {
  const n = Number(value) || 0;
  if (metric === "count") return String(Math.round(n));
  const abs = Math.abs(n);
  const unit = metric === "netUsd" ? "US$ " : "$ ";
  if (abs >= 1e6) return `${unit}${(n / 1e6).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1e3) return `${unit}${Math.round(n / 1e3)} mil`;
  return `${unit}${Math.round(n)}`;
};

export function SalesHistory({ sales = [], goals = [], units = {}, unitNames = [], onPickPeriod }) {
  const years = useMemo(() => availableYears(sales, goals), [sales, goals]);
  const [year, setYear] = useState(years[0]);
  const [granularity, setGranularity] = useState("month");
  const [metric, setMetric] = useState(() => defaultMetric(goals));
  const [unit, setUnit] = useState("Todas");
  const [rate, setRate] = useState(() => String(goals.find((goal) => Number(goal.fallbackRate) > 0)?.fallbackRate || ""));
  const series = useMemo(() => salesSeries(sales, goals, { year, granularity, metric, unit, units, fallbackRate: Number(rate) || 0 }), [sales, goals, year, granularity, metric, unit, units, rate]);
  const summary = seriesSummary(series, metric);
  const format = GOAL_METRICS[metric].format;
  const max = Math.max(1, ...series.map((item) => Math.max(item.value, item.target || 0)));
  // 23/10 (Felipe: "el gráfico es muy grande e invasivo"): más bajo, barras finas y solo el valor del mejor período.
  const W = 760, H = 150, top = 18, bottom = 22, left = 8, right = 8;
  const plotH = H - top - bottom;
  const slot = (W - left - right) / series.length;
  const barW = Math.min(24, slot * 0.46);
  const bestKey = summary.best?.key;
  const pick = (item) => onPickPeriod?.(granularity === "month" ? "month" : granularity === "quarter" ? "quarter" : "all", item.key, item);

  return (
    <section className="panel sales-history">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Historial · nada se pierde</span>
          <h2><BarChart3 size={18} /> Ventas y objetivos en el tiempo</h2>
          <p>Mirá cualquier año por mes, trimestre o semestre. Tocá una barra para ver las ventas de ese período.</p>
        </div>
      </div>
      <div className="panel-head-actions sales-history-controls">
        <select aria-label="Año" value={year} onChange={(event) => setYear(event.target.value)}>{years.map((y) => <option key={y}>{y}</option>)}</select>
        <div className="segmented" role="group" aria-label="Período">
          {Object.entries(GRANULARITIES).map(([key, label]) => <button key={key} type="button" className={granularity === key ? "selected" : ""} aria-pressed={granularity === key} onClick={() => setGranularity(key)}>{label}</button>)}
        </div>
        <select aria-label="Qué medir" value={metric} onChange={(event) => setMetric(event.target.value)}>{Object.entries(GOAL_METRICS).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}</select>
        <select aria-label="Unidad de negocio" value={unit} onChange={(event) => setUnit(event.target.value)}><option>Todas</option>{unitNames.map((name) => <option key={name}>{name}</option>)}</select>
        {metric === "netUsd" && <label className="muted small">Cotización de referencia para ventas en pesos <input type="number" min="0" value={rate} onChange={(event) => setRate(event.target.value)} style={{ width: 90 }} /></label>}
      </div>
      <div className="sales-history-summary">
        <div><span>Total {year}</span><strong>{format(summary.total)}</strong></div>
        <div><span>Mejor período</span><strong>{summary.best ? `${summary.best.label} · ${compact(summary.best.value, metric)}` : "—"}</strong></div>
      </div>
      <svg className="sales-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Gráfico ${GRANULARITIES[granularity].toLowerCase()} de ${GOAL_METRICS[metric].label.toLowerCase()} ${year}`}>
        <defs><linearGradient id="sales-bar-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ed1c24" /><stop offset="1" stopColor="#ed1c24" stopOpacity=".55" /></linearGradient><linearGradient id="sales-bar-hit" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#2e7d32" /><stop offset="1" stopColor="#2e7d32" stopOpacity=".55" /></linearGradient></defs>
        {[0.5, 1].map((part) => <line key={part} x1={left} x2={W - right} y1={top + plotH - plotH * part} y2={top + plotH - plotH * part} stroke="currentColor" opacity=".07" />)}
        <line x1={left} x2={W - right} y1={top + plotH} y2={top + plotH} stroke="currentColor" opacity=".18" />
        {series.map((item, index) => {
          const x = left + slot * index + (slot - barW) / 2;
          const h = (item.value / max) * plotH;
          const y = top + plotH - h;
          const hit = item.target && item.value >= item.target;
          return (
            <g key={item.key} className="sales-bar" role="button" tabIndex={0} aria-label={`${item.label}: ${format(item.value)}${item.target ? `, objetivo ${format(item.target)}` : ""}`} onClick={() => pick(item)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(item); } }}>
              <title>{`${item.label} ${year}: ${format(item.value)} · ${item.count} ${item.count === 1 ? "venta" : "ventas"}${item.target ? ` · objetivo ${format(item.target)}` : ""}`}</title>
              <rect x={left + slot * index} y={top} width={slot} height={plotH + bottom} fill="transparent" />
              <rect x={x} y={y} width={barW} height={Math.max(h, item.value > 0 ? 2 : 0)} rx="4" fill={hit ? "url(#sales-bar-hit)" : "url(#sales-bar-fill)"} opacity={item.value > 0 ? 1 : .15} />
              {item.target ? <line x1={x - 4} x2={x + barW + 4} y1={top + plotH - (item.target / max) * plotH} y2={top + plotH - (item.target / max) * plotH} stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" opacity=".6" /> : null}
              {item.value > 0 && <text className={item.key === bestKey ? "sales-bar-value best" : "sales-bar-value"} x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">{compact(item.value, metric)}</text>}
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize="10" fill="currentColor" opacity=".6">{item.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="muted small"><span className="sales-legend-bar" /> Vendido · <span className="sales-legend-target" /> Objetivo del período: suma de los objetivos de esa medida (uno trimestral se reparte en partes iguales entre sus meses). Verde: llegaste.</p>
    </section>
  );
}
