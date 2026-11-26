import { useEffect, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { loadLineData, searchVariants } from "./QuoteBuilder.jsx";
import { loadDollar } from "./product-hub-data.js";
import { ars, rarePrice } from "./quote-model.mjs";
import { bulkChange, rareList, diffTiers, isWholesaleList, tiersByList, validateMinimum, validatePayment, validateTiers } from "./price-admin.mjs";
import { arToday } from "./ar-date.mjs";

// Precios y condiciones del cotizador (26/11, solo administradores). Lo que se guarda acá lo usa el cotizador de toda la
// empresa en la próxima cotización. En el link de prueba nada se guarda (se ve cómo quedaría).
const readOnly = () => Boolean(globalThis.window?.__poliplastReadOnly);
const usd = (value) => (Number.isFinite(Number(value)) ? Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const savedText = () => (readOnly() ? "Link de prueba: así quedaría, pero no se guardó." : "Guardado: ya lo usa el cotizador.");

function TierEditor({ supabase, entry, variant, who, onSaved }) {
  const { list, rows } = entry;
  const toForm = (items) => items.map((row) => ({ id: row.id, from: String(Number(row.min_quantity)), to: row.max_quantity == null ? "" : String(Number(row.max_quantity)), amount: String(Number(row.amount)) }));
  const [tiers, setTiers] = useState(() => toForm(rows));
  const [status, setStatus] = useState("");
  useEffect(() => { setTiers(toForm(rows)); setStatus(""); }, [rows]);
  const vat = list.vat_rate == null ? 0.21 : Number(list.vat_rate);
  const set = (index, key, value) => setTiers((current) => current.map((tier, at) => (at === index ? { ...tier, [key]: value } : tier)));
  async function save() {
    const { tiers: clean, error } = validateTiers(tiers);
    if (error) { setStatus(error); return; }
    const diff = diffTiers(rows, clean, { who, today: arToday() });
    if (!diff.changed) { setStatus("No hay cambios."); return; }
    if (diff.remove.length && !window.confirm(`Se quitan ${diff.remove.length} tramo(s) de «${list.name}». ¿Seguimos?`)) return;
    setStatus("Guardando…");
    try {
      for (const change of diff.update) {
        const { id, ...fields } = change;
        const { error: failed } = await supabase.from("variant_prices").update(fields).eq("id", id);
        if (failed) throw failed;
      }
      if (diff.insert.length) {
        const { error: failed } = await supabase.from("variant_prices").insert(diff.insert.map((row) => ({ ...row, price_list_id: list.id, variant_id: variant.id, status: "confirmado", calculation_mode: "manual", created_by_email: who, override_reason: `Cargado en Poliplast App por ${who} el ${arToday()}` })));
        if (failed) throw failed;
      }
      if (diff.remove.length) {
        const { error: failed } = await supabase.from("variant_prices").delete().in("id", diff.remove);
        if (failed) throw failed;
      }
      setStatus(savedText());
      if (!readOnly()) onSaved();
    } catch (failed) {
      setStatus(`No se pudo guardar: ${failed.message || failed}`);
    }
  }
  return (
    <article className="price-list-card">
      <header>
        <strong>{list.name}</strong>
        <span className={`badge ${isWholesaleList(list) ? "warn" : ""}`}>{isWholesaleList(list) ? "Mayorista" : "Minorista"}</span>
        <span className="muted small">{list.currency} · final con IVA {Math.round(vat * 100)} %</span>
      </header>
      {tiers.length === 0 && <p className="muted small">Este producto no está en esta lista.</p>}
      {tiers.length > 0 && (
        <div className="tier-table" role="table">
          <div className="tier-row tier-head" role="row"><span>Desde (u.)</span><span>Hasta (u.)</span><span>Precio final {list.currency}</span><span>Neto + IVA</span><span /></div>
          {tiers.map((tier, index) => (
            <div className="tier-row" role="row" key={tier.id || `n${index}`}>
              <input aria-label="Desde" inputMode="numeric" value={tier.from} onChange={(event) => set(index, "from", event.target.value)} />
              <input aria-label="Hasta" inputMode="numeric" placeholder="sin tope" value={tier.to} onChange={(event) => set(index, "to", event.target.value)} />
              <input aria-label="Precio final" inputMode="decimal" value={tier.amount} onChange={(event) => set(index, "amount", event.target.value)} />
              <span className="muted small">{usd(Number(String(tier.amount).replace(",", ".")) / (1 + vat))}</span>
              <button type="button" className="danger-link" aria-label="Quitar tramo" onClick={() => setTiers((current) => current.filter((_, at) => at !== index))}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="panel-head-actions">
        <button type="button" className="secondary" onClick={() => setTiers((current) => [...current, { from: current.length ? String((Number(current[current.length - 1].to) || Number(current[current.length - 1].from)) + 1) : "1", to: "", amount: "" }])}><Plus size={14} /> {tiers.length ? "Tramo por cantidad" : "Agregar a esta lista"}</button>
        <button type="button" className="primary" onClick={save}><Save size={14} /> Guardar</button>
      </div>
      {status && <p className="form-notice">{status}</p>}
    </article>
  );
}

function Prices({ supabase, who }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [variant, setVariant] = useState(null);
  const [lists, setLists] = useState([]);
  const [prices, setPrices] = useState(null);
  const [reference, setReference] = useState(null);
  const [rare, setRare] = useState(null); // null = filtro apagado; { loading } o { rows }
  const [dollar, setDollar] = useState(null);
  useEffect(() => { loadDollar().then(setDollar).catch(() => {}); }, []);
  useEffect(() => { supabase.from("price_lists").select("id,name,brand,currency,vat_rate,valid_from,valid_until,status").eq("status", "vigente").order("valid_from").then(({ data }) => setLists(data || [])); }, [supabase]);
  async function pageAll(build) {
    const all = [];
    for (let from = 0; from < 10000; from += 1000) {
      const { data, error } = await build().range(from, from + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return all;
  }
  // Filtro «precios raros»: productos cuya lista minorista no cierra con Mercado Libre o Shopify.
  async function showRare() {
    if (rare) { setRare(null); return; }
    setRare({ loading: true }); setResults(null); setVariant(null);
    try {
      const rate = dollar?.rate || (await loadDollar().catch(() => null))?.rate;
      if (!rate) { setRare({ rows: [], error: "No se pudo leer el dólar BNA: sin él no se puede comparar." }); return; }
      const retailIds = lists.filter((list) => !isWholesaleList(list)).map((list) => list.id);
      const [variants, prices, mlItems, shopVariants] = await Promise.all([
        pageAll(() => supabase.from("catalog_variants").select("id,sku,name,product_id").eq("active", true).order("id")),
        pageAll(() => supabase.from("variant_prices").select("variant_id,price_list_id,min_quantity,amount,status").in("price_list_id", retailIds).eq("min_quantity", 1).order("id")),
        pageAll(() => supabase.from("ml_items").select("sku,variation_skus,status,price,permalink,title,sold_quantity").eq("status", "active").order("id")),
        pageAll(() => supabase.from("shopify_variants").select("sku,price,compare_at_price").order("sku")),
      ]);
      setRare({ rows: rareList({ variants, prices, lists, mlItems, shopVariants, rate }), rate });
    } catch (failed) { setRare({ rows: [], error: `No se pudo calcular: ${failed.message || failed}` }); }
  }
  function downloadRare() {
    const lines = [["SKU", "Producto", "Lista", "Precio lista USD", "Lista en pesos", "Canal", "Precio en el canal", "Veces"].join(";"),
      ...rare.rows.map((row) => [row.variant.sku, row.variant.name, row.list, usd(row.gross), Math.round(row.listArs), row.channel, Math.round(row.price), String(row.ratio).replace(".", ",")].map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`).join(";"))];
    const blob = new Blob([`\ufeff${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `precios-raros-${arToday()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
  async function search(event) {
    event.preventDefault();
    setRare(null);
    setResults(await searchVariants(supabase, query));
  }
  async function loadPrices(target = variant) {
    if (!target) return;
    const { data } = await supabase.from("variant_prices").select("id,price_list_id,variant_id,min_quantity,max_quantity,amount,status,override_reason").eq("variant_id", target.id);
    setPrices(data || []);
    try { setReference(await loadLineData(supabase, target, lists)); } catch { setReference(null); }
  }
  async function pick(item) {
    setVariant(item); setPrices(null); setReference(null);
    await loadPrices(item);
  }
  const brand = String(variant?.brand || "").toLowerCase();
  // Se muestran la lista general (minorista) y las mayoristas de la marca del producto, más cualquiera donde ya tenga precio.
  const shown = variant && prices ? tiersByList(prices, lists).filter(({ list, rows }) => rows.length || !isWholesaleList(list) || (brand && String(list.brand || "").toLowerCase() === brand)) : [];
  return (
    <div className="content-stack">
      <form className="search price-search" onSubmit={search}>
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o SKU (ej. PU-46, resina epoxi 1 kg)" aria-label="Buscar producto" />
        <button type="submit" className="secondary">Buscar</button>
        <button type="button" className={rare ? "primary" : "secondary"} aria-pressed={Boolean(rare)} onClick={showRare}>⚠ Solo precios raros{rare?.rows ? ` (${rare.rows.length})` : ""}</button>
      </form>
      {rare && !variant && (
        <section className="panel rare-prices">
          {rare.loading ? <p className="muted">Comparando la lista con Mercado Libre y Shopify…</p> : rare.error ? <p className="form-notice">{rare.error}</p> : rare.rows.length === 0 ? <p className="muted">No hay precios raros: la lista cierra con Mercado Libre y Shopify.</p> : (
            <>
              <div className="panel-head">
                <p className="muted small">{rare.rows.length} productos con la lista minorista (desde 1 u.) a menos de la mitad o a más de 2,5 veces de Mercado Libre o Shopify, al dólar BNA {ars(rare.rate)}. Casi siempre es un precio viejo o un SKU que en el canal es otro tamaño o pack. Tocá uno para corregirlo.</p>
                <button type="button" className="secondary" onClick={downloadRare}>Descargar (CSV)</button>
              </div>
              <div className="rare-table" role="table">
                <div className="rare-row rare-head" role="row"><span>Producto</span><span>Lista</span><span>Canal</span><span>Veces</span></div>
                {rare.rows.map((row) => (
                  <button type="button" className="rare-row" role="row" key={row.variant.id} onClick={() => pick(row.variant)}>
                    <span><strong>{row.variant.sku}</strong> <span className="muted small">{row.variant.name}</span></span>
                    <span className="small">USD {usd(row.gross)}<br /><span className="muted">{ars(row.listArs)}</span></span>
                    <span className="small">{row.channel}<br />{ars(row.price)}</span>
                    <span className={`badge ${row.ratio > 1 ? "warn" : "danger"}`}>{String(row.ratio).replace(".", ",")}×</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      )}
      {results && !variant && (results.length === 0 ? <p className="muted">No encontré productos con eso.</p> : (
        <ul className="price-results">
          {results.map((item) => <li key={item.id}><button type="button" className="link-button" onClick={() => pick(item)}>{item.name}</button> <span className="muted small">{item.sku} · {item.brand}</span></li>)}
        </ul>
      ))}
      {variant && (
        <section className="panel">
          <div className="panel-head">
            <div><span className="eyebrow">{variant.brand || "Producto"} · {variant.sku}</span><h2>{variant.name}</h2></div>
            <button type="button" className="secondary" onClick={() => { setVariant(null); setPrices(null); }}>Elegir otro</button>
          </div>
          {reference && (
            <p className="quote-refs small">
              {reference.refs?.ml ? <a href={reference.refs.ml.permalink} target="_blank" rel="noreferrer">Mercado Libre {ars(reference.refs.ml.price)}</a> : <span className="muted">Sin publicación activa en ML</span>}
              {reference.refs?.shopify ? <span>Shopify {ars(reference.refs.shopify.price)}</span> : null}
              {(() => { const rare = rarePrice(reference, dollar?.rate); return rare ? <span className="quote-warn">⚠ Precio raro: {rare.channel} {ars(rare.price)} contra la lista minorista {ars(rare.listArs)} ({String(rare.ratio).replace(".", ",")} veces). Revisá el precio o si el SKU es de otro tamaño o pack.</span> : null; })()}
              {dollar?.rate ? <span className="muted">Dólar BNA {ars(dollar.rate)}</span> : null}
            </p>
          )}
          {prices === null ? <p className="muted">Cargando precios…</p> : shown.map((entry) => <TierEditor key={entry.list.id} supabase={supabase} entry={entry} variant={variant} who={who} onSaved={() => loadPrices()} />)}
        </section>
      )}
    </div>
  );
}

function Payments({ supabase }) {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("");
  const load = () => supabase.from("payment_policies").select("id,name,customer_text,discount_percent,surcharge_percent,active,sort_order").order("sort_order").then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [supabase]);
  const set = (id, key, value) => setRows((current) => current.map((row) => (row.id === id ? { ...row, [key]: value } : row)));
  async function save(row) {
    const { payment, error } = validatePayment(row);
    if (error) { setStatus(error); return; }
    try {
      const { error: failed } = row.isNew
        ? await supabase.from("payment_policies").insert({ id: row.id, ...payment, sort_order: (rows.length + 1) * 10 })
        : await supabase.from("payment_policies").update(payment).eq("id", row.id);
      if (failed) throw failed;
      setStatus(`${payment.name}: ${savedText()}`);
      if (!readOnly()) load(); else set(row.id, "isNew", false);
    } catch (failed) { setStatus(`No se pudo guardar: ${failed.message || failed}`); }
  }
  if (rows === null) return <p className="muted">Cargando…</p>;
  return (
    <section className="panel">
      <p className="muted small">El descuento o recargo se aplica al total de la cotización. El texto es lo que lee el cliente.</p>
      <div className="condition-list">
        {rows.map((row) => (
          <div className="condition-row" key={row.id}>
            <label>Nombre<input value={row.name} onChange={(event) => set(row.id, "name", event.target.value)} /></label>
            <label>Descuento %<input inputMode="decimal" value={row.discount_percent} onChange={(event) => set(row.id, "discount_percent", event.target.value)} /></label>
            <label>Recargo %<input inputMode="decimal" value={row.surcharge_percent} onChange={(event) => set(row.id, "surcharge_percent", event.target.value)} /></label>
            <label className="wide">Texto para el cliente<input value={row.customer_text || ""} onChange={(event) => set(row.id, "customer_text", event.target.value)} /></label>
            <label className="check"><input type="checkbox" checked={row.active !== false} onChange={(event) => set(row.id, "active", event.target.checked)} /> Activa</label>
            <button type="button" className="primary" onClick={() => save(row)}><Save size={14} /> Guardar</button>
          </div>
        ))}
      </div>
      <button type="button" className="secondary" onClick={() => setRows((current) => [...current, { id: `pago-${Date.now().toString(36)}`, name: "", customer_text: "", discount_percent: 0, surcharge_percent: 0, active: true, isNew: true }])}><Plus size={14} /> Nueva forma de pago</button>
      {status && <p className="form-notice">{status}</p>}
    </section>
  );
}

function Minimums({ supabase, who }) {
  const [rows, setRows] = useState(null);
  const [status, setStatus] = useState("");
  const load = () => supabase.from("wholesale_order_policies").select("id,brand,threshold_net_usd,mix_products,active").order("brand").then(({ data }) => setRows(data || []));
  useEffect(() => { load(); }, [supabase]);
  const set = (key, field, value) => setRows((current) => current.map((row, index) => ((row.id || `n${index}`) === key ? { ...row, [field]: value } : row)));
  async function save(row) {
    const { minimum, error } = validateMinimum(row);
    if (error) { setStatus(error); return; }
    try {
      const fields = { ...minimum, vat_rate: 0.21, updated_by_email: who, updated_at: new Date().toISOString() };
      const { error: failed } = row.id ? await supabase.from("wholesale_order_policies").update(fields).eq("id", row.id) : await supabase.from("wholesale_order_policies").insert(fields);
      if (failed) throw failed;
      setStatus(`${minimum.brand}: ${savedText()}`);
      if (!readOnly()) load();
    } catch (failed) { setStatus(`No se pudo guardar: ${failed.message || failed}`); }
  }
  if (rows === null) return <p className="muted">Cargando…</p>;
  return (
    <section className="panel">
      <p className="muted small">Mínimo de compra mayorista por marca, en USD neto (sin IVA). Si la cotización mayorista no llega, el cotizador lo avisa.</p>
      <div className="condition-list">
        {rows.map((row, index) => {
          const key = row.id || `n${index}`;
          return (
            <div className="condition-row" key={key}>
              <label>Marca<input value={row.brand} onChange={(event) => set(key, "brand", event.target.value)} /></label>
              <label>Mínimo USD neto<input inputMode="decimal" value={row.threshold_net_usd} onChange={(event) => set(key, "threshold_net_usd", event.target.value)} /></label>
              <label className="check"><input type="checkbox" checked={row.mix_products !== false} onChange={(event) => set(key, "mix_products", event.target.checked)} /> Suma productos distintos de la marca</label>
              <label className="check"><input type="checkbox" checked={row.active !== false} onChange={(event) => set(key, "active", event.target.checked)} /> Activo</label>
              <button type="button" className="primary" onClick={() => save(row)}><Save size={14} /> Guardar</button>
            </div>
          );
        })}
      </div>
      <button type="button" className="secondary" onClick={() => setRows((current) => [...current, { brand: "", threshold_net_usd: "", mix_products: true, active: true }])}><Plus size={14} /> Nuevo mínimo por marca</button>
      {status && <p className="form-notice">{status}</p>}
    </section>
  );
}

function Bulk({ supabase, who }) {
  const [lists, setLists] = useState([]);
  const [form, setForm] = useState({ list: "", filter: "", percent: "" });
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState("");
  useEffect(() => { supabase.from("price_lists").select("id,name,brand,currency,status").eq("status", "vigente").order("valid_from").then(({ data }) => setLists(data || [])); }, [supabase]);
  async function loadRows() {
    const all = [];
    for (let from = 0; from < 6000; from += 1000) {
      const { data, error } = await supabase.from("variant_prices").select("*").eq("price_list_id", form.list).in("status", ["confirmado", "excepcion_manual"]).order("id").range(from, from + 999);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    if (!form.filter.trim()) return all;
    const word = form.filter.trim();
    const { data: products } = await supabase.from("catalog_products").select("id").or(`brand.ilike.%${word}%,family.ilike.%${word}%,name.ilike.%${word}%`).limit(1000);
    const productIds = (products || []).map((row) => row.id);
    if (!productIds.length) return [];
    const variantIds = new Set();
    for (let index = 0; index < productIds.length; index += 200) {
      const { data } = await supabase.from("catalog_variants").select("id").in("product_id", productIds.slice(index, index + 200));
      for (const row of data || []) variantIds.add(row.id);
    }
    return all.filter((row) => variantIds.has(row.variant_id));
  }
  async function showPreview() {
    if (!form.list) { setStatus("Elegí la lista."); return; }
    setStatus("Calculando…"); setPreview(null);
    try {
      const rows = await loadRows();
      const result = bulkChange(rows, form.percent, { who, today: arToday() });
      if (result.error) { setStatus(result.error); return; }
      const sample = result.rows.slice(0, 12);
      const { data: names } = sample.length ? await supabase.from("catalog_variants").select("id,name,sku").in("id", sample.map((row) => row.variant_id)) : { data: [] };
      const byId = new Map((names || []).map((row) => [row.id, row]));
      setPreview({ ...result, sample: sample.map((row) => ({ ...row, name: byId.get(row.variant_id)?.name || "", sku: byId.get(row.variant_id)?.sku || "" })) });
      setStatus(result.rows.length ? "" : "No hay precios para cambiar con ese filtro.");
    } catch (failed) { setStatus(`No se pudo leer: ${failed.message || failed}`); }
  }
  async function apply() {
    if (!preview?.rows.length) return;
    if (!window.confirm(`Se ${preview.pct > 0 ? "suben" : "bajan"} ${Math.abs(preview.pct)} % ${preview.rows.length} precios. ¿Seguimos?`)) return;
    setStatus("Guardando…");
    try {
      for (let index = 0; index < preview.rows.length; index += 200) {
        const chunk = preview.rows.slice(index, index + 200).map(({ _before, ...row }) => row);
        const { error } = await supabase.from("variant_prices").upsert(chunk, { onConflict: "id" });
        if (error) throw error;
      }
      setStatus(`${preview.rows.length} precios: ${savedText()}`);
      setPreview(null);
    } catch (failed) { setStatus(`No se pudo guardar: ${failed.message || failed}. Lo que ya se guardó queda anotado en cada precio.`); }
  }
  return (
    <section className="panel">
      <p className="muted small">Sube o baja un porcentaje todos los precios de una lista, o solo los de una marca o familia. Primero ves cómo quedaría; nada cambia hasta que tocás «Aplicar». Cada precio queda con el anterior anotado.</p>
      <div className="condition-row">
        <label>Lista<select value={form.list} onChange={(event) => { setForm({ ...form, list: event.target.value }); setPreview(null); }}><option value="">Elegí una lista</option>{lists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</select></label>
        <label>Marca o familia (opcional)<input value={form.filter} onChange={(event) => { setForm({ ...form, filter: event.target.value }); setPreview(null); }} placeholder="ej. Penosil, Resinplast" /></label>
        <label>Cambio %<input inputMode="decimal" value={form.percent} onChange={(event) => { setForm({ ...form, percent: event.target.value }); setPreview(null); }} placeholder="8 o -5" /></label>
        <button type="button" className="secondary" onClick={showPreview}>Ver cómo quedaría</button>
      </div>
      {status && <p className="form-notice">{status}</p>}
      {preview && preview.rows.length > 0 && (
        <>
          <p className="small"><strong>{preview.rows.length} precios</strong> {preview.pct > 0 ? "suben" : "bajan"} {Math.abs(preview.pct)} %. Algunos ejemplos:</p>
          <div className="tier-table">
            <div className="tier-row tier-head"><span>SKU</span><span>Desde</span><span>Antes → después</span><span>Producto</span><span /></div>
            {preview.sample.map((row) => <div className="tier-row" key={row.id}><span className="small">{row.sku}</span><span className="small">{Number(row.min_quantity)} u.</span><span className="small">{usd(row._before)} → <strong>{usd(row.amount)}</strong></span><span className="muted small">{row.name}</span><span /></div>)}
          </div>
          <button type="button" className="primary" onClick={apply}><Save size={14} /> Aplicar a {preview.rows.length} precios</button>
        </>
      )}
    </section>
  );
}

const SECTIONS = [["precios", "Precios por producto"], ["lote", "Cambio por lote"], ["pagos", "Formas de pago"], ["minimos", "Mínimos mayoristas"]];

export function PriceAdmin({ supabase, who = "" }) {
  const [section, setSection] = useState("precios");
  return (
    <div className="content-stack price-admin">
      {readOnly() && <p className="form-notice">Link de prueba: podés tocar todo y ver cómo quedaría, pero no se guarda nada.</p>}
      <div className="segmented" role="tablist" aria-label="Precios y condiciones">
        {SECTIONS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? "selected" : ""} onClick={() => setSection(id)}>{label}</button>)}
      </div>
      {section === "precios" && <Prices supabase={supabase} who={who} />}
      {section === "lote" && <Bulk supabase={supabase} who={who} />}
      {section === "pagos" && <Payments supabase={supabase} />}
      {section === "minimos" && <Minimums supabase={supabase} who={who} />}
    </div>
  );
}
