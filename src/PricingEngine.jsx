import { useEffect, useMemo, useState } from "react";
import { Calculator, Plus, Save, Search, Trash2 } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { Pager, usePaged } from "./Pager.jsx";
import { loadLineData, searchVariants } from "./QuoteBuilder.jsx";
import { loadDollar } from "./product-hub-data.js";
import { ars, pickRow, rarePrice } from "./quote-model.mjs";
import { CLIENT_TYPES, DEFAULT_PARAMS, cleanParams, clientTypeFrom, compareWithList, computePrice, findClientByCuit, normCuit, parseCostPaste } from "./pricing-engine.mjs";

// Motor de precios (27/11, idea de Juan). Calculadora para todo el equipo (dentro del cotizador) y, para administración,
// Diego, Juan y David, los parámetros y los costos. El costo y el margen nunca se muestran a quien no maneja precios:
// el servidor le devuelve solo el precio final (lib/pricing-engine.mjs).
const usd = (value) => (Number.isFinite(Number(value)) ? `USD ${Number(value).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "");
const readOnly = () => Boolean(globalThis.window?.__poliplastReadOnly);

async function call(body) {
  const response = await adminFetch({ action: "pricing-engine", ...body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

export function usePricingState() {
  const [state, setState] = useState(null);
  const reload = () => call({ op: "get" }).then(setState).catch((error) => setState({ error: error.message, params: cleanParams(DEFAULT_PARAMS), costs: {}, editor: false }));
  useEffect(() => { reload(); }, []);
  return [state, setState, reload];
}

export function PriceCalculator({ supabase, clients = [], state, draftParams = null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [variant, setVariant] = useState(null);
  const [line, setLine] = useState(null);
  const [cuit, setCuit] = useState("");
  const [found, setFound] = useState(null);
  const [clientType, setClientType] = useState("consumidor");
  const [quantity, setQuantity] = useState("1");
  const [payments, setPayments] = useState([]);
  const [paymentId, setPaymentId] = useState("");
  const [lists, setLists] = useState([]);
  const [dollar, setDollar] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { loadDollar().then(setDollar).catch(() => {}); }, []);
  useEffect(() => {
    supabase.from("payment_policies").select("id,name,discount_percent,surcharge_percent,active,sort_order").eq("active", true).order("sort_order").then(({ data }) => setPayments(data || []));
    supabase.from("price_lists").select("id,name,currency,vat_rate,valid_from,valid_until,status").then(({ data }) => setLists(data || []));
  }, [supabase]);

  async function find(event) {
    event?.preventDefault();
    setResults(await searchVariants(supabase, query).catch(() => []));
  }
  async function pick(next) {
    setVariant(next); setResults(null); setResult(null); setLine(null);
    setLine(await loadLineData(supabase, next, lists).catch(() => null));
  }
  async function lookCuit(value) {
    setCuit(value);
    const key = normCuit(value);
    if (key.length < 11) { setFound(null); return; }
    const crm = findClientByCuit(clients, key);
    let billing = null;
    try {
      const { data } = await supabase.from("contabilium_clientes").select("razon_social,cuit,company").ilike("cuit", `%${key.slice(-8)}%`).limit(5);
      billing = (data || []).find((row) => normCuit(row.cuit) === key) || null;
    } catch { billing = null; }
    const type = crm ? clientTypeFrom(crm) : null;
    setFound({ name: crm?.name || billing?.razon_social || "", crm: Boolean(crm), billing: Boolean(billing), type });
    if (type) setClientType(type);
  }
  async function calculate() {
    if (!variant) return;
    setBusy(true);
    const payment = payments.find((row) => row.id === paymentId) || null;
    const product = { name: variant.name, family: variant.family, brand: variant.brand };
    try {
      if (state?.editor && state.costs) {
        setResult(computePrice({ cost: state.costs[String(variant.sku || "").toUpperCase()]?.usd, product, clientType, quantity, payment, params: draftParams || state.params }));
      } else {
        const data = await call({ op: "quote", sku: variant.sku, product, clientType, quantity, payment });
        setResult(data.result);
      }
    } catch (error) { setResult({ error: error.message }); }
    setBusy(false);
  }

  const listRow = line ? pickRow(line.rows, "minorista", Number(quantity) || 1) : null;
  const versus = result && !result.error ? compareWithList(result, listRow) : null;
  // Mismo aviso que el cotizador: el precio del motor (como si fuera la lista minorista) contra ML y Shopify.
  const rare = result && !result.error && line && dollar?.rate ? rarePrice({ rows: [{ from: 1, to: null, wholesale: false, gross: result.gross, net: result.net }], refs: line.refs }, dollar.rate) : null;

  return (
    <section className="panel pricing-calculator">
      <h3><Calculator size={16} /> Calcular precio</h3>
      {(state?.params?.example ?? true) && <p className="form-notice">Los parámetros son de ejemplo (a confirmar con Juan): el precio sirve para probar, no para pasarlo a un cliente.</p>}
      <form className="condition-row" onSubmit={find}>
        <label className="wide">Producto o SKU<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ej. 618, PoxiPlast, RE-608" /></label>
        <button type="submit" className="secondary"><Search size={14} /> Buscar</button>
      </form>
      {results && (results.length ? (
        <ul className="pricing-results">{results.map((row) => <li key={row.id}><button type="button" className="link-button" onClick={() => pick(row)}>{row.name}{row.sku ? ` · ${row.sku}` : ""}</button></li>)}</ul>
      ) : <p className="muted small">No encontré ese producto en el catálogo.</p>)}
      {variant && <p><strong>{variant.name}</strong>{variant.sku ? ` · ${variant.sku}` : ""}{variant.family ? <span className="muted small"> · {variant.family}</span> : null}</p>}
      <div className="condition-row">
        <label>CUIT del cliente<input inputMode="numeric" value={cuit} onChange={(event) => lookCuit(event.target.value)} placeholder="Opcional" /></label>
        <label>Tipo de cliente<select value={clientType} onChange={(event) => setClientType(event.target.value)}>{CLIENT_TYPES.map((type) => <option key={type.id} value={type.id}>{type.label}</option>)}</select></label>
        <label>Cantidad<input inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></label>
        <label>Forma de pago<select value={paymentId} onChange={(event) => setPaymentId(event.target.value)}><option value="">Sin elegir</option>{payments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <button type="button" className="primary" disabled={!variant || busy} onClick={calculate}><Calculator size={14} /> {busy ? "Calculando…" : "Calcular"}</button>
      </div>
      {found && <p className="muted small">{found.name ? `${found.name} · ` : ""}{found.crm ? "está en la cartera" : found.billing ? "está en Contabilium" : "no lo encontré: elegí el tipo a mano"}{found.type ? ` · tipo: ${CLIENT_TYPES.find((type) => type.id === found.type)?.label}` : found.name ? " · el tipo no figura: elegilo a mano" : ""}</p>}
      {result?.error && <p className="form-notice">{result.error}</p>}
      {result && !result.error && (
        <div className="pricing-result">
          <p><strong>{usd(result.gross)} por unidad</strong> (IVA {result.vat} % incluido; neto {usd(result.net)}){dollar?.rate ? ` · ${ars(result.gross * dollar.rate)} al dólar BNA` : ""}</p>
          {result.quantity > 1 && <p className="muted small">Total por {result.quantity}: {usd(result.totalGross)}{dollar?.rate ? ` · ${ars(result.totalGross * dollar.rate)}` : ""}</p>}
          <ol className="small">{result.steps.map((step, index) => <li key={index}>{step.label}{step.value !== undefined ? ` → ${usd(step.value)}` : ""}</li>)}</ol>
          {result.markupOverCost !== undefined && <p className="muted small">Sobre el costo: {result.markupOverCost > 0 ? "+" : ""}{result.markupOverCost} %.</p>}
          {versus && <p className="muted small">Lista minorista vigente: {usd(versus.listNet)} neto · el motor da {versus.diffPercent > 0 ? "+" : ""}{versus.diffPercent} %.</p>}
          {line?.refs?.ml && <p className="muted small">Mercado Libre: {ars(line.refs.ml.price)}{line.refs.shopify ? ` · Shopify: ${ars(line.refs.shopify.price)}` : ""}</p>}
          {rare && <p className="form-notice">⚠ Precio raro: en {rare.channel} sale {ars(rare.price)}, {rare.ratio} veces lo que da el motor en pesos.</p>}
        </div>
      )}
    </section>
  );
}

function ParamsEditor({ params, onChange, onSave, status }) {
  const set = (key, value) => onChange({ ...params, [key]: value });
  const setRow = (key, index, field, value) => set(key, params[key].map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  return (
    <section className="panel">
      <h3>Parámetros {params.example && <span className="muted small">(de ejemplo, a confirmar con Juan)</span>}</h3>
      <p className="muted small">Orden: costo → margen de la familia o marca → tipo de cliente → cantidad → forma de pago → redondeo. Todo en USD sin IVA.</p>
      <div className="condition-row">
        <label>Margen general %<input inputMode="decimal" value={params.defaultMargin} onChange={(event) => set("defaultMargin", event.target.value)} /></label>
        <label>Redondear a USD<input inputMode="decimal" value={params.rounding} onChange={(event) => set("rounding", event.target.value)} /></label>
        <label>IVA %<input inputMode="decimal" value={params.vat} onChange={(event) => set("vat", event.target.value)} /></label>
      </div>
      <h4>Margen por familia o marca</h4>
      {params.margins.map((row, index) => (
        <div className="condition-row" key={index}>
          <label className="wide">Si la familia, marca o producto dice<input value={row.match} onChange={(event) => setRow("margins", index, "match", event.target.value)} /></label>
          <label>Margen %<input inputMode="decimal" value={row.margin} onChange={(event) => setRow("margins", index, "margin", event.target.value)} /></label>
          <button type="button" className="danger-link" onClick={() => set("margins", params.margins.filter((_, i) => i !== index))}><Trash2 size={14} /> Quitar</button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => set("margins", [...params.margins, { match: "", margin: params.defaultMargin }])}><Plus size={14} /> Agregar familia o marca</button>
      <h4>Ajuste por tipo de cliente</h4>
      <div className="condition-row">
        {CLIENT_TYPES.map((type) => <label key={type.id}>{type.label} %<input inputMode="decimal" value={params.clientAdjust[type.id]} onChange={(event) => set("clientAdjust", { ...params.clientAdjust, [type.id]: event.target.value })} /></label>)}
      </div>
      <h4>Descuento por cantidad</h4>
      {params.tiers.map((row, index) => (
        <div className="condition-row" key={index}>
          <label>Desde (unidades)<input inputMode="numeric" value={row.from} onChange={(event) => setRow("tiers", index, "from", event.target.value)} /></label>
          <label>Descuento %<input inputMode="decimal" value={row.percent} onChange={(event) => setRow("tiers", index, "percent", event.target.value)} /></label>
          {index > 0 && <button type="button" className="danger-link" onClick={() => set("tiers", params.tiers.filter((_, i) => i !== index))}><Trash2 size={14} /> Quitar</button>}
        </div>
      ))}
      <button type="button" className="secondary" onClick={() => set("tiers", [...params.tiers, { from: (Number(params.tiers.at(-1)?.from) || 1) * 2, percent: 0 }])}><Plus size={14} /> Agregar tramo</button>
      <p className="muted small">El descuento o recargo por forma de pago sale de la pestaña «Formas de pago» (el mismo que usa la cotización).</p>
      <button type="button" className="primary" onClick={onSave}><Save size={14} /> Guardar parámetros</button>
      {status && <p className="form-notice">{status}</p>}
    </section>
  );
}

function CostsEditor({ costs, onSaved }) {
  const [text, setText] = useState("");
  const [status, setStatus] = useState("");
  const entries = useMemo(() => Object.entries(costs || {}).sort((a, b) => a[0].localeCompare(b[0])), [costs]);
  const costsPaged = usePaged(entries, 25);
  async function save() {
    const { rows, errors } = parseCostPaste(text);
    if (!rows.length) { setStatus("Pegá renglones «SKU;costo en USD»."); return; }
    try {
      const data = await call({ op: "save-costs", rows });
      if (data.readOnly) { setStatus(`Link de prueba: se cargarían ${rows.length} costos, pero no se guardó.`); return; }
      onSaved(data.costs || {});
      setText("");
      setStatus(`Guardados ${rows.length} costos.${errors.length ? ` ${errors.length} renglones no se entendieron: ${errors.slice(0, 3).join(" · ")}` : ""}`);
    } catch (error) { setStatus(`No se pudo guardar: ${error.message}`); }
  }
  return (
    <section className="panel">
      <h3>Costos (los carga Diego)</h3>
      <p className="muted small">Un renglón por producto: SKU y costo en USD sin IVA, separados por punto y coma o tabulación (se puede pegar desde una planilla). Si el SKU ya tenía costo, se reemplaza.</p>
      <textarea rows={5} value={text} onChange={(event) => setText(event.target.value)} placeholder={"KT-618-20;180\nRE-608-750;9,40"} />
      <button type="button" className="primary" onClick={save}><Save size={14} /> Guardar costos</button>
      {status && <p className="form-notice">{status}</p>}
      <p className="muted small">{entries.length} productos con costo.</p>
      {entries.length > 0 && (
        <div className="table-scroll"><table><thead><tr><th scope="col">SKU</th><th scope="col">Costo USD</th><th scope="col">Cargó</th></tr></thead>
          <tbody>{costsPaged.rows.map(([sku, row]) => <tr key={sku}><td>{sku}</td><td>{usd(row.usd)}</td><td className="muted small">{String(row.by || "").split("@")[0]} {String(row.at || "").slice(0, 10)}</td></tr>)}</tbody></table></div>
      )}
      <Pager paged={costsPaged} label="costos" />
    </section>
  );
}

// Sección completa dentro de Precios y condiciones.
export function PricingEngine({ supabase, clients = [] }) {
  const [state, setState] = usePricingState();
  const [draft, setDraft] = useState(null);
  const [status, setStatus] = useState("");
  if (!state) return <p className="muted">Cargando…</p>;
  const params = draft || state.params;
  async function saveParams() {
    try {
      const data = await call({ op: "save-params", params: cleanParams({ ...params, example: false }) });
      if (data.readOnly) { setStatus("Link de prueba: así quedaría, pero no se guardó."); return; }
      setState({ ...state, params: data.params });
      setDraft(null);
      setStatus("Guardado: el motor ya usa estos parámetros.");
    } catch (error) { setStatus(`No se pudo guardar: ${error.message}`); }
  }
  return (
    <div className="content-stack">
      {state.error && <p className="form-notice">No se pudo leer el motor ({state.error}); se muestran los valores de ejemplo.</p>}
      {readOnly() && <p className="muted small">Link de prueba: podés cambiar parámetros y ver el cálculo, pero no se guardan.</p>}
      <PriceCalculator supabase={supabase} clients={clients} state={state} draftParams={draft ? cleanParams(draft) : null} />
      {state.editor ? (
        <>
          <ParamsEditor params={params} onChange={setDraft} onSave={saveParams} status={status} />
          <CostsEditor costs={state.costs} onSaved={(costs) => setState({ ...state, costs })} />
        </>
      ) : <p className="muted small">Los parámetros y los costos los manejan administración, Diego, Juan y David.</p>}
    </div>
  );
}
