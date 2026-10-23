import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Layers, PackageCheck, RefreshCw, ShoppingBag, TriangleAlert, Truck, Wallet } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { SHOPIFY_ISSUES, SHOPIFY_SORTS, SHOPIFY_STATUS, boardRows, facets, filterRows, issueLabel, dailySeries, periodTotals, productsCsv, statusLabel, summarize } from "./shopify-board.mjs";
import { canSee } from "./module-access.mjs";
import { Empty } from "./ui-primitives";
import { groupProposals, proposalSpec, proposalsCsv } from "./shopify-grouping.mjs";
import { DailyChart } from "./DailyChart.jsx";
import { skuCleanup, skuCleanupCsv } from "./ml-sku-cleanup.mjs";
import { DraftButton } from "./ShopifyDrafts.jsx";
import { filterMissing, draftSpecs, missingFromShopify, missingReviewCsv, shopifyImportCsv } from "./shopify-missing.mjs";
import { PRICE_STATES, DISCOUNT, filterPriceRows, priceCross, priceProposalCsv, priceSummary } from "./shopify-prices.mjs";
import { PICKUP_LIMIT_DAYS, SHIP_LIMIT_HOURS, operationSummary, pendingOrders, recoverList, weeklyFunnel } from "./shopify-operation.mjs";

// Ventas → Shopify (24/10, etapas 1 y 2): espejo de SOLO LECTURA de la tienda. Resumen, "Qué mejorar" (lo que le falta a cada
// producto) y Productos. No cambia nada en Shopify; las propuestas de precios y de variantes vienen en otras etapas.
const money = (value) => (typeof value === "number" ? value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }) : "—");
const number = (value) => (typeof value === "number" ? value.toLocaleString("es-AR") : "—");
const argentinaToday = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "nunca");
const MISSING = /shopify_|does not exist|schema cache/i;
const TABS = [["resumen", "Resumen"], ["mejorar", "Qué mejorar"], ["productos", "Productos"], ["precios", "Precios vs ML"], ["faltan", "Faltan en Shopify"], ["operacion", "Operación"], ["ordenar", "Ordenar catálogo"]];

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
  const [state, setState] = useState({ status: "loading", products: [], variants: [], days: [], orders: [], checkouts: [] });
  useEffect(() => {
    if (!supabase?.from) { setState({ status: "offline", products: [], variants: [], days: [] }); return undefined; }
    let alive = true;
    // Pedidos y carritos son opcionales: si la tabla todavía no existe, el resto del panel funciona igual.
    const optional = (promise) => Promise.resolve(promise).catch(() => []);
    Promise.all([
      readAll(() => supabase.from("shopify_products").select("*").order("id")),
      readAll(() => supabase.from("shopify_variants").select("*").order("id")),
      readAll(() => supabase.from("shopify_daily").select("day,orders,amount,currency,synced_at").order("day")),
      optional(readAll(() => supabase.from("shopify_orders").select("*").order("id"))),
      optional(readAll(() => supabase.from("shopify_checkouts").select("*").order("id"))),
      optional(readAll(() => supabase.from("ml_items").select("id,sku,price,status,sold_quantity,title,permalink").order("id"))),
    ])
      .then(([products, variants, days, orders, checkouts, mlItems]) => { if (alive) setState({ status: "ready", products, variants, days, orders, checkouts, mlItems }); })
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
      <p className="muted small">Se cuentan solo los productos activos (los borradores y archivados no entran). \"Activo con stock 0\" no cuenta los que siguen vendiendo sin stock.</p>
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

function Organize({ products, variants, session }) {
  const proposals = useMemo(() => groupProposals(products, variants), [products, variants]);
  const [open, setOpen] = useState("");
  if (proposals.length === 0) return <Empty title="Nada para agrupar" text="No hay productos que parezcan el mismo con distinto tamaño, color o presentación." />;
  const saved = proposals.reduce((total, item) => total + item.products.length - 1, 0);
  return (
    <div className="stack">
      <p className="muted small">Propuesta: {proposals.length} grupos que juntarían {proposals.reduce((total, item) => total + item.products.length, 0)} productos en {proposals.length} (quedan {saved} menos). Nada se cambia solo: cada grupo tiene un botón que lo crea como BORRADOR (sin tocar los originales; necesita el permiso write_products de la app). Revisá cada grupo: si dos productos distintos quedaron juntos, es un error de la propuesta.</p>
      <p className="muted small"><strong>Orden para ejecutar:</strong> 1) corregir los SKU repetidos, 2) fusionar un grupo por vez (el stock 999 es a propósito: se mantiene), 3) crear redirecciones 301 de los productos que desaparecen y revisar qué links de Mercado Libre o Instagram apuntaban a ellos. Si hay más de 3 opciones, la propuesta ya parte el grupo en varios productos (por capacidad y por línea).</p>
      <button type="button" className="ghost" onClick={() => downloadText(`shopify-agrupar-${argentinaToday()}.csv`, proposalsCsv(proposals))}>Descargar propuesta (CSV)</button>
      {proposals.map((item) => (
        <section key={item.key} className="panel">
          <button type="button" className="proposal-head" aria-expanded={open === item.key} onClick={() => setOpen(open === item.key ? "" : item.key)}>
            {open === item.key ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
            <span className="proposal-name">{item.name}</span>
            <span className="proposal-meta">{item.products.length} productos → 1 · {item.variants.length} variantes · {item.options.map((option) => option.name).join(" / ") || "sin opciones"}</span>
            {item.warnings.length > 0 && <span className="badge warn"><TriangleAlert size={12} aria-hidden="true" /> {item.warnings.length} {item.warnings.length === 1 ? "aviso" : "avisos"}</span>}
          </button>
          {open === item.key && (
            <div>
              {item.warnings.map((warning) => <p key={warning} className="muted small">⚠ {warning}</p>)}
              <p className="muted small">Quedaría como base: {item.survivor.title}</p>
              <DraftButton session={session} build={() => [proposalSpec(item)]} label="Crear este producto unificado como borrador" confirmText={() => `Se crea «${item.name}» como BORRADOR con ${item.variants.length} variantes, copiando descripción y fotos de «${item.survivor.title}». Los ${item.products.length} productos originales NO se tocan: cuando publiques el nuevo, archivalos vos. ¿Seguimos?`} />
              <ul>{item.variants.map((variant, index) => <li key={index}>{item.options.map((option) => variant.optionValues[option.name]).join(" / ")} — {variant.from.member.product.title}</li>)}</ul>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

const pct = (value) => (value == null ? "—" : `${Math.round(value * 100)} %`);
const shortDay = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-AR", { day: "numeric", month: "short" });

function Operation({ orders, checkouts }) {
  const now = Date.now();
  const pending = useMemo(() => pendingOrders(orders, now), [orders]);
  const recover = useMemo(() => recoverList(checkouts), [checkouts]);
  const funnel = useMemo(() => weeklyFunnel(orders, checkouts), [orders, checkouts]);
  const summary = operationSummary(orders, checkouts, now);
  const totalRecover = recover.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  if (orders.length === 0 && checkouts.length === 0) return <Empty title="Todavía no hay pedidos ni carritos" text="Se copian en la próxima actualización de Shopify (Actualizar ahora). Si la llave no tiene permiso para leer pedidos, aparecen vacíos." />;
  return (
    <div className="content-stack">
      <section className="metric-grid ml-metric-grid">
        <article className={`metric-card ${summary.shipping ? "is-urgent" : ""}`}><Truck size={20} /><span>Envíos sin despachar</span><strong>{summary.shipping}</strong><small className="muted">pagos hace más de {SHIP_LIMIT_HOURS} h</small></article>
        <article className={`metric-card ${summary.pickups ? "is-urgent" : ""}`}><PackageCheck size={20} /><span>Retiros sin retirar</span><strong>{summary.pickups}</strong><small className="muted">hace más de {PICKUP_LIMIT_DAYS} días</small></article>
        <article className="metric-card"><ShoppingBag size={20} /><span>Carritos para recuperar</span><strong>{summary.abandoned}</strong><small className="muted">{money(totalRecover)}</small></article>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Plata parada · reputación</span><h2>Pedidos para atender</h2></div></div>
        {pending.length === 0 ? <p className="muted small">Nada atrasado: todo lo pago se entregó o está dentro del plazo.</p> : (
          <ul className="ml-alerts">
            {pending.map((item) => (
              <li key={item.id} className="is-urgent"><TriangleAlert size={16} /><span><strong>{item.name} · {item.kind === "retiro" ? "retiro sin retirar" : "sin despachar"} hace {item.days >= 2 ? `${item.days} días` : `${item.hours} h`}</strong><small className="muted"> · {money(item.total)}</small></span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Dónde se cae la compra</span><h2>Pagos iniciados contra compras, por semana</h2></div></div>
        <div className="table-scroll"><table className="sales-history-table">
          <thead><tr><th>Semana del</th><th>Iniciaron el pago</th><th>Compraron</th><th>Se cayeron</th><th>Compra</th><th>Facturado</th></tr></thead>
          <tbody>{funnel.map((row) => <tr key={row.week}><td data-label="Semana del">{shortDay(row.week)}{row.partial ? <small className="muted"> (en curso)</small> : null}</td><td data-label="Iniciaron">{row.started}</td><td data-label="Compraron">{row.orders}</td><td data-label="Se cayeron">{row.abandoned}</td><td data-label="Compra"><strong>{pct(row.rate)}</strong></td><td data-label="Facturado">{money(row.amount)}</td></tr>)}</tbody>
        </table></div>
        <p className="muted small">Shopify no entrega por API las visitas ni los "agregó al carrito": el embudo arranca cuando la persona empieza a pagar (carritos abandonados + pedidos pagos). Los carritos repetidos por robots o recargas se cuentan una vez.</p>
      </section>
      <section className="panel">
        <div className="panel-head"><div><span className="eyebrow">Recupero diario</span><h2>Carritos abandonados</h2></div></div>
        {recover.length === 0 ? <p className="muted small">No hay carritos con monto para recuperar.</p> : (
          <ul className="ml-alerts">
            {recover.map((item) => (
              <li key={item.id}><ShoppingBag size={16} /><span><strong>{money(item.total)} · {(item.items || []).map((line) => `${line.title}${line.quantity > 1 ? ` ×${line.quantity}` : ""}`).join(", ") || "sin detalle"}</strong><small className="muted"> · {shortDay(item.created_at.slice(0, 10))}</small></span></li>
            ))}
          </ul>
        )}
        <p className="muted small">No se guardan datos del comprador: para contactar a alguien, buscá el carrito en el administrador de Shopify (Pedidos → Carritos abandonados).</p>
      </section>
    </div>
  );
}

function Prices({ products, variants, mlItems }) {
  const rows = useMemo(() => priceCross({ products, variants, mlItems }), [products, variants, mlItems]);
  const summary = useMemo(() => priceSummary(rows), [rows]);
  const [state, setState] = useState("");
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const shown = useMemo(() => filterPriceRows(rows, { state, query, activeOnly }), [rows, state, query, activeOnly]);
  if (!mlItems.length) return <Empty title="Faltan las publicaciones de Mercado Libre" text="Para cruzar precios hace falta tener copiadas las publicaciones de Mercado Libre (Más → Datos → Mercado Libre → Actualizar todo)." />;
  const pct = (value) => (value == null ? "—" : `${value > 0 ? "+" : ""}${Math.round(value * 100)} %`);
  const chips = [["", "Todas"], ["alinear_bajar", "Para bajar"], ["alinear_subir", "Para subir"], ["ok", "Dentro de la regla"], ["revisar", "Revisar"], ["ml_inactiva", "ML inactiva"], ["sin_ml", "Sin ML"], ["sin_sku", "Sin SKU"], ["sin_precio", "Sin precio"]];
  const countOf = (key) => rows.filter((row) => (!activeOnly || row.status === "ACTIVE") && (!key || row.state === key)).length;
  return (
    <div className="content-stack">
      <section className="metric-grid ml-metric-grid">
        <article className="metric-card"><Wallet size={20} /><span>Con precio de ML</span><strong>{number(summary.matched)}</strong><small className="muted">de {number(summary.total)} variantes</small></article>
        <article className={`metric-card ${summary.toChangeActive ? "is-urgent" : ""}`}><TriangleAlert size={20} /><span>Para ajustar (activos)</span><strong>{number(summary.toChangeActive)}</strong><small className="muted">{summary.lower} bajar · {summary.raise} subir</small></article>
        <article className="metric-card"><PackageCheck size={20} /><span>Dentro de la regla</span><strong>{number(summary.ok)}</strong><small className="muted">±2 % del objetivo</small></article>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Regla: precio de Shopify = precio de Mercado Libre − {Math.round(DISCOUNT * 100)} %</span><h2>Precios contra Mercado Libre</h2></div>
          <label className="ml-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por producto o SKU…" aria-label="Buscar" /></label>
        </div>
        <p className="muted small">Se cruza por SKU con la publicación activa que más vendió. Es solo una propuesta: no se cambia ningún precio en la tienda. Revisá el CSV y decidime cuáles aplicar (escribir en Shopify necesita tu aprobación y otro permiso).</p>
        <div className="ml-tabs ml-filter-tabs" role="tablist" aria-label="Estado del precio">
          {chips.map(([key, label]) => <button key={key || "todas"} type="button" role="tab" aria-selected={state === key} className={state === key ? "selected" : ""} onClick={() => setState(key)}>{label} ({countOf(key)})</button>)}
        </div>
        <div className="ml-toolbar">
          <label className="small check-row"><input type="checkbox" checked={activeOnly} onChange={(event) => setActiveOnly(event.target.checked)} /> Solo productos activos</label>
          <button type="button" className="ghost" onClick={() => downloadText(`shopify-precios-vs-ml-${argentinaToday()}.csv`, priceProposalCsv(shown))}>Descargar propuesta ({shown.filter((row) => row.proposal != null).length})</button>
        </div>
        {shown.length === 0 ? <Empty title="Nada para mostrar" text="Probá con otro filtro." /> : (
          <div className="table-scroll"><table className="sales-history-table ml-board-table">
            <thead><tr><th>Producto</th><th>Estado</th><th>Shopify</th><th>ML</th><th>Objetivo</th><th>Dif.</th><th>Propuesta</th></tr></thead>
            <tbody>{shown.slice(0, 300).map((row) => {
              const [label, tone] = PRICE_STATES[row.state];
              return (
                <tr key={row.variantId}>
                  <td><strong>{row.title}</strong>{row.variantTitle ? <small className="muted"> · {row.variantTitle}</small> : null}<div className="muted small">{row.sku || "sin SKU"}{row.status !== "ACTIVE" ? ` · ${statusLabel(row.status)}` : ""}</div></td>
                  <td data-label="Estado"><span className={`badge ${tone}`}>{label}</span></td>
                  <td data-label="Shopify">{row.shopify > 0 ? money(row.shopify) : "—"}</td>
                  <td data-label="ML">{row.ml && row.ml.price > 0 ? (row.ml.permalink ? <a href={row.ml.permalink} target="_blank" rel="noreferrer">{money(row.ml.price)}</a> : money(row.ml.price)) : "—"}{row.ml?.listings > 1 ? <small className="muted"> ({row.ml.listings} publicaciones)</small> : null}</td>
                  <td data-label="Objetivo">{row.target != null ? money(row.target) : "—"}</td>
                  <td data-label="Dif.">{pct(row.diff)}</td>
                  <td data-label="Propuesta">{row.proposal != null ? <strong>{row.state === "alinear_bajar" ? "Bajar a " : "Subir a "}{money(row.proposal)}</strong> : "—"}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {shown.length > 300 && <p className="muted small">Se muestran las primeras 300; usá los filtros o descargá el CSV.</p>}
      </section>
    </div>
  );
}

// Lo que se vende en Mercado Libre y no está en la tienda: propuesta completa para revisar y, si se quiere, importar como BORRADOR.
function Missing({ supabase, products, variants, session }) {
  const [full, setFull] = useState({ status: "loading", items: [] });
  const [query, setQuery] = useState("");
  const [view, setView] = useState("");
  const [open, setOpen] = useState("");
  useEffect(() => {
    let alive = true;
    readAll(() => supabase.from("ml_items").select("id,sku,title,status,price,sold_quantity,visits_30d,pictures_count,available_quantity,description,attributes,picture_url,thumbnail,permalink").eq("status", "active").order("id"))
      .then((items) => { if (alive) setFull({ status: "ready", items }); })
      .catch((error) => { if (alive) setFull({ status: "error", items: [], error: String(error?.message || error) }); });
    return () => { alive = false; };
  }, [supabase]);
  const result = useMemo(() => missingFromShopify({ products, variants, mlItems: full.items }), [products, variants, full.items]);
  const shown = useMemo(() => filterMissing(result.rows, { query, view }), [result.rows, query, view]);
  const cleanup = useMemo(() => skuCleanup(full.items), [full.items]);
  if (full.status === "loading") return <div className="ml-skeleton" aria-busy="true"><i /><i /><i /></div>;
  if (full.status === "error") return <Empty title="No se pudieron leer las publicaciones de Mercado Libre" text={full.error} />;
  if (!full.items.length) return <Empty title="Faltan las publicaciones de Mercado Libre" text="Más → Datos → Mercado Libre → Actualizar todo." />;
  const { summary } = result;
  const chips = [["", "Todos", result.rows.length], ["ventas", "Con ventas", summary.withSales], ["grupos", "Se agrupan", result.rows.filter((row) => row.group).length], ["sumar", "Se suman a uno existente", summary.joinExisting], ["dudosos", "Posible duplicado", summary.doubtful]];
  return (
    <div className="content-stack">
      <section className="metric-grid ml-metric-grid">
        <article className="metric-card"><ShoppingBag size={20} /><span>Están en ML y no en Shopify</span><strong>{number(summary.missing)}</strong><small className="muted">{number(summary.withSales)} con ventas</small></article>
        <article className="metric-card"><Layers size={20} /><span>Se agruparían en</span><strong>{number(summary.groups)}</strong><small className="muted">productos con variantes</small></article>
        <article className={`metric-card ${summary.noSku ? "is-urgent" : ""}`}><TriangleAlert size={20} /><span>Publicaciones sin SKU</span><strong>{number(summary.noSku)}</strong><small className="muted">no se pueden cruzar</small></article>
      </section>
      <section className="panel">
        <div className="panel-head">
          <div><span className="eyebrow">Mercado Libre → Shopify · nada se publica solo</span><h2>Productos que faltan en la tienda</h2></div>
          <label className="ml-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por título o SKU…" aria-label="Buscar" /></label>
        </div>
        <p className="muted small">Publicaciones activas de ML con SKU que ninguna variante de Shopify tiene, de las que más vendieron a las que menos. Cada fila trae precio sugerido (ML − 10 %), título corto, descripción sin links ni teléfonos, SEO, etiquetas, metacampos y con quién se agruparía. Podés crearlos directo como <strong>borrador</strong> en Shopify (de a 40 por vez, siguiendo los filtros) o bajar el CSV para importarlo vos; en los dos casos los revisás en la tienda antes de publicar. Stock inicial 999 si ML tiene stock (tu criterio de stock constante).</p>
        <div className="ml-tabs ml-filter-tabs" role="tablist" aria-label="Filtro">
          {chips.map(([key, label, count]) => <button key={key || "todos"} type="button" role="tab" aria-selected={view === key} className={view === key ? "selected" : ""} onClick={() => setView(key)}>{label} ({count})</button>)}
        </div>
        <div className="ml-toolbar">
          <DraftButton session={session} className="primary" build={() => draftSpecs(shown).slice(0, 40)} label={`Crear en Shopify como borrador (${Math.min(draftSpecs(shown).length, 40)})`} confirmText={(count) => `Se van a crear ${count} producto(s) como BORRADOR en Shopify (con precio ML − 10 %, descripción, SEO y metacampos). No se publica nada ni se toca lo que ya existe. ¿Seguimos?`} />
          <button type="button" className="ghost" onClick={() => downloadText(`shopify-borradores-${argentinaToday()}.csv`, shopifyImportCsv(shown))}>CSV para importar como borrador</button>
          <button type="button" className="ghost" onClick={() => downloadText(`faltan-en-shopify-${argentinaToday()}.csv`, missingReviewCsv(shown))}>Hoja de revisión (todo lo sugerido)</button>
        </div>
        {shown.length === 0 ? <Empty title="Nada para mostrar" text="Probá con otro filtro." /> : (
          <div className="table-scroll"><table className="sales-history-table ml-board-table">
            <thead><tr><th>Producto en ML</th><th>Vendidas</th><th>Visitas 30 d</th><th>Precio ML</th><th>Shopify sugerido</th><th>Qué hacer</th></tr></thead>
            <tbody>{shown.slice(0, 200).map((row) => (
              <FragmentRow key={row.sku} row={row} open={open === row.sku} toggle={() => setOpen(open === row.sku ? "" : row.sku)} />
            ))}</tbody>
          </table></div>
        )}
        {shown.length > 200 && <p className="muted small">Se muestran los primeros 200; usá los filtros o descargá el CSV.</p>}
      </section>
      {(cleanup.similar.length > 0 || cleanup.suggestions.length > 0) && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">Se corrige en Mercado Libre</span><h2>Ordenar los SKU de ML</h2></div>
            <button type="button" className="ghost" onClick={() => downloadText(`sku-mercado-libre-${argentinaToday()}.csv`, skuCleanupCsv(cleanup))}>Descargar hoja para corregir ({cleanup.similar.length + cleanup.suggestions.length})</button>
          </div>
          <p className="muted small">Un mismo producto con dos SKU distintos, o sin SKU, rompe los cruces con Shopify (precios y faltantes). El CRM no escribe en Mercado Libre: corregilos ahí y en la próxima actualización se acomodan solos.</p>
          {cleanup.similar.length > 0 && (
            <>
              <h3 className="small">Mismo producto, SKU distinto ({cleanup.similar.length})</h3>
              <ul className="ml-simple-list">{cleanup.similar.slice(0, 10).map((row) => (
                <li key={`${row.keepSku}|${row.otherSku}`}><strong>{row.otherSku}</strong> → <strong>{row.keepSku}</strong> <small className="muted">· {row.otherLink ? <a href={row.otherLink} target="_blank" rel="noreferrer">{row.otherTitle}</a> : row.otherTitle}</small></li>
              ))}</ul>
            </>
          )}
          {cleanup.suggestions.length > 0 && (
            <>
              <h3 className="small">Sin SKU ({cleanup.suggestions.length}), las más vendidas primero</h3>
              <ul className="ml-simple-list">{cleanup.suggestions.slice(0, 15).map((row) => (
                <li key={row.id}><a href={row.permalink} target="_blank" rel="noreferrer">{row.title}</a> <small className="muted">· {number(row.sold)} vendidas · {row.suggestedSku ? <>SKU sugerido <strong>{row.suggestedSku}</strong> (por parecerse a «{row.suggestedFrom}»)</> : "SKU a definir"}</small></li>
              ))}</ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function FragmentRow({ row, open, toggle }) {
  const doubtful = Boolean(row.twin || row.lookalike);
  const action = row.joinsProduct ? `Sumar como variante a «${row.joinsProduct.title}»` : doubtful ? "Revisar si ya está cargado" : row.group ? `Crear con ${row.group.size} variantes (${row.group.options.join(" / ")})` : "Crear producto nuevo";
  return (
    <>
      <tr>
        <td><strong>{row.title}</strong><div className="muted small">{row.sku}{row.listings > 1 ? ` · ${row.listings} publicaciones` : ""}</div></td>
        <td data-label="Vendidas">{number(row.sold)}</td>
        <td data-label="Visitas 30 d">{number(row.visits)}</td>
        <td data-label="Precio ML">{row.permalink ? <a href={row.permalink} target="_blank" rel="noreferrer">{money(row.mlPrice)}</a> : money(row.mlPrice)}</td>
        <td data-label="Shopify sugerido">{row.price > 0 ? <strong>{money(row.price)}</strong> : "—"}</td>
        <td data-label="Qué hacer"><span className={`badge ${doubtful ? "warn" : row.joinsProduct ? "" : "ok"}`}>{action}</span> <button type="button" className="ghost" onClick={toggle} aria-expanded={open}>{open ? "Ocultar" : "Ver propuesta"}</button></td>
      </tr>
      {open && (
        <tr className="proposal-detail"><td colSpan={6}>
          <div className="small">
            {row.warnings.map((warning) => <p key={warning} className="warn-line">⚠ {warning}</p>)}
            <p><strong>Título sugerido:</strong> {row.title}</p>
            <p><strong>SEO:</strong> {row.seoTitle} — {row.seoDescription || "(sin texto)"}</p>
            <p><strong>Etiquetas:</strong> {row.tags.join(", ") || "—"}</p>
            {row.group && <p><strong>Variantes del grupo:</strong> {row.group.options.map((name, index) => `${name}: ${row.group.values[index]}`).join(" · ")}</p>}
            {row.metafields.length > 0 && <p><strong>Metacampos sugeridos:</strong> {row.metafields.map((field) => `${field.name}: ${field.value}`).join(" · ")}</p>}
            <p><strong>Descripción (de ML, sin links ni teléfonos):</strong></p>
            <p className="muted" style={{ whiteSpace: "pre-wrap" }}>{row.description ? row.description.slice(0, 900) + (row.description.length > 900 ? "…" : "") : "Sin descripción en ML: hay que escribirla."}</p>
          </div>
        </td></tr>
      )}
    </>
  );
}

export function ShopifyBoard({ supabase, session, isAdmin, hiddenTabs = null, email = "" }) {
  // Desde el Centro de mejoras se abre directo en Productos con el problema elegido.
  const opened = useMemo(() => { try { const key = sessionStorage.getItem("poliplast-open-shopify"); sessionStorage.removeItem("poliplast-open-shopify"); return key || ""; } catch { return ""; } }, []);
  const openedTab = opened.startsWith("tab:") ? opened.slice(4) : "";
  const [pickedTab, setTab] = useState(openedTab || (opened ? "productos" : "resumen"));
  const allowedTabs = TABS.filter(([key]) => canSee(email, hiddenTabs, "shopify", key));
  const tab = allowedTabs.some(([key]) => key === pickedTab) ? pickedTab : allowedTabs[0]?.[0] || "";
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [issue, setIssue] = useState(openedTab ? "" : opened);
  const data = useShopifyData(supabase, reload);
  const rows = useMemo(() => boardRows(data.products, data.variants), [data.products, data.variants]);
  const stats = useMemo(() => summarize(rows), [rows]);
  const today = argentinaToday();
  const [period, setPeriod] = useState(7);
  const [metric, setMetric] = useState("amount");
  const week = useMemo(() => periodTotals(data.days, period, today), [data.days, period, today]);
  const month = useMemo(() => periodTotals(data.days, 30, today), [data.days, today]);
  const series = useMemo(() => dailySeries(data.days, period, today), [data.days, period, today]);
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
              <article className="metric-card"><ShoppingBag size={20} /><span>Pedidos ({period} días)</span><strong>{number(week.current.orders)}</strong><Trend value={week.ordersChange} /></article>
              <article className="metric-card"><Wallet size={20} /><span>Facturado ({period} días)</span><strong>{money(week.current.amount)}</strong><Trend value={week.amountChange} /></article>
            </section>
            <section className="panel">
              <div className="panel-head">
                <div><span className="eyebrow">Ventas de la tienda</span><h2>Día por día</h2></div>
                <div className="segmented" role="tablist" aria-label="Período">
                  {[[7, "7 días"], [14, "14 días"], [30, "30 días"], [60, "60 días"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={period === key} className={period === key ? "selected" : ""} onClick={() => setPeriod(key)}>{label}</button>)}
                </div>
              </div>
              <div className="segmented" role="tablist" aria-label="Qué mostrar">
                {[["amount", "Facturado"], ["orders", "Pedidos"]].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={metric === key} className={metric === key ? "selected" : ""} onClick={() => setMetric(key)}>{label}</button>)}
              </div>
              <DailyChart days={series} metric={metric} currency="ARS" />
              <p className="muted small">Comparado con los {period} días anteriores. Los pedidos se guardan de los últimos 120 días.</p>
            </section>
            {data.days.length === 0 && <p className="muted small">Todavía no hay pedidos guardados: si la llave no tiene el permiso <code>read_orders</code>, aparecen en cero.</p>}
            <p className="muted small">Últimos 30 días: {number(month.current.orders)} pedidos · {money(month.current.amount)} (pedidos no cancelados, con IVA incluido tal cual los cobra Shopify).</p>
            <Issues rows={rows} onPick={pick} />
          </>
        )}
        {data.status === "ready" && data.products.length > 0 && tab === "mejorar" && <Issues rows={rows} onPick={pick} />}
        {data.status === "ready" && data.products.length > 0 && tab === "productos" && <Products rows={rows} issue={issue} setIssue={setIssue} />}
        {data.status === "ready" && data.products.length > 0 && tab === "precios" && <Prices products={data.products} variants={data.variants} mlItems={data.mlItems || []} />}
        {data.status === "ready" && data.products.length > 0 && tab === "faltan" && <Missing supabase={supabase} products={data.products} variants={data.variants} session={session} />}
        {data.status === "ready" && data.products.length > 0 && tab === "operacion" && <Operation orders={data.orders || []} checkouts={data.checkouts || []} />}
        {data.status === "ready" && data.products.length > 0 && tab === "ordenar" && <Organize products={data.products} variants={data.variants} session={session} />}
      </div>
    </div>
  );
}
