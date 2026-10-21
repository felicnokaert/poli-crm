import { useEffect, useMemo, useState } from "react";
import { CircleAlert, Eye, MessageCircleQuestion, PauseCircle, Percent, PlayCircle, RefreshCw, Search, ShoppingBag, Store, Video, Wallet } from "lucide-react";
import { ML_ISSUES, ML_STATUS, countQuestions, filterBoard, issuesOf, statusLabel, summarizeBoard } from "./ml-board.mjs";
import { MEDAL, REPUTATION, buildAlerts, combineMetrics, latestBySeller } from "./ml-summary.mjs";
import { Empty } from "./ui-primitives";

// Ventas → Mercado Libre (21/10): Resumen (como el de Mercado Libre: ventas, visitas, conversión, preguntas,
// reputación y qué atender) y Publicaciones de las 3 cuentas. Solo muestra lo que se trajo de Mercado Libre
// (actualización diaria y Más → Datos → Mercado Libre); no cambia nada allá.
const PAGE = 100;
const COLUMNS = "id,seller_id,title,permalink,status,price,currency,sold_quantity,available_quantity,video_id,pictures_count,health,thumbnail,description_length,item_updated_at";
const money = (value, currency) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }) : "—");
const number = (value) => (typeof value === "number" ? value.toLocaleString("es-AR") : "—");
const percent = (value) => (typeof value === "number" ? `${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} %` : "—");
const fmt = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");

async function loadAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function SalesChart({ days = [], currency }) {
  if (!days.length) return null;
  const W = 600;
  const H = 140;
  const max = Math.max(1, ...days.map((day) => day.amount));
  const width = W / days.length;
  return (
    <svg className="sales-chart ml-chart" viewBox={`0 0 ${W} ${H + 18}`} role="img" aria-label="Ventas por día, últimos 30 días">
      {days.map((day, index) => {
        const height = Math.round((day.amount / max) * H);
        return (
          <g key={day.day}>
            <title>{`${day.day.slice(8, 10)}/${day.day.slice(5, 7)}: ${money(day.amount, currency)} · ${day.orders} venta${day.orders === 1 ? "" : "s"}${typeof day.visits === "number" ? ` · ${day.visits} visitas` : ""}`}</title>
            <rect x={index * width + 2} y={H - height} width={Math.max(2, width - 4)} height={Math.max(height, day.amount ? 2 : 0)} rx="2" className="ml-chart-bar" />
            {index % 5 === 0 && <text x={index * width + width / 2} y={H + 14} textAnchor="middle" className="ml-chart-label">{`${day.day.slice(8, 10)}/${day.day.slice(5, 7)}`}</text>}
          </g>
        );
      })}
    </svg>
  );
}

function Summary({ accounts, metricsBySeller, seller, items, nickname, permalinks, onIssue, isAdmin, session, onReload }) {
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const chosen = seller ? { [seller]: metricsBySeller[seller] } : metricsBySeller;
  const data = combineMetrics(Object.values(chosen).filter(Boolean));
  const alerts = buildAlerts({ metricsBySeller: chosen, items: items.filter((item) => !seller || item.seller_id === seller), nickname });
  const currency = data?.sales?.currency || "ARS";

  async function refresh() {
    setError("");
    for (const account of accounts) {
      setBusy(account.nickname || account.seller_id);
      try {
        const response = await fetch("/api/admin-users", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ action: "mercadolibre", op: "metrics", sellerId: account.seller_id }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) throw new Error(result.error || "No se pudo actualizar el resumen.");
      } catch (refreshError) { setError(`${account.nickname}: ${refreshError.message}`); }
    }
    setBusy("");
    onReload();
  }

  return (
    <>
      {isAdmin && (
        <div className="panel-head-actions">
          <button type="button" className="secondary" disabled={Boolean(busy)} onClick={refresh}><RefreshCw size={14} /> {busy ? `Actualizando ${busy}…` : "Actualizar resumen"}</button>
        </div>
      )}
      {error && <div className="system-message error">{error}</div>}
      {!data && <Empty text="Todavía no hay resumen. Se arma solo todos los días a la mañana (o Felipe toca “Actualizar resumen”)." />}
      {data && (<>
        <section className="metric-grid ml-metric-grid">
          <article className="metric-card"><Wallet size={20} /><span>Facturado (30 días)</span><strong>{money(data.sales?.amount, currency)}</strong></article>
          <article className="metric-card"><ShoppingBag size={20} /><span>Ventas</span><strong>{number(data.sales?.orders)}</strong><small>{number(data.sales?.units)} unidades{data.sales?.cancelled ? ` · ${data.sales.cancelled} canceladas` : ""}</small></article>
          <article className="metric-card"><Eye size={20} /><span>Visitas</span><strong>{number(data.visits)}</strong></article>
          <article className="metric-card"><Percent size={20} /><span>Conversión</span><strong>{percent(data.conversion)}</strong><small>ventas / visitas</small></article>
          <article className={`metric-card ${data.questionsPending ? "is-urgent" : ""}`}><MessageCircleQuestion size={20} /><span>Preguntas sin responder</span><strong>{number(data.questionsPending)}</strong></article>
        </section>

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Últimos 30 días</span><h2>Ventas por día</h2></div></div>
          <SalesChart days={data.days} currency={currency} />
          {data.partial && <p className="muted small">A alguna cuenta le falta un dato: el total puede quedar corto.</p>}
        </section>

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Recomendaciones · nada se cambia solo</span><h2>Para atender</h2></div></div>
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

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Reputación</span><h2>Cómo está cada cuenta</h2></div></div>
          <div className="table-scroll"><table className="sales-history-table">
            <thead><tr><th>Cuenta</th><th>Color</th><th>Medalla</th><th>Reclamos</th><th>Demoras</th><th>Cancelaciones</th><th>Resumen del</th></tr></thead>
            <tbody>
              {accounts.filter((account) => !seller || account.seller_id === seller).map((account) => {
                const own = metricsBySeller[account.seller_id];
                const reputation = own?.reputation;
                const [label, tone] = REPUTATION[reputation?.level] || ["—", ""];
                return (
                  <tr key={account.seller_id}>
                    <td><strong>{account.nickname}</strong></td>
                    <td>{tone ? <span className={`badge ${tone}`}>{label}</span> : label}</td>
                    <td>{MEDAL[reputation?.medal] || "—"}</td>
                    <td>{percent(reputation?.claims)}</td>
                    <td>{percent(reputation?.delayed)}</td>
                    <td>{percent(reputation?.cancellations)}</td>
                    <td>{fmt(own?.to)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>

        <section className="panel">
          <div className="panel-head"><div><span className="eyebrow">Últimos 30 días</span><h2>Lo más vendido</h2></div></div>
          {!data.topItems?.length && <p className="muted">Sin ventas en el período (o no se pudieron leer).</p>}
          {data.topItems?.length > 0 && (
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
          )}
        </section>
        {data.errors?.length > 0 && <p className="muted small">No se pudo leer: {data.errors.join(" · ")}</p>}
      </>)}
    </>
  );
}

function Listings({ items, accounts, nickname, questionCounts, seller, issue, setIssue }) {
  const [status, setStatus] = useState("active");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE);
  useEffect(() => setPageSize(PAGE), [seller, status, issue, query]);
  const ofSeller = useMemo(() => items.filter((item) => !seller || item.seller_id === seller), [items, seller]);
  const summary = useMemo(() => summarizeBoard(ofSeller), [ofSeller]);
  const shown = useMemo(() => filterBoard(items, { seller, status, issue, query }, questionCounts), [items, seller, status, issue, query, questionCounts]);
  const page = shown.slice(0, pageSize);
  const lastUpdate = accounts.map((account) => account.last_refresh_at || account.last_sync_at).filter(Boolean).sort().at(-1);

  return (<>
    <section className="metric-grid">
      <article className="metric-card"><Store size={20} /><span>Publicaciones</span><strong>{summary.total}</strong></article>
      <article className="metric-card"><PlayCircle size={20} /><span>Activas</span><strong>{summary.byStatus.active || 0}</strong></article>
      <article className="metric-card"><PauseCircle size={20} /><span>Pausadas</span><strong>{summary.byStatus.paused || 0}</strong></article>
      <article className="metric-card"><CircleAlert size={20} /><span>Cerradas</span><strong>{summary.byStatus.closed || 0}</strong></article>
      <article className="metric-card"><Video size={20} /><span>Activas sin video</span><strong>{summary.issues["sin-video"]}</strong></article>
    </section>

    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Actualizado {fmt(lastUpdate)}</span>
          <h2>Publicaciones</h2>
          <p>Estado de cada publicación y lo que le falta. Solo mira: no cambia nada en Mercado Libre.</p>
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
      <p className="muted small">Los números de "qué les falta" cuentan solo las activas.{summary.missingDetail ? ` ${summary.missingDetail} publicaciones todavía no tienen video, fotos ni calidad: se completan con la próxima actualización.` : ""}</p>

      {items.length > 0 && shown.length === 0 && <Empty text="No hay publicaciones con ese filtro." />}
      {page.length > 0 && (
        <div className="table-scroll"><table className="sales-history-table ml-board-table">
          <thead><tr><th>Publicación</th><th>Cuenta</th><th>Estado</th><th>Precio</th><th>Vendidas</th><th>Stock</th><th>Preguntas</th><th>Le falta</th></tr></thead>
          <tbody>
            {page.map((item) => (
              <tr key={item.id}>
                <td>
                  <a className="ml-board-title" href={item.permalink} target="_blank" rel="noreferrer">
                    {item.thumbnail && <img src={item.thumbnail} alt="" width="40" height="40" loading="lazy" />}
                    <span>{item.title}<small className="muted"> · {item.id}</small></span>
                  </a>
                </td>
                <td>{nickname[item.seller_id] || item.seller_id}</td>
                <td>{statusLabel(item.status)}</td>
                <td>{money(item.price, item.currency)}</td>
                <td>{item.sold_quantity ?? "—"}</td>
                <td>{item.available_quantity ?? "—"}</td>
                <td>{questionCounts[item.id] || 0}</td>
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

export function MercadoLibreBoard({ supabase, session = null, isAdmin = false }) {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState(null);
  const [metricRows, setMetricRows] = useState([]);
  const [questionCounts, setQuestionCounts] = useState({});
  const [error, setError] = useState("");
  const [tab, setTab] = useState("resumen");
  const [seller, setSeller] = useState("");
  const [issue, setIssue] = useState("");
  const [reload, setReload] = useState(0);

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

  function showIssue(key) { setIssue(key); setTab("publicaciones"); }

  return (
    <div className="content-stack ml-board">
      <section className="panel ml-board-head">
        <div className="segmented" role="tablist" aria-label="Sección">
          {[["resumen", "Resumen"], ["publicaciones", "Publicaciones"]].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
        </div>
        <div className="segmented" role="tablist" aria-label="Cuenta">
          {[["", "Todas las cuentas"], ...accounts.map((account) => [account.seller_id, account.nickname || account.seller_id])].map(([key, label]) => (
            <button key={key || "todas"} type="button" role="tab" aria-selected={seller === key} className={seller === key ? "selected" : ""} onClick={() => setSeller(key)}>{label}</button>
          ))}
        </div>
      </section>
      {error && <div className="system-message error">{error}</div>}
      {items === null && <p className="muted">Cargando…</p>}
      {items && items.length === 0 && !error && <Empty text={supabase ? "Todavía no hay datos: conectá las cuentas en Más → Datos → Mercado Libre." : "Mercado Libre está en la versión en línea."} />}
      {items && items.length > 0 && tab === "resumen" && (
        <Summary accounts={accounts} metricsBySeller={metricsBySeller} seller={seller} items={items} nickname={nickname} permalinks={permalinks} onIssue={showIssue} isAdmin={isAdmin} session={session} onReload={() => setReload((value) => value + 1)} />
      )}
      {items && items.length > 0 && tab === "publicaciones" && (
        <Listings items={items} accounts={accounts} nickname={nickname} questionCounts={questionCounts} seller={seller} issue={issue} setIssue={setIssue} />
      )}
    </div>
  );
}
