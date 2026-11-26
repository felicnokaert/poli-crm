import { useEffect, useMemo, useState } from "react";
import { Copy, Search, Trash2 } from "lucide-react";
import { currentListPrices } from "./assistant-prices.mjs";
import { loadDollar } from "./product-hub-data.js";
import { MODES, ars, channelRefs, lineTotals, pickRow, quoteTotals, usd, whatsappText, wholesaleWarnings } from "./quote-model.mjs";

// Poliplast App (26/11): el cotizador adentro de la app, con el diseño de la app. Lee el catálogo y las listas de
// precios de siempre (en USD), muestra de referencia el precio en Mercado Libre y Shopify por SKU, avisa el mínimo
// mayorista y arma el texto para WhatsApp. No guarda ventas: una cotización no es una venta.
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const plain = (value) => String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function searchVariants(supabase, text) {
  const words = plain(text).split(/[^a-z0-9.-]+/).filter((word) => word.length > 1).slice(0, 3);
  if (!words.length) return [];
  let query = supabase.from("catalog_variants").select("id,sku,name,product_id,unit").eq("active", true);
  for (const word of words) query = query.or(`name.ilike.%${word}%,sku.ilike.%${word}%`);
  let { data: variants } = await query.limit(20);
  if (!variants?.length) {
    let products = supabase.from("catalog_products").select("id");
    for (const word of words) products = products.ilike("name", `%${word}%`);
    const { data } = await products.limit(10);
    if (data?.length) ({ data: variants } = await supabase.from("catalog_variants").select("id,sku,name,product_id,unit").eq("active", true).in("product_id", data.map((row) => row.id)).limit(20));
  }
  if (!variants?.length) return [];
  const { data: products } = await supabase.from("catalog_products").select("id,name,brand,family").in("id", [...new Set(variants.map((variant) => variant.product_id))]);
  const byId = new Map((products || []).map((product) => [product.id, product]));
  return variants.map((variant) => {
    const product = byId.get(variant.product_id) || {};
    const base = product.name || "";
    return { ...variant, brand: product.brand || "", family: product.family || "", name: base && !plain(variant.name).includes(plain(base)) ? `${base} · ${variant.name}` : variant.name };
  });
}

async function loadLineData(supabase, variant, lists) {
  const [prices, photo, ml, shop] = await Promise.all([
    supabase.from("variant_prices").select("price_list_id,variant_id,min_quantity,max_quantity,amount,status").eq("variant_id", variant.id),
    supabase.from("catalog_product_photos").select("url").eq("product_id", variant.product_id).limit(1),
    variant.sku ? supabase.from("ml_items").select("title,permalink,status,price,sold_quantity,sku,variation_skus").eq("sku", variant.sku).limit(20) : { data: [] },
    variant.sku ? supabase.from("shopify_variants").select("sku,price,compare_at_price").eq("sku", variant.sku).limit(5) : { data: [] },
  ]);
  const [entry] = currentListPrices({ variants: [variant], prices: prices.data || [], lists, today: today() });
  return { rows: entry?.rows || [], photo: photo.data?.[0]?.url || "", refs: channelRefs(variant.sku, { mlItems: ml.data || [], shopVariants: shop.data || [] }) };
}

export function QuoteBuilder({ supabase, clients = [], initialClient = null, sellerName = "", onQuoted = null }) {
  const [lists, setLists] = useState([]);
  const [payments, setPayments] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [dollar, setDollar] = useState(null);
  const [client, setClient] = useState(initialClient?.company || "");
  const [mode, setMode] = useState("minorista");
  const [paymentId, setPaymentId] = useState("");
  const [validDays, setValidDays] = useState(7);
  const [text, setText] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [lines, setLines] = useState([]);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) return;
    supabase.from("price_lists").select("id,name,currency,vat_rate,valid_from,valid_until,status").then(({ data }) => setLists(data || []));
    supabase.from("payment_policies").select("id,name,customer_text,discount_percent,surcharge_percent,active,sort_order").eq("active", true).order("sort_order").then(({ data }) => setPayments(data || []));
    supabase.from("wholesale_order_policies").select("brand,threshold_net_usd,mix_products,active").then(({ data }) => setPolicies(data || []));
    loadDollar().then(setDollar);
  }, [supabase]);

  useEffect(() => {
    if (!supabase || text.trim().length < 2) { setResults([]); return undefined; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => searchVariants(supabase, text).then((rows) => { if (alive) { setResults(rows); setSearching(false); } }), 350);
    return () => { alive = false; clearTimeout(timer); };
  }, [supabase, text]);

  // El modo de cada renglón sigue al general hasta que se cambie a mano en el renglón.
  const priced = useMemo(() => lines.map((line) => ({ ...line, row: pickRow(line.rows, line.mode, line.quantity) })), [lines]);
  const payment = payments.find((item) => item.id === paymentId) || null;
  const totals = quoteTotals(priced, { payment });
  const warnings = wholesaleWarnings(priced, policies);

  const add = async (variant) => {
    setText("");
    setResults([]);
    const key = `${variant.id}-${Date.now()}`;
    setLines((current) => [...current, { key, ...variant, quantity: 1, mode, rows: [], loading: true }]);
    const data = await loadLineData(supabase, variant, lists);
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...data, loading: false } : line)));
  };
  const update = (key, change) => setLines((current) => current.map((line) => (line.key === key ? { ...line, ...change } : line)));
  const changeMode = (value) => { setMode(value); setLines((current) => current.map((line) => ({ ...line, mode: value }))); };

  const copy = async () => {
    const textOut = whatsappText({ client, lines: priced, totals, dollar, payment, validDays, seller: sellerName });
    try { await navigator.clipboard.writeText(textOut); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { setMessage("No se pudo copiar: seleccioná el texto a mano."); }
  };
  const markQuoted = () => {
    const found = clients.find((item) => plain(item.company) === plain(client));
    if (!found || !onQuoted) { setMessage("Para marcar «Coticé hoy», elegí un cliente de tu cartera."); return; }
    onQuoted(found.id);
    setMessage(`Listo: ${found.company} queda con «Coticé hoy» (no es una venta).`);
  };

  if (!supabase) return <section className="panel"><p className="muted">El cotizador necesita la conexión con la base.</p></section>;
  return (
    <div className="quote-builder content-stack">
      <section className="panel quote-head">
        <div className="quote-fields">
          <label>Cliente
            <input list="quote-clients" value={client} onChange={(event) => setClient(event.target.value)} placeholder="Empresa o nombre" />
            <datalist id="quote-clients">{clients.slice(0, 400).map((item) => <option key={item.id} value={item.company} />)}</datalist>
          </label>
          <label>Precio
            <div className="segmented" role="tablist" aria-label="Lista de precios">
              {MODES.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={mode === id} className={mode === id ? "selected" : ""} onClick={() => changeMode(id)}>{label}</button>)}
            </div>
          </label>
          <label>Forma de pago
            <select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}>
              <option value="">Sin elegir</option>
              {payments.map((item) => <option key={item.id} value={item.id}>{item.name}{Number(item.discount_percent) ? ` (−${Number(item.discount_percent)} %)` : ""}{Number(item.surcharge_percent) ? ` (+${Number(item.surcharge_percent)} %)` : ""}</option>)}
            </select>
          </label>
          <label>Válida por
            <select value={validDays} onChange={(event) => setValidDays(Number(event.target.value))}>{[3, 7, 15, 30].map((days) => <option key={days} value={days}>{days} días</option>)}</select>
          </label>
        </div>
        <div className="quote-search">
          <Search size={18} />
          <input value={text} onChange={(event) => setText(event.target.value)} placeholder="Buscá un producto por nombre o SKU (ej. 618, PU-46, balde 10)" aria-label="Buscar producto" />
        </div>
        {(searching || results.length > 0) && (
          <ul className="quote-results">
            {searching && !results.length && <li className="muted small">Buscando…</li>}
            {results.map((variant) => (
              <li key={variant.id}><button type="button" onClick={() => add(variant)}><strong>{variant.name}</strong><span className="muted small">{variant.sku || "sin SKU"}{variant.brand ? ` · ${variant.brand}` : ""}</span></button></li>
            ))}
          </ul>
        )}
      </section>

      {priced.length === 0 ? (
        <section className="panel quote-empty"><p className="muted">Buscá un producto para empezar. Los precios salen de las listas vigentes en dólares (las mismas del cotizador de siempre).</p></section>
      ) : (
        <section className="panel quote-lines">
          {priced.map((line) => {
            const total = lineTotals(line);
            return (
              <article key={line.key} className="quote-line">
                {line.photo ? <img src={line.photo} alt="" loading="lazy" /> : <div className="quote-photo-empty" aria-hidden="true" />}
                <div className="quote-line-main">
                  <strong>{line.name}</strong>
                  <span className="muted small">{line.sku || "sin SKU"}{line.brand ? ` · ${line.brand}` : ""}{line.row ? ` · ${line.row.list}` : ""}{line.row?.fallback ? " (no hay lista de ese tipo)" : ""}</span>
                  {line.loading && <span className="muted small">Cargando precio…</span>}
                  {!line.loading && !line.row && <span className="quote-warn small">Sin precio vigente en las listas.</span>}
                  <span className="quote-refs small">
                    {line.refs?.ml ? <a href={line.refs.ml.permalink} target="_blank" rel="noreferrer">Mercado Libre {ars(line.refs.ml.price)}</a> : <span className="muted">Sin publicación activa en ML</span>}
                    {line.refs?.shopify ? <span>Shopify {ars(line.refs.shopify.price)}</span> : null}
                    {dollar?.rate && line.row ? <span className="muted">Lista en pesos {ars(line.row.gross * dollar.rate)}</span> : null}
                  </span>
                </div>
                <div className="quote-line-controls">
                  <select aria-label="Lista del renglón" value={line.mode} onChange={(event) => update(line.key, { mode: event.target.value })}>{MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                  <input type="number" min="1" inputMode="numeric" aria-label="Cantidad" value={line.quantity} onChange={(event) => update(line.key, { quantity: Math.max(1, Number(event.target.value) || 1) })} />
                  <div className="quote-line-price">
                    <span>{line.row ? `${usd(line.row.gross)} c/u` : "—"}</span>
                    <strong>{usd(total.gross)}</strong>
                  </div>
                  <button type="button" className="ghost" aria-label={`Quitar ${line.name}`} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}><Trash2 size={16} /></button>
                </div>
              </article>
            );
          })}
        </section>
      )}

      {warnings.map((warning) => (
        <p key={warning.brand} className="demo-msg quote-warn" role="status">Mayorista {warning.brand}: el mínimo es {usd(warning.min)} neto y vas {usd(warning.net)} (faltan {usd(warning.missing)}). Si no se llega, va a precio minorista.</p>
      ))}

      {priced.length > 0 && (
        <section className="metric-grid quote-totals">
          <article className="metric-card"><span>Neto (+ IVA)</span><strong>{usd(totals.net)}</strong><small>IVA {usd(totals.vat)}</small></article>
          <article className="metric-card is-strong"><span>Total final</span><strong>{usd(totals.gross)}</strong><small>{payment ? payment.name : "IVA incluido"}</small></article>
          <article className="metric-card"><span>En pesos</span><strong>{dollar?.rate ? ars(totals.gross * dollar.rate) : "—"}</strong><small>{dollar?.rate ? `Dólar BNA ${ars(dollar.rate)}` : "Sin cotización del dólar"}</small></article>
        </section>
      )}
      {priced.length > 0 && (
        <div className="quote-actions">
          <button type="button" className="primary" onClick={copy}><Copy size={16} /> {copied ? "Copiado ✓" : "Copiar para WhatsApp"}</button>
          <button type="button" className="secondary" onClick={markQuoted}>Coticé hoy</button>
          <button type="button" className="secondary" onClick={() => setLines([])}>Empezar otra</button>
        </div>
      )}
      {message && <p className="muted small" role="status">{message}</p>}
    </div>
  );
}
