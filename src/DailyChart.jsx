import { ACCOUNT_COLORS } from "./ml-board.mjs";

const money = (value, currency) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }) : "—");
const number = (value) => (typeof value === "number" ? value.toLocaleString("es-AR") : "—");
const dayLabel = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

export const CHART_METRICS = [["amount", "Facturado"], ["orders", "Ventas"], ["visits", "Visitas"]];

// Gráfico del Resumen (21/10, Felipe: "mejores gráficos"): barras con degradé, el valor arriba de cada
// barra (si son pocos días), línea de promedio y el día más alto resaltado.
const short = (value) => (value >= 1e6 ? `${(value / 1e6).toFixed(1).replace(".", ",")} M` : value >= 1e3 ? `${Math.round(value / 1e3)} mil` : String(Math.round(value)));

export function DailyChart({ days = [], metric, currency, stacks = [], tone = "" }) {
  const own = days.map((day) => (typeof day[metric] === "number" ? day[metric] : 0));
  const values = stacks.length ? days.map((_, index) => stacks.reduce((sum, stack) => sum + (stack.values[index] || 0), 0)) : own;
  if (!days.length || values.every((value) => value === 0)) return <p className="muted">Sin datos para graficar en este período.</p>;
  const W = 680;
  const H = 92;
  const top = 18;
  const max = Math.max(...values);
  const best = values.indexOf(max);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const width = W / days.length;
  const step = Math.max(1, Math.ceil(days.length / 10));
  const format = (value) => (metric === "amount" ? money(value, currency) : number(value));
  const tag = (value) => (metric === "amount" ? `$ ${short(value)}` : number(value));
  const averageY = top + H - (average / max) * H;
  const single = ACCOUNT_COLORS[tone] || "";
  return (
    <figure className="ml-chart-wrap">
      <svg className="sales-chart ml-chart" viewBox={`0 0 ${W} ${H + top + 22}`} role="img" aria-label={`${CHART_METRICS.find(([key]) => key === metric)?.[1]} por día`}>
        <defs>
          <linearGradient id="ml-bar-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={single || "var(--brand-red, #ed1c24)"} stopOpacity="0.95" />
            <stop offset="100%" stopColor={single || "var(--brand-red, #ed1c24)"} stopOpacity="0.4" />
          </linearGradient>
        </defs>
        {[0.5].map((share) => <line key={share} x1="0" x2={W} y1={top + H * share} y2={top + H * share} className="ml-chart-grid" />)}
        <line x1="0" x2={W} y1={H + top} y2={H + top} className="ml-chart-axis" />
        {days.map((day, index) => {
          const x = index * width;
          const barWidth = Math.max(4, Math.min(26, width * 0.5));
          const left = x + (width - barWidth) / 2;
          const total = Math.round((values[index] / max) * H);
          let used = 0;
          const detail = stacks.length ? ` · ${stacks.map((stack) => `${stack.name}: ${metric === "amount" ? money(stack.values[index] || 0, currency) : number(stack.values[index] || 0)}`).join(" · ")}` : "";
          return (
            <g key={day.day} className={`ml-chart-col ${index === best ? "is-best" : ""}`} style={{ "--i": index }}>
              <title>{`${dayLabel(day.day)}: ${money(day.amount, currency)} · ${day.orders} venta${day.orders === 1 ? "" : "s"}${typeof day.visits === "number" ? ` · ${number(day.visits)} visitas` : ""}${detail}`}</title>
              <rect x={x} y={top} width={width} height={H} className="ml-chart-hit" />
              {stacks.length ? stacks.map((stack) => {
                const part = values[index] ? Math.round(((stack.values[index] || 0) / max) * H) : 0;
                const y = top + H - used - part;
                used += part;
                return part > 0 ? <rect key={stack.key} x={left} y={y} width={barWidth} height={part} rx={2} className="ml-chart-bar" fill={ACCOUNT_COLORS[stack.tone]} /> : null;
              }) : <rect x={left} y={top + H - total} width={barWidth} height={Math.max(total, values[index] ? 3 : 0)} rx={Math.min(6, barWidth / 3)} className="ml-chart-bar" fill="url(#ml-bar-fill)" />}
              {index === best && <text x={x + width / 2} y={top + H - total - 6} textAnchor="middle" className="ml-chart-value">{tag(values[index])}</text>}
              {index % step === 0 && <text x={x + width / 2} y={H + top + 15} textAnchor="middle" className="ml-chart-label">{dayLabel(day.day)}</text>}
            </g>
          );
        })}
        <line x1="0" x2={W} y1={averageY} y2={averageY} className="ml-chart-average" />
      </svg>
      <figcaption className="muted small">Día más alto: <strong>{dayLabel(days[best].day)}</strong> con {format(max)} · promedio por día {format(Math.round(average))} (línea punteada)</figcaption>
    </figure>
  );
}
