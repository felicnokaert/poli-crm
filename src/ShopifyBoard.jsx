import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Layers, PackageCheck, RefreshCw, ShoppingBag, TriangleAlert, Wallet } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { SHOPIFY_ISSUES, SHOPIFY_SORTS, SHOPIFY_STATUS, boardRows, facets, filterRows, issueLabel, periodTotals, productsCsv, statusLabel, summarize } from "./shopify-board.mjs";
import { canSee } from "./module-access.mjs";
import { Empty } from "./ui-primitives";
import { groupProposals, proposalsCsv } from "./shopify-grouping.mjs";

// Ventas → Shopify (24/10, etapas 1 y 2): espejo de SOLO LECTURA de la tienda. Resumen, "Qué mejorar" (lo que le falta a cada
// producto) y Productos. No cambia nada en Shopify; las propuestas de precios y de variantes vienen en otras etapas.
const money = (value) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }) : "—");
const number = (value) => (typeof value === "number" ? value.toLocaleString("es-AR") : "—");
const argentinaToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");
const MISSING = /shopify_|does not exist|schema cache/i;
const TABS = [["resumen", "Resumen"], ["mejorar", "Qué mejorar"], ["productos", "Productos"], ["ordenar", "Ordenar catálogo"]];

async function readAll(query) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

function downloadCsv(rows) {
  const url = URL.createObjectURL(new Blob([productsCsv(rows)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `shopify-productos-${argentinaToday()}.csv`;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

async function callShopify(body, session) {
  const response = await adminFetch({ action: "shopify", ...body }, session?.access_token);
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error || `Error ${response.status}`);
  return json;
}

function useShopifyData(supabase, reload) {
  const [state, setState] = useState({ status: "loading", products: [], variants: [], days: [] });
  useEffect(() => {
    if (!supabase?.from) { setState({ status: "offline", products: [], variants: [], days: [] }); return undefined; }
    let alive = true;
    Promise.all([
      readAll(() => supabase.from("shopify_products").select("*").order("id")),
      readAll(() => supabase.from("shopify_variants").select("*").order("id")),
      readAll(() => supabase.from("shopify_daily").select("day,orders,amount,currency,synced_at").order("day")),
    ])
      .then(([products, variants, days]) => { if (alive) setState({ status: "ready", products, variants, days }); })
      .catch((error) => { if (alive) setState({ status: MISSING.test(String(error?.message || "")) ? "missing" : "error", products: [], variants: [], days: [] }); });
    return () => { alive = false; };
  }, [supabase, reload]);
  return state;
}

function Trend({ value }) {
  if (typeof value !== "number") return <small className="muted">sin comparación</small>;
  return <small className={`ml-trend ${value >= 0 ? "up" : "down"}`}>{`${value >= 0 ? "+" : ""}${(value * 100).toLocaleString("es-AR", { maximumFractionDigits: 0 })} % vs. período anterior`}</small>;
}

function Setup({ status, isAdmin }) {
  return (
    <section className="panel shopify-setup">
      <span className="eyebrow">Falta un paso</span>
      <h2>Conectar Shopify</h2>
      <p className="muted">{status === "missing" ? "Falta crear las tablas: pegar el SQL de supabase/migrations/20261024_shopify.sql en Supabase (SQL Editor → Run)." : "Todavía no hay datos de la tienda."}</p>
      {isAdmin && (
        <ol className="shopify-steps">
          <li>La app de solo lectura ya está creada en el Dev Dashboard de Shopify (con <code>read_products</code>, <code>read_inventory</code> y <code>read_orders</code>) e instalada en la tienda.</li>
          <li>En el Dev Dashboard → tu app → Resumen → tarjeta “Credenciales”: copiá el <strong>ID de cliente</strong> y el <strong>Secreto del cliente</strong>.</li>
          <li>En Vercel (Settings → Environment Variables, Production) cargá <code>SHOPIFY_STORE_DOMAIN</code> (<code>poliplastarg.myshopify.com</code>), <code>SHOPIFY_CLIENT_ID</code> y <code>SHOPIFY_CLIENT_SECRET</code>. El secreto va solo ahí: no lo pegues en un chat ni en una página.</li>
          <li>Volvé a publicar la app (Redeploy) para que tome las variables y tocá “Actualizar ahora”. El CRM canjea esas credenciales por un token de 24 horas y lo renueva solo.</li>
        </ol>
      )}
    </section>
  );
}

function Issues({ rows, onPick }) {
  const stats = useMemo(() => summarize(rows), [rows]);
  return (
    <section className="panel">
      <div className="panel-head"><div><span className="eyebrow">Recomendaciones · nada se cambia solo</span><h2>Qué mejorar en la tienda</h2></div></div>
      <ul className="ml-alerts">
        {SHOPIFY_ISSUES.map(([key, label, why]) => (
          <li key={key} className={stats.issueCounts[key] > 0 && ["sin_descripcion", "stock_cero", "sin_foto", "sku_repetido", "precio_cero"].includes(key) ? "is-urgent" : ""}>
            <TriangleAlert size={16} />
            <span><strong>{stats.issueCounts[key]} {stats.issueCounts[key] === 1 ? "producto" : "productos"} · {label}</strong><small className="muted"> · {why}</small></span>
            {stats.issueCounts[key] > 0 && <button type="button" className="secondary" onClick={() => onPick(key)}>Ver cuáles</button>}
          </li>
        ))}
      </ul>
      <p className="muted small">Se cuentan los productos activos, en borrador y no listados (no los archivados).</p>
    </section>
  );
}

function Products({ rows, issue, setIssue }) {
  const [status, setStatus] = useState("ACTIVE");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("titulo");
  const [vendor, setVendor] = useState("");
  const [type, setType] = useState("");
  const [stock, setStock] = useState("");
  const options = useMemo(() => facets(rows), [rows]);
  const shown = useMemo(() => filterRows(rows, { status, issue, query, sort, vendor, type, stock }), [rows, status, issue, query, sort, vendor, type, stock]);
  return (
    <section className="panel">
      <div className="panel-head">
        <div><span className="eyebrow">{shown.length} de {rows.length} productos</span><h2>Productos</h2></div>
        <label className="ml-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, marca o SKU…" aria-label="Buscar producto" /></label>
      </div>
      <div className="ml-tabs ml-filter-tabs" role="tablist" aria-label="Estado">
        {[["", "Todos"], ...Object.entries(SHOPIFY_STATUS).map(([key, [label]]) => [key, label])].map(([key, label]) => (
          <button key={key || "todos"} type="button" role="tab" aria-selected={status === key} className={status === key ? "selected" : ""} onClick={() => setStatus(key)}>{label} ({key ? rows.filter((row) => row.product.status === key).length : rows.length})</button>
        ))}
      </div>
      <div className="ml-toolbar">
        <label className="small">Problema <select value={issue} onChange={(event) => setIssue(event.target.value)}><option value="">Todos</option>{SHOPIFY_ISSUES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label className="small">Marca <select value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">Todas</option>{options.vendors.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="small">Tipo <select value={type} onChange={(event) => setType(event.target.value)}><option value="">Todos</option>{options.types.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
        <label className="small">Stock <select value={stock} onChange={(event) => setStock(event.target.value)}><option value="">Todo</option><option value="cero">En 0</option><option value="con">Con stock</option></select></label>
        <label className="small ml-sort">Ordenar por <select value={sort} onChange={(event) => setSort(event.target.value)}>{SHOPIFY_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
      {shown.length > 0 && <div className="panel-head-actions"><button type="button" className="secondary" onClick={() => downloadCsv(shown)}>Descargar CSV ({shown.length})</button></div>}
      {shown.length === 0 ? <p className="muted">No hay productos con ese filtro.</p> : (
        <div className="table-scroll"><table className="sales-history-table ml-board-table">
          <thead><tr><th>Producto</th><th>Estado</th><th>Variantes</th><th>Precio</th><th>Stock</th><th>Le falta</th></tr></thead>
          <tbody>{shown.slice(0, 300).map((row) => {
            const [label, tone] = SHOPIFY_STATUS[row.product.status] || [statusLabel(row.product.status), ""];
            return (
              <tr key={row.product.id}>
                <td><div className="ml-board-title">{row.product.image_url ? <img src={row.product.image_url} alt="" width="40" height="40" loading="lazy" /> : <span className="shopify-noimg" aria-hidden="true" />}<span>{row.product.online_url ? <a href={row.product.online_url} target="_blank" rel="noreferrer">{row.product.title} <ExternalLink size={11} /></a> : row.product.title}<small className="muted"> {[row.product.vendor, row.product.product_type].filter(Boolean).join(" · ")}</small></span></div></td>
                <td data-label="Estado"><span className={`badge ${tone}`}>{label}</span></td>
                <td data-label="Variantes">{row.variants.length}{row.variants.length > 1 ? <small className="muted"> ({[...new Set(row.variants.flatMap((variant) => variant.options.map((option) => option.name)))].filter((name) => name !== "Title").join(" · ") || "—"})</small> : null}</td>
                <td data-label="Precio">{row.minPrice == null ? "—" : row.minPrice === row.maxPrice ? money(row.minPrice) : `${money(row.minPrice)} – ${money(row.maxPrice)}`}</td>
                <td data-label="Stock">{number(row.product.total_inventory)}</td>
                <td data-label="Le falta">{row.issues.length === 0 ? <span className="muted small">—</span> : row.issues.map((key) => <span key={key} className="badge warn" title={issueLabel(key)}>{issueLabel(key)}</span>)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      {shown.length > 300 && <p className="muted small">Se muestran los primeros 300; usá el buscador o los filtros.</p>}
    </section>
  );
}


function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

function Organize({ products, variants }) {
  const proposals = useMemo(() => groupProposals(products, variants), [products, variants]);
  const [open, setOpen] = useState("");
  if (proposals.length === 0) return <Empty title="Nada para agrupar" text="No hay productos que parezcan el mismo con distinto tamaño, color o presentación." />;
  const saved = proposals.reduce((total, item) => total + item.products.length - 1, 0);
  return (
    <div className="stack">
      <p className="muted small">Propuesta de solo lectura: {proposals.length} grupos que juntarían {proposals.reduce((total, item) => total + item.products.length, 0)} productos en {proposals.length} (quedan {saved} menos). No se cambia nada en la tienda: escribir en Shopify necesita tu aprobación y otro permiso. Revisá cada grupo: si dos productos distintos quedaron juntos, es un error de la propuesta.</p>
      <button type="button" className="ghost" onClick={() => downloadText(`shopify-agrupar-${argentinaToday()}.csv`, proposalsCsv(proposals))}>Descargar propuesta (CSV)</button>
      {proposals.map((item) => (
        <section key={item.key} className="panel">
          <button type="button" className="ghost" aria-expanded={open === item.key} onClick={() => setOpen(open === item.key ? "" : item.key)}>
            <strong>{item.name}</strong> · {item.products.length} productos → 1 · {item.variants.length} variantes · {item.options.map((option) => option.name).join(" / ") || "sin opciones"}
            {item.warnings.length > 0 && <span> · <TriangleAlert size={14} aria-hidden="true" /> {item.warnings.length}</span>}
          </button>
          {open === item.key && (
            <div>
              {item.warnings.map((warning) => <p key={warning} className="muted small">⚠ {warning}</p>)}
              <p className="muted small">Quedaría como base: {item.survivor.title}</p>
              <ul>{item.variants.map((variant, index) => <li key={index}>{item.options.map((option) => variant.optionValues[option.name]).join(" / ")} — {variant.from.member.product.title}</li>)}</ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

export function ShopifyBoard({ supabase, session, isAdmin, hiddenTabs = null, email = "" }) {
  // Desde el Centro de mejoras se abre directo en Productos con el problema elegido.
  const opened = useMemo(() => { try { const key = sessionStorage.getItem("poliplast-open-shopify"); sessionStorage.removeItem("poliplast-open-shopify"); return key || ""; } catch { return ""; } }, []);
  const [pickedTab, setTab] = useState(opened ? "productos" : "resumen");
  const allowedTabs = TABS.filter(([key]) => canSee(email, hiddenTabs, "shopify", key));
  const tab = allowedTabs.some(([key]) => key === pickedTab) ? pickedTab : allowedTabs[0]?.[0] || "";
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState(opened);
  const data = useShopifyData(supabase, reload);
  const rows = useMemo(() => boardRows(data.products, data.variants), [data.products, data.variants]);
  const stats = useMemo(() => summarize(rows), [rows]);
  const today = argentinaToday();
  const week = useMemo(() => periodTotals(data.days, 7, today), [data.days, today]);
  const month = useMemo(() => periodTotals(data.days, 30, today), [data.days, today]);
  const syncedAt = data.products.map((product) => product.synced_at).sort().at(-1);

  async function sync() {
    setBusy(true); setMessage("");
    try {
      const result = await callShopify({ op: "sync" }, session);
      setMessage(`Listo: ${result.products} productos, ${result.variants} variantes y ${result.orders} pedidos de 30 días.${result.errors?.length ? ` Aviso: ${result.errors.join(" · ")}` : ""}`);
      setReload((value) => value + 1);
    } catch (error) { setMessage(error.message); }
    setBusy(false);
  }

  function pick(key) { setIssue(key); setTab("productos"); }

  return (
    <div className="content-stack ml-board shopify-board">
      <section className="panel ml-board-head">
        <div className="ml-tabs" role="tablist" aria-label="Sección">
          {allowedTabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? "selected" : ""} onClick={() => setTab(key)}>{label}</button>)}
        </div>
        <div className="ml-toolbar">
          <span className="muted small">{data.status === "ready" ? `Última actualización: ${when(syncedAt)} · se actualiza solo cada mañana` : "Tienda Shopify, solo lectura"}</span>
          {isAdmin && <button type="button" className="secondary" disabled={busy} onClick={sync}><RefreshCw size={14} /> {busy ? "Actualizando…" : "Actualizar ahora"}</button>}
        </div>
        {message && <p className="muted small" role="status">{message}</p>}
      </section>
      <div key={tab} className="ml-pane">
        {data.status === "loading" && <div className="ml-skeleton" role="status" aria-label="Cargando Shopify"><i /><i /><i /><i /></div>}
        {data.status === "error" && <Empty text="No se pudieron leer los datos de Shopify." />}
        {data.status === "offline" && <Empty text="Shopify está en la versión en línea." />}
        {(data.status === "missing" || (data.status === "ready" && data.products.length === 0)) && <Setup status={data.status} isAdmin={isAdmin} />}
        {data.status === "ready" && data.products.length > 0 && tab === "resumen" && (
          <>
            <section className="metric-grid ml-metric-grid">
              <article className="metric-card"><PackageCheck size={20} /><span>Productos activos</span><strong>{number(stats.active)}</strong><small className="muted">{number(stats.draft)} {stats.draft === 1 ? "borrador" : "borradores"} · {number(stats.other)} {stats.other === 1 ? "otro" : "otros"}</small></article>
              <article className="metric-card"><Layers size={20} /><span>Variantes</span><strong>{number(stats.variants)}</strong><small className="muted">{stats.total ? (stats.variants / stats.total).toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"} por producto</small></article>
              <article className={`metric-card ${stats.withIssues ? "is-urgent" : ""}`}><TriangleAlert size={20} /><span>Con algo para mejorar</span><strong>{number(stats.withIssues)}</strong><small className="muted">de {number(stats.total)} productos</small></article>
              <article className="metric-card"><ShoppingBag size={20} /><span>Pedidos (7 días)</span><strong>{number(week.current.orders)}</strong><Trend value={week.ordersChange} /></article>
              <article className="metric-card"><Wallet size={20} /><span>Facturado (7 días)</span><strong>{money(week.current.amount)}</strong><Trend value={week.amountChange} /></article>
            </section>
            {data.days.length === 0 && <p className="muted small">Todavía no hay pedidos guardados: si la llave no tiene el permiso <code>read_orders</code>, aparecen en cero.</p>}
            <p className="muted small">Últimos 30 días: {number(month.current.orders)} pedidos · {money(month.current.amount)} (pedidos no cancelados, con IVA incluido tal cual los cobra Shopify).</p>
            <Issues rows={rows} onPick={pick} />
          </>
        )}
        {data.status === "ready" && data.products.length > 0 && tab === "mejorar" && <Issues rows={rows} onPick={pick} />}
        {data.status === "ready" && data.products.length > 0 && tab === "productos" && <Products rows={rows} issue={issue} setIssue={setIssue} />}
        {data.status === "ready" && data.products.length > 0 && tab === "ordenar" && <Organize products={data.products} variants={data.variants} />}
      </div>
    </div>
  );
}
