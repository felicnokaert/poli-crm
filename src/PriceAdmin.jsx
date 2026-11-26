import { useEffect, useState } from "react";
import { Plus, Save, Search, Trash2 } from "lucide-react";
import { searchVariants } from "./QuoteBuilder.jsx";
import { diffTiers, isWholesaleList, tiersByList, validateMinimum, validatePayment, validateTiers } from "./price-admin.mjs";
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
  useEffect(() => { supabase.from("price_lists").select("id,name,brand,currency,vat_rate,valid_from,valid_until,status").eq("status", "vigente").order("valid_from").then(({ data }) => setLists(data || [])); }, [supabase]);
  async function search(event) {
    event.preventDefault();
    setResults(await searchVariants(supabase, query));
  }
  async function loadPrices(target = variant) {
    if (!target) return;
    const { data } = await supabase.from("variant_prices").select("id,price_list_id,variant_id,min_quantity,max_quantity,amount,status,override_reason").eq("variant_id", target.id);
    setPrices(data || []);
  }
  async function pick(item) {
    setVariant(item); setPrices(null);
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
      </form>
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

const SECTIONS = [["precios", "Precios por producto"], ["pagos", "Formas de pago"], ["minimos", "Mínimos mayoristas"]];

export function PriceAdmin({ supabase, who = "" }) {
  const [section, setSection] = useState("precios");
  return (
    <div className="content-stack price-admin">
      {readOnly() && <p className="form-notice">Link de prueba: podés tocar todo y ver cómo quedaría, pero no se guarda nada.</p>}
      <div className="segmented" role="tablist" aria-label="Precios y condiciones">
        {SECTIONS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? "selected" : ""} onClick={() => setSection(id)}>{label}</button>)}
      </div>
      {section === "precios" && <Prices supabase={supabase} who={who} />}
      {section === "pagos" && <Payments supabase={supabase} />}
      {section === "minimos" && <Minimums supabase={supabase} who={who} />}
    </div>
  );
}
