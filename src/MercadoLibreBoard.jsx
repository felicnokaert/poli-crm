import { useEffect, useMemo, useState } from "react";
import { CircleAlert, PauseCircle, PlayCircle, Search, Store, Video } from "lucide-react";
import { ML_ISSUES, ML_STATUS, countQuestions, filterBoard, issuesOf, statusLabel, summarizeBoard } from "./ml-board.mjs";
import { Empty } from "./ui-primitives";

// Ventas → Mercado Libre (21/10): las publicaciones de las 3 cuentas en un solo lugar. Solo muestra lo que
// se trajo de Mercado Libre (Más → Datos → Mercado Libre y la actualización diaria); no cambia nada allá.
const PAGE = 100;
const COLUMNS = "id,seller_id,title,permalink,status,price,currency,sold_quantity,available_quantity,video_id,pictures_count,health,thumbnail,description_length,item_updated_at";
const money = (value, currency) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: currency || "ARS", maximumFractionDigits: 0 }) : "—");
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

export function MercadoLibreBoard({ supabase }) {
  const [accounts, setAccounts] = useState([]);
  const [items, setItems] = useState(null);
  const [questionCounts, setQuestionCounts] = useState({});
  const [error, setError] = useState("");
  const [seller, setSeller] = useState("");
  const [status, setStatus] = useState("active");
  const [issue, setIssue] = useState("");
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState(PAGE);

  useEffect(() => {
    if (!supabase) { setItems([]); return; }
    (async () => {
      try {
        const [names, rows, questions] = await Promise.all([
          supabase.rpc("ml_account_names"),
          loadAll(() => supabase.from("ml_items").select(COLUMNS).order("id")),
          loadAll(() => supabase.from("ml_questions").select("item_id").order("id")),
        ]);
        setAccounts(names.data || []);
        setItems(rows);
        setQuestionCounts(countQuestions(questions));
      } catch {
        setError("No se pudieron cargar las publicaciones.");
        setItems([]);
      }
    })();
  }, [supabase]);

  useEffect(() => setPageSize(PAGE), [seller, status, issue, query]);

  const nickname = useMemo(() => Object.fromEntries(accounts.map((account) => [account.seller_id, account.nickname])), [accounts]);
  const ofSeller = useMemo(() => (items || []).filter((item) => !seller || item.seller_id === seller), [items, seller]);
  const summary = useMemo(() => summarizeBoard(ofSeller), [ofSeller]);
  const shown = useMemo(() => filterBoard(items || [], { seller, status, issue, query }, questionCounts), [items, seller, status, issue, query, questionCounts]);
  const page = shown.slice(0, pageSize);
  const lastUpdate = accounts.map((account) => account.last_refresh_at || account.last_sync_at).filter(Boolean).sort().at(-1);

  return (
    <div className="content-stack ml-board">
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
            <span className="eyebrow">Las 3 cuentas · actualizado {fmt(lastUpdate)}</span>
            <h2>Publicaciones de Mercado Libre</h2>
            <p>Estado de cada publicación y lo que le falta. Se actualiza solo todos los días; solo mira, no cambia nada en Mercado Libre.</p>
          </div>
          <label className="search"><Search size={17} /><input aria-label="Buscar publicación" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej.: espuma, MLA123…" /></label>
        </div>

        <div className="segmented" role="tablist" aria-label="Cuenta">
          {[["", "Todas las cuentas"], ...accounts.map((account) => [account.seller_id, account.nickname || account.seller_id])].map(([key, label]) => (
            <button key={key || "todas"} type="button" role="tab" aria-selected={seller === key} className={seller === key ? "selected" : ""} onClick={() => setSeller(key)}>{label}</button>
          ))}
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

        {error && <div className="system-message error">{error}</div>}
        {items === null && <p className="muted">Cargando…</p>}
        {items && items.length === 0 && !error && <Empty text={supabase ? "Todavía no hay publicaciones: conectá las cuentas en Más → Datos → Mercado Libre." : "El tablero está en la versión en línea."} />}
        {items && items.length > 0 && shown.length === 0 && <Empty text="No hay publicaciones con ese filtro." />}

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
    </div>
  );
}
