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
      {/* 23/10 (Felipe: "muy grande, invasivo y feo"; después "raro, con mucho margen"): barras en HTML a todo el ancho
          y altura fija, así no se agranda ni se achica con la pantalla. Solo el mejor período muestra su valor. */}
      <div className="sales-bars" style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }} role="group" aria-label={`Gráfico ${GRANULARITIES[granularity].toLowerCase()} de ${GOAL_METRICS[metric].label.toLowerCase()} ${year}`}>
        {series.map((item) => {
          const height = (item.value / max) * 100;
          const hit = item.target && item.value >= item.target;
          return (
            <button key={item.key} type="button" className={`sales-bar-col${item.key === bestKey ? " best" : ""}`} onClick={() => pick(item)}
              title={`${item.label} ${year}: ${format(item.value)} · ${item.count} ${item.count === 1 ? "venta" : "ventas"}${item.target ? ` · objetivo ${format(item.target)}` : ""}`}
              aria-label={`${item.label}: ${format(item.value)}${item.target ? `, objetivo ${format(item.target)}` : ""}`}>
              <span className="sales-bar-track">
                {item.target ? <span className="sales-bar-target" style={{ bottom: `${(item.target / max) * 100}%` }} /> : null}
                <span className={`sales-bar-fill${hit ? " hit" : ""}${item.value > 0 ? "" : " is-zero"}`} style={{ height: item.value > 0 ? `max(3px, ${height}%)` : "3px" }}>
                  {item.value > 0 && <span className="sales-bar-value">{compact(item.value, metric)}</span>}
                </span>
              </span>
              <span className="sales-bar-label">{item.label}</span>
            </button>
          );
        })}
      </div>
      <p className="muted small"><span className="sales-legend-bar" /> Vendido · <span className="sales-legend-target" /> Objetivo del período: suma de los objetivos de esa medida (uno trimestral se reparte en partes iguales entre sus meses). Verde: llegaste.</p>
    </section>
  );
}
