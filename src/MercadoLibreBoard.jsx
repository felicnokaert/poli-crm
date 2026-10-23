import { useEffect, useMemo, useState } from "react";
import { MlImprove } from "./MlImprove.jsx";
import { MlCompetition, MlTrends } from "./MlCompetition.jsx";
import { MlEconomics } from "./MlEconomics.jsx";
import { adminFetch } from "./admin-api.mjs";
import { ArrowDownRight, ArrowUpRight, CircleAlert, Clapperboard, Eye, MessageCircleQuestion, PauseCircle, Percent, PlayCircle, RefreshCw, Search, ShoppingBag, Store, Wallet } from "lucide-react";
import { ACCOUNT_COLORS, ML_ISSUES, ML_SORTS, ML_STATUS, accountTone, countQuestions, filterBoard, issuesOf, statusLabel, summarizeBoard } from "./ml-board.mjs";
import { AccountTag } from "./MlAccountTag.jsx";
import { MEDAL, PERIODS, REPUTATION, buildAlerts, change, combineMetrics, latestBySeller, periodStats } from "./ml-summary.mjs";
import { Empty } from "./ui-primitives";
import { descriptionGaps, faqText } from "./ml-faq.mjs";
import { MlAds } from "./MlAds.jsx";

// Ventas → Mercado Libre (21/10): Resumen (como el de Mercado Libre: ventas, visitas, conversión, preguntas,
// reputación y qué atender, en 7/14/30 días contra el período anterior) y Publicaciones de las 3 cuentas.
// Solo muestra lo que se trajo de Mercado Libre (actualización diaria y Más → Datos); no cambia nada allá.
const PAGE = 100;
const COLUMNS = "id,seller_id,title,permalink,status,price,currency,sold_quantity,available_quantity,pictures_count,health,thumbnail,description_length,item_updated_at,visits_7d,visits_30d,clips_count";
const money = (value, currency) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }) : "—");
const number = (value) => (typeof value === "number" ? value.toLocaleString("es-AR") : "—");
const percent = (value) => (typeof value === "number" ? `${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %` : "—");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");
const dayLabel = (day) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

async function loadAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function Trend({ value }) {
  if (typeof value !== "number") return <small className="muted">sin comparación</small>;
  const up = value >= 0;
  return (
    <small className={`ml-trend ${up ? "up" : "down"}`}>
      {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
      {`${up ? "+" : ""}${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })} % vs. período anterior`}
    </small>
  );
}

const LEAF_LABELS = { resumen: "Resumen", publicaciones: "Todas las publicaciones", mejorar: "Qué mejorar", competencia: "Competencia", tendencias: "Tendencias", stock: "Stock y ganancia", publicidad: "Publicidad" };
const CHART_METRICS = [["amount", "Facturado"], ["orders", "Ventas"], ["visits", "Visitas"]];

// Gráfico del Resumen (21/10, Felipe: "mejores gráficos"): barras con degradé, el valor arriba de cada
// barra (si son pocos días), línea de promedio y el día más alto resaltado.
const short = (value) => (value >= 1e6 ? `${(value / 1e6).toFixed(1).replace(".", ",")} M` : value >= 1e3 ? `${Math.round(value / 1e3)} mil` : String(Math.round(value)));

function DailyChart({ days = [], metric, currency, stacks = [], tone = "" }) {
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

// Lo que más preguntan y no está en la descripción (consejo del asistente de Mercado Libre). Se calcula al
// tocar el botón: trae las preguntas y las descripciones de las activas con 3+ preguntas.
function FaqGaps({ supabase, items, seller, nickname }) {
  const [gaps, setGaps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  async function look() {
    setBusy(true);
    try {
      const questions = await loadAll(() => supabase.from("ml_questions").select("item_id,question,answer").order("id"));
      const counts = {};
      for (const row of questions) counts[row.item_id] = (counts[row.item_id] || 0) + 1;
      const active = items.filter((item) => item.status === "active" && (!seller || item.seller_id === seller) && counts[item.id] >= 3);
      const descriptions = {};
      for (let index = 0; index < active.length; index += 100) {
        const { data } = await supabase.from("ml_items").select("id,description").in("id", active.slice(index, index + 100).map((item) => item.id));
        for (const row of data || []) descriptions[row.id] = row.description || "";
      }
      setGaps(descriptionGaps(active.map((item) => ({ ...item, description: descriptions[item.id] || "" })), questions));
    } catch { setGaps([]); }
    setBusy(false);
  }
  async function copy(gap) {
    try { await navigator.clipboard.writeText(faqText(gap)); setCopied(gap.id); setTimeout(() => setCopied(""), 1600); } catch { /* sin portapapeles */ }
  }
  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">Consejo de Mercado Libre · nada se cambia solo</span><h2>Lo que preguntan y no está en la descripción</h2>
          <p className="muted small">Si una pregunta se repite, sumar la respuesta a la descripción ahorra preguntas y ayuda a vender. Te armo el texto con lo que más respondimos.</p></div>
        <div className="panel-head-actions"><button type="button" className="secondary" disabled={busy || !supabase} onClick={look}>{busy ? "Revisando…" : gaps ? "Revisar de nuevo" : "Revisar publicaciones"}</button></div>
      </div>
      {gaps && gaps.length === 0 && <p className="muted">No encontré preguntas repetidas que falten en las descripciones.</p>}
      {gaps && gaps.length > 0 && (
        <ul className="ml-faq">
          {gaps.map((gap) => (
            <li key={gap.id}>
              <div><a href={gap.permalink} target="_blank" rel="noreferrer"><strong>{gap.title}</strong></a> <span className="muted small">{nickname?.[gap.seller_id] || ""}</span></div>
              <ul>{gap.missing.map((entry) => <li key={entry.key}><strong>{entry.label}</strong> <span className="muted small">({entry.asked} preguntas)</span>{entry.answer ? `: ${entry.answer}` : <span className="muted small"> · respondimos distinto: conviene definir una respuesta</span>}</li>)}</ul>
              {gap.missing.some((entry) => entry.answer) && <button type="button" className="link-button" onClick={() => copy(gap)}>{copied === gap.id ? "Copiado" : "Copiar texto para la descripción"}</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Summary({ accounts, metricsBySeller, seller, items, nickname, permalinks, onIssue, isAdmin, session, onReload, supabase }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [period, setPeriod] = useState(7);
  const [metric, setMetric] = useState("amount");
  const chosen = seller ? { [seller]: metricsBySeller[seller] } : metricsBySeller;
  const data = combineMetrics(Object.values(chosen).filter(Boolean));
  const stats = useMemo(() => periodStats(data?.days || [], period), [data, period]);
  const alerts = buildAlerts({ metricsBySeller: chosen, items: items.filter((item) => !seller || item.seller_id === seller), nickname });
  const currency = data?.sales?.currency || "ARS";
  const salesKnown = Boolean(data?.sales);
  const takenAt = Object.values(chosen).map((value) => value?.to).filter(Boolean).sort().at(0);

  async function refresh() {
    setError("");
    for (const account of accounts) {
      setBusy(account.nickname || account.seller_id);
      try {
        const response = await adminFetch({ action: "mercadolibre", op: "metrics", sellerId: account.seller_id }, session?.access_token);
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo actualizar el resumen.");
      } catch (refreshError) { setError(`${account.nickname}: ${refreshError.message}`); }
    }
    setBusy("");
    onReload();
  }

  const { current, previous } = stats;
  // Por cuenta (cada una con su color): para apilar las barras del gráfico y para el cuadro "Por cuenta".
  const perAccount = accounts.filter((account) => !seller || account.seller_id === seller).map((account) => {
    const accountData = metricsBySeller[account.seller_id];
    const accountDays = new Map((accountData?.days || []).map((entry) => [entry.day, entry]));
    const name = account.nickname || String(account.seller_id);
    return {
      key: String(account.seller_id), name, tone: accountTone(name),
      values: stats.series.map((entry) => { const value = accountDays.get(entry.day)?.[metric]; return typeof value === "number" ? value : 0; }),
      total: periodStats(accountData?.days || [], period).current[metric],
    };
  });
  const stacked = perAccount.length > 1 ? perAccount : [];
  const grandTotal = perAccount.reduce((sum, row) => sum + (typeof row.total === "number" ? row.total : 0), 0);
  const chartFormat = (value) => (metric === "amount" ? money(value, currency) : number(value));
  return (
    <>
      <div className="ml-toolbar">
        <div className="segmented" role="tablist" aria-label="Período">
          {PERIODS.map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={period === key} className={period === key ? "selected" : ""} onClick={() => setPeriod(key)}>{label}</button>
          ))}
        </div>
        <span className="muted small">Datos del {fmt(takenAt)} · se actualiza solo cada mañana</span>
        {isAdmin && <button type="button" className="secondary" disabled={Boolean(busy)} onClick={refresh}><RefreshCw size={14} /> {busy ? `Actualizando ${busy}…` : "Actualizar resumen"}</button>}
      </div>
      {error && <div className="system-message error">{error}</div>}
      {!data && <Empty text="Todavía no hay resumen. Se arma solo todos los días a la mañana (o Felipe toca “Actualizar resumen”)." />}
      {data && (<>
        {data.ordersBlocked && (
          <div className="system-message error ml-permission">
            <strong>Mercado Libre no deja leer las ventas.</strong> Por eso no aparecen facturado, ventas ni conversión. Hay que darle a la aplicación el permiso de ventas en Mercado Libre Developers y después volver a conectar cada cuenta (las instrucciones te las pasó Claude).
          </div>
        )}
        <section className="metric-grid ml-metric-grid">
          <article className="metric-card"><Wallet size={20} /><span>Facturado</span><strong>{salesKnown ? money(current.amount, currency) : "—"}</strong>{salesKnown && <Trend value={change(current.amount, previous?.amount)} />}</article>
          <article className="metric-card"><ShoppingBag size={20} /><span>Ventas</span><strong>{salesKnown ? number(current.orders) : "—"}</strong>{salesKnown ? <small>{number(current.units)} unidades</small> : <small className="muted">falta permiso</small>}</article>
          <article className="metric-card"><Eye size={20} /><span>Visitas</span><strong>{number(current.visits)}</strong><Trend value={change(current.visits, previous?.visits)} /></article>
          <article className="metric-card"><Percent size={20} /><span>Conversión</span><strong>{salesKnown ? percent(current.conversion) : "—"}</strong><small className="muted">ventas / visitas</small></article>
          <article className={`metric-card ${data.questionsPending ? "is-urgent" : ""}`}><MessageCircleQuestion size={20} /><span>Preguntas sin responder</span><strong>{number(data.questionsPending)}</strong><small className="muted">ahora</small></article>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Últimos {period} días</span><h2>Día por día</h2></div>
            <div className="segmented" role="tablist" aria-label="Qué graficar">
              {CHART_METRICS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={metric === key} className={metric === key ? "selected" : ""} onClick={() => setMetric(key)}>{label}</button>
              ))}
            </div>
          </div>
          <div className={`ml-chart-layout ${stacked.length ? "has-accounts" : ""}`}>
            <DailyChart days={stats.series} metric={metric} currency={currency} stacks={stacked} tone={seller && perAccount[0] ? perAccount[0].tone : ""} />
            {stacked.length > 0 && (
              <aside className="ml-by-account" aria-label="Por cuenta">
                <span className="eyebrow">Por cuenta · {CHART_METRICS.find(([key]) => key === metric)?.[1].toLowerCase()}</span>
                {perAccount.map((row) => (
                  <div key={row.key} className="ml-by-account-row">
                    <div><AccountTag name={row.name} /><strong>{typeof row.total === "number" ? chartFormat(row.total) : "—"}</strong></div>
                    <div className="ml-share" aria-hidden="true"><i className={`acct-bar acct-${row.tone}`} style={{ width: `${grandTotal ? Math.max(2, Math.round(((row.total || 0) / grandTotal) * 100)) : 0}%` }} /></div>
                    <small className="muted">{grandTotal ? `${Math.round(((row.total || 0) / grandTotal) * 100)} % del total` : ""}</small>
                  </div>
                ))}
              </aside>
            )}
          </div>
          {data.partial && <p className="muted small">A alguna cuenta le falta un dato: el total puede quedar corto.</p>}
        </section>

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Recomendaciones · nada se cambia solo</span><h2>Qué atender hoy</h2></div></div>
          {alerts.length === 0 && <p className="muted">Nada urgente con los datos de hoy.</p>}
          <ul className="ml-alerts">
            {alerts.map((alert) => (
              <li key={alert.key} className={alert.level === "urgent" ? "is-urgent" : ""}>
                <CircleAlert size={16} />
                <span><strong>{alert.text}</strong><small className="muted"> · {alert.detail}</small></span>
                {alert.issue && <button type="button" className="secondary" onClick={() => onIssue(alert.issue)}>Ver cuáles</button>}
                {alert.href && <a className="secondary" href={alert.href} target="_blank" rel="noreferrer">Abrir en Mercado Libre</a>}
              </li>
            ))}
          </ul>
        </section>

        <FaqGaps supabase={supabase} items={items} seller={seller} nickname={nickname} />

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Reputación</span><h2>Cómo está cada cuenta</h2></div></div>
          <div className="table-scroll"><table className="sales-history-table">
            <thead><tr><th>Cuenta</th><th>Color</th><th>Medalla</th><th>Reclamos</th><th>Demoras</th><th>Cancelaciones</th></tr></thead>
            <tbody>
              {accounts.filter((account) => !seller || account.seller_id === seller).map((account) => {
                const reputation = metricsBySeller[account.seller_id]?.reputation;
                const [label, tone] = REPUTATION[reputation?.level] || ["—", ""];
                return (
                  <tr key={account.seller_id}>
                    <td><AccountTag name={account.nickname} /></td>
                    <td>{tone ? <span className={`badge ${tone}`}>{label}</span> : label}</td>
                    <td>{MEDAL[reputation?.medal] || "—"}</td>
                    <td>{percent(reputation?.claims)}</td>
                    <td>{percent(reputation?.delayed)}</td>
                    <td>{percent(reputation?.cancellations)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>

        {data.topItems?.length > 0 && (
          <section className="panel">
            <div className="panel-head"><div><span className="eyebrow">Últimos 30 días</span><h2>Lo más vendido</h2></div></div>
            <div className="table-scroll"><table className="sales-history-table">
              <thead><tr><th>Publicación</th><th>Unidades</th><th>Facturado</th></tr></thead>
              <tbody>
                {data.topItems.map((item) => (
                  <tr key={item.id}>
                    <td>{permalinks[item.id] ? <a href={permalinks[item.id]} target="_blank" rel="noreferrer">{item.title}</a> : item.title}</td>
                    <td>{number(item.units)}</td>
                    <td>{money(item.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </section>
        )}
        {data.errors?.length > 0 && !data.ordersBlocked && <p className="muted small">No se pudo leer: {data.errors.join(" · ")}</p>}
      </>)}
    </>
  );
}

// Clip de una publicación (22/10, Felipe: "un botón que diga con clip"): Mercado Libre no deja leerlo, así que
// se marca a mano. Tocar cambia Sin revisar → Tiene → No tiene.
function ClipCell({ item, canEdit, onClip }) {
  const has = item.clips_count;
  const label = typeof has !== "number" ? "Sin revisar" : has > 0 ? "Tiene clip" : "No tiene";
  const tone = typeof has !== "number" ? "" : has > 0 ? "ok" : "warn";
  if (!canEdit) return <span className={`badge ${tone}`}>{label}</span>;
  return <button type="button" className={`badge ml-clip-toggle ${tone}`} title="Tocá para cambiar" onClick={() => onClip(item, !(has > 0))}>{label}</button>;
}

function Listings({ items, accounts, nickname, questionCounts, seller, issue, setIssue, canEdit = false, onClip }) {
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("vendidas");
  const [pageSize, setPageSize] = useState(PAGE);
  useEffect(() => setPageSize(PAGE), [seller, status, issue, query, sort]);
  const ofSeller = useMemo(() => items.filter((item) => !seller || item.seller_id === seller), [items, seller]);
  const summary = useMemo(() => summarizeBoard(ofSeller), [ofSeller]);
  const shown = useMemo(() => filterBoard(items, { seller, status, issue, query, sort }, questionCounts), [items, seller, status, issue, query, sort, questionCounts]);
  const page = shown.slice(0, pageSize);
  const lastUpdate = accounts.map((account) => account.last_refresh_at || account.last_sync_at).filter(Boolean).sort().at(-1);

  return (<>
    <section className="metric-grid">
      <article className="metric-card"><Store size={20} /><span>Publicaciones</span><strong>{summary.total}</strong></article>
      <article className="metric-card"><PlayCircle size={20} /><span>Activas</span><strong>{summary.byStatus.active || 0}</strong></article>
      <article className="metric-card"><PauseCircle size={20} /><span>Pausadas</span><strong>{summary.byStatus.paused || 0}</strong></article>
      <article className="metric-card"><Eye size={20} /><span>Visitas a activas (7 días)</span><strong>{number(summary.visits7)}</strong></article>
      {summary.clipsUnknown < (summary.byStatus.active || 0) && <article className="metric-card"><Clapperboard size={20} /><span>Activas sin clip</span><strong>{summary.issues["sin-clip"]}</strong></article>}
    </section>

    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Actualizado {fmt(lastUpdate)}</span>
          <h2>Publicaciones</h2>
          <p>Estado, visitas y lo que le falta a cada una. Solo mira: no cambia nada en Mercado Libre.</p>
        </div>
        <label className="search"><Search size={17} /><input aria-label="Buscar publicación" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: espuma, MLA123…" /></label>
      </div>
      <div className="segmented" role="tablist" aria-label="Estado">
        {[["", "Todos los estados"], ...ML_STATUS.filter(([key]) => summary.byStatus[key])].map(([key, label]) => (
          <button key={key || "todos"} type="button" role="tab" aria-selected={status === key} className={status === key ? "selected" : ""} onClick={() => setStatus(key)}>{label}{key ? ` (${summary.byStatus[key]})` : ""}</button>
        ))}
      </div>
      <div className="segmented" role="tablist" aria-label="Qué les falta">
        {[["", "Sin filtro"], ...ML_ISSUES.map(([key, label]) => [key, `${label} (${summary.issues[key]})`])].map(([key, label]) => (
          <button key={key || "ninguno"} type="button" role="tab" aria-selected={issue === key} className={issue === key ? "selected" : ""} onClick={() => setIssue(key)}>{label}</button>
        ))}
      </div>
      <label className="ml-sort muted small">Ordenar por{" "}
        <select value={sort} onChange={(event) => setSort(event.target.value)}>
          {ML_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </label>
      <p className="muted small">Los números de "qué les falta" cuentan solo las activas. Las visitas de cada publicación se completan de a poco cada mañana (o con "Solo visitas" en Más → Datos). Los clips se marcan a mano porque Mercado Libre no deja leerlos: tocá la columna Clip de cada publicación, o pegá una lista en Más → Datos → Mercado Libre.</p>

      {items.length > 0 && shown.length === 0 && <Empty text="No hay publicaciones con ese filtro." />}
      {page.length > 0 && (
        <div className="table-scroll"><table className="sales-history-table ml-board-table">
          <thead><tr><th>Publicación</th><th>Cuenta</th><th>Estado</th><th>Precio</th><th>Vendidas</th><th>Stock</th><th>Visitas 7 d</th><th>Visitas 30 d</th><th>Preguntas</th><th>Clip</th><th>Le falta</th></tr></thead>
          <tbody>
            {page.map((item) => (
              <tr key={item.id}>
                <td>
                  <a className="ml-board-title" href={item.permalink} target="_blank" rel="noreferrer">
                    {item.thumbnail && <img src={item.thumbnail} alt="" width="40" height="40" loading="lazy" />}
                    <span>{item.title}<small className="muted"> · {item.id}</small></span>
                  </a>
                </td>
                <td><AccountTag name={nickname[item.seller_id] || item.seller_id} /></td>
                <td>{statusLabel(item.status)}</td>
                <td>{money(item.price, item.currency)}</td>
                <td>{item.sold_quantity ?? "—"}</td>
                <td>{item.available_quantity ?? "—"}</td>
                <td>{number(item.visits_7d)}</td>
                <td>{number(item.visits_30d)}</td>
                <td>{questionCounts[item.id] || 0}</td>
                <td>{item.status === "active" ? <ClipCell item={item} canEdit={canEdit} onClip={onClip} /> : "—"}</td>
                <td>{issuesOf(item).map((found) => <span key={found.key} className="badge warn">{found.label}</span>)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      {shown.length > page.length && <button type="button" className="secondary" onClick={() => setPageSize((size) => size + PAGE)}>Ver {Math.min(PAGE, shown.length - page.length)} más (de {shown.length})</button>}
    </section>
  </>);
}

export function MercadoLibreBoard({ supabase, session = null, isAdmin = false, canSeeAds = false, ads = {}, onAdsChange = () => {} }) {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState(null);
  const [metricRows, setMetricRows] = useState([]);
  const [questionCounts, setQuestionCounts] = useState({});
  const [error, setError] = useState("");
  // Desde el Centro de mejoras se abre directo en Publicaciones filtradas (o en "Qué mejorar").
  const opened = useMemo(() => { try { const key = sessionStorage.getItem("poliplast-open-ml"); sessionStorage.removeItem("poliplast-open-ml"); return key || ""; } catch { return ""; } }, []);
  const toMejorar = opened === "calidad-ml" || opened === "experiencia-compra";
  const [tab, setTab] = useState(opened ? (toMejorar ? "mejorar" : "publicaciones") : "resumen");
  const [seller, setSeller] = useState("");
  const [issue, setIssue] = useState(opened && !toMejorar ? opened : "");
  const [reload, setReload] = useState(0);

  async function markClip(item, has) {
    const before = item.clips_count;
    setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, clips_count: has ? 1 : 0 } : row)));
    const response = await adminFetch({ action: "mercadolibre", op: "clips", ids: [item.id], has }, session?.access_token).catch(() => null);
    if (!response?.ok) {
      setItems((rows) => rows.map((row) => (row.id === item.id ? { ...row, clips_count: before } : row)));
      setError("No se pudo guardar el clip. Probá de nuevo.");
    }
  }

  useEffect(() => {
    if (!supabase) { setItems([]); return; }
    (async () => {
      try {
        const [names, rows, questions, metrics] = await Promise.all([
          supabase.rpc("ml_account_names"),
          loadAll(() => supabase.from("ml_items").select(COLUMNS).order("id")),
          loadAll(() => supabase.from("ml_questions").select("item_id").order("id")),
          supabase.from("ml_account_metrics").select("seller_id,taken_on,data").order("taken_on", { ascending: false }).limit(60),
        ]);
        setAccounts(names.data || []);
        setItems(rows);
        setQuestionCounts(countQuestions(questions));
        setMetricRows(metrics.data || []);
      } catch {
        setError("No se pudieron cargar los datos de Mercado Libre.");
        setItems([]);
      }
    })();
  }, [supabase, reload]);

  const nickname = useMemo(() => Object.fromEntries(accounts.map((account) => [account.seller_id, account.nickname])), [accounts]);
  const permalinks = useMemo(() => Object.fromEntries((items || []).map((item) => [item.id, item.permalink])), [items]);
  const metricsBySeller = useMemo(() => Object.fromEntries(Object.entries(latestBySeller(metricRows)).map(([key, row]) => [key, row.data])), [metricRows]);

  // 24/10: 8 pestañas eran demasiadas; se agrupan en 4 (Felipe: "organizarlo mejor").
  const tabGroups = [
    ["resumen", "Resumen", ["resumen"]],
    ["publicaciones", "Publicaciones", ["publicaciones", "mejorar"]],
    ["mercado", "Mercado", ["competencia", "tendencias"]],
    ["dinero", "Dinero", ["stock", ...(canSeeAds ? ["publicidad"] : [])]],
  ];
  const currentGroup = tabGroups.find(([, , leaves]) => leaves.includes(tab)) || tabGroups[0];

  function showIssue(key) { setIssue(key); setTab("publicaciones"); }

  return (
    <div className="content-stack ml-board">
      <section className="panel ml-board-head">
        <div className="ml-tabs" role="tablist" aria-label="Sección">
          {tabGroups.map(([key, label, leaves]) => {
            const active = leaves.includes(tab);
            return <button key={key} type="button" role="tab" aria-selected={active} className={active ? "selected" : ""} onClick={() => { if (!active) setTab(leaves[0]); }}>{label}</button>;
          })}
        </div>
        {currentGroup[2].length > 1 && (
          <div className="ml-subtabs" role="tablist" aria-label={currentGroup[1]}>
            {currentGroup[2].map((leaf) => <button key={leaf} type="button" role="tab" aria-selected={tab === leaf} className={tab === leaf ? "selected" : ""} onClick={() => setTab(leaf)}>{LEAF_LABELS[leaf]}</button>)}
          </div>
        )}
        <div className="ml-accounts" role="tablist" aria-label="Cuenta">
          <button type="button" role="tab" aria-selected={seller === ""} className={`ml-account-chip ${seller === "" ? "selected" : ""}`} onClick={() => setSeller("")}>Todas las cuentas</button>
          {accounts.map((account) => {
            const name = account.nickname || String(account.seller_id);
            return <button key={account.seller_id} type="button" role="tab" aria-selected={seller === account.seller_id} className={`ml-account-chip acct-${accountTone(name)} ${seller === account.seller_id ? "selected" : ""}`} onClick={() => setSeller(account.seller_id)}><i aria-hidden="true" />{name}</button>;
          })}
        </div>
      </section>
      {error && <div className="system-message error">{error}</div>}
      <div key={tab} className="ml-pane">
      {tab === "publicidad" && canSeeAds && <MlAds ads={ads} onSave={onAdsChange} accounts={accounts} />}
      {tab === "publicidad" && !canSeeAds && null}
      {tab !== "publicidad" && items === null && <div className="ml-skeleton" role="status" aria-label="Cargando Mercado Libre"><i /><i /><i /><i /></div>}
      {tab !== "publicidad" && items && items.length === 0 && !error && <Empty text={supabase ? "Todavía no hay datos: conectá las cuentas en Más → Datos → Mercado Libre." : "Mercado Libre está en la versión en línea."} />}
      {items && items.length > 0 && tab === "resumen" && (
        <Summary accounts={accounts} metricsBySeller={metricsBySeller} seller={seller} items={items} nickname={nickname} permalinks={permalinks} onIssue={showIssue} isAdmin={isAdmin} session={session} supabase={supabase} onReload={() => setReload((value) => value + 1)} />
      )}
      {items && items.length > 0 && tab === "mejorar" && <MlImprove supabase={supabase} items={items} seller={seller} nickname={nickname} />}
      {items && items.length > 0 && tab === "stock" && <MlEconomics supabase={supabase} session={session} isAdmin={isAdmin} items={items} seller={seller} nickname={nickname} />}
      {items && items.length > 0 && tab === "competencia" && <MlCompetition supabase={supabase} session={session} isAdmin={isAdmin} items={items} nickname={nickname} />}
      {items && items.length > 0 && tab === "tendencias" && <MlTrends supabase={supabase} session={session} isAdmin={isAdmin} items={items} />}
      {items && items.length > 0 && tab === "publicaciones" && (
        <Listings items={items} accounts={accounts} nickname={nickname} questionCounts={questionCounts} seller={seller} issue={issue} setIssue={setIssue} canEdit={isAdmin && Boolean(session)} onClip={markClip} />
      )}
      </div>
    </div>
  );
}
