import { useEffect, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { adminFetch } from "./admin-api.mjs";
import { RESTOCK_DAYS, economicsView } from "./ml-economics-view.mjs";
import { loadEconomics } from "./ml-economics-data.js";

// Ventas → Mercado Libre → "Stock y ganancia" (23/10): qué reponer y cuánto queda de cada venta después de
// Mercado Libre, contra el precio de lista del cotizador. Solo lee ML; el costo por unidad lo carga Felipe.
const money = (value) => (typeof value === "number" ? `$ ${Math.round(value).toLocaleString("es-AR")}` : "—");
const pct = (value) => (value == null ? "—" : `${value.toLocaleString("es-AR")} %`);
const SHOW = 30;

function Title({ item, nickname }) {
  return <><a href={item.permalink} target="_blank" rel="noreferrer">{String(item.title || item.id).slice(0, 60)} <ExternalLink size={11} /></a><div className="muted small">{nickname[item.seller_id] || "cuenta"}</div></>;
}

function CostCell({ row, isAdmin, session, onSaved }) {
  const [value, setValue] = useState(row.cost == null ? "" : String(row.cost));
  const [state, setState] = useState("");
  if (!isAdmin) return row.cost == null ? <span className="muted small">—</span> : money(row.cost);
  async function save() {
    setState("…");
    const response = await adminFetch({ action: "mercadolibre", op: "economics-cost", id: row.item.id, unitCost: value.trim() }, session?.access_token).catch(() => null);
    setState(response?.ok ? "✓" : "error");
    if (response?.ok) onSaved(row.item.id, value.trim() === "" ? null : Number(value.replace(/\./g, "").replace(",", ".")));
  }
  return (
    <span className="ml-cost">
      <input inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => { if (value !== (row.cost == null ? "" : String(row.cost))) save(); }} placeholder="costo + IVA" aria-label={`Costo de ${row.item.title}`} />
      {state && <span className="muted small">{state}</span>}
    </span>
  );
}

export function MlEconomics({ supabase, session, isAdmin, items = [], seller = "", nickname = {} }) {
  const [state, setState] = useState({ status: "loading", economics: [], skus: {}, listPrices: {} });
  const [shown, setShown] = useState(SHOW);
  useEffect(() => {
    let alive = true;
    loadEconomics(supabase)
      .then((data) => { if (alive) setState({ status: "ready", ...data }); })
      .catch((error) => { if (alive) setState({ status: /ml_item_economics|does not exist|schema cache/i.test(String(error?.message || "")) ? "missing" : "error", economics: [], skus: {}, listPrices: {} }); });
    return () => { alive = false; };
  }, [supabase]);
  const view = useMemo(() => economicsView({ items, economics: state.economics, listPrices: state.listPrices, skus: state.skus, seller }), [items, state, seller]);
  function onSaved(id, cost) { setState((current) => ({ ...current, economics: current.economics.some((row) => row.id === id) ? current.economics.map((row) => (row.id === id ? { ...row, unit_cost: cost } : row)) : [...current.economics, { id, unit_cost: cost }] })); }

  if (state.status === "loading") return <p className="muted" role="status">Calculando stock y ganancia…</p>;
  if (state.status === "missing") return <p className="muted">Falta un paso: pegar en Supabase el SQL de docs/SQL_PENDIENTE_2026-10-23.md. Después tocá "Actualizar todo" en Más → Datos → Mercado Libre.</p>;
  if (state.status === "error") return <p className="muted">No se pudo leer stock y ganancia.</p>;
  const { totals } = view;
  return (
    <div className="content-stack">
      <section className="panel">
        <div className="panel-head"><div>
          <span className="eyebrow">Últimos 30 días · precios finales con IVA</span>
          <h2>Cuánto queda de cada venta</h2>
          <p className="muted small">Facturado {money(totals.revenue)} · comisiones de Mercado Libre {money(totals.fees)} · envíos {money(totals.shipping)} ({totals.withShipping} de {totals.selling} publicaciones con envío medido) · <strong>queda {money(totals.net)}</strong>. La comisión es la real de cada venta; el envío sale de una venta de muestra. Se actualiza con las métricas (cada día, con "Actualizar resumen" en el Resumen o con "Actualizar todo" en Más → Datos → Mercado Libre).</p>
        </div></div>
        {totals.selling === 0 && <p className="muted">Todavía no hay ventas calculadas: tocá "Actualizar todo" en Más → Datos → Mercado Libre. Si dice que falta permiso de ventas, hay que reconectar la cuenta.</p>}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Para reponer ({view.restock.length})</h2><p className="muted small">Sin stock con ventas, o el stock alcanza {RESTOCK_DAYS} días o menos al ritmo de los últimos 30 días.</p></div></div>
        {view.restock.length === 0 ? <p className="muted">Nada para reponer por ahora.</p> : (
          <div className="table-scroll"><table className="sales-history-table">
            <thead><tr><th>Publicación</th><th>Stock</th><th>Vende por día</th><th>Alcanza</th></tr></thead>
            <tbody>{view.restock.map((row) => <tr key={row.item.id}><td><Title item={row.item} nickname={nickname} /></td><td>{row.stock ?? "—"}</td><td>{row.perDay.toLocaleString("es-AR")}</td><td><strong>{row.restock}</strong></td></tr>)}</tbody>
          </table></div>
        )}
      </section>

      <section className="panel">
        <div className="panel-head"><div><h2>Ganancia por publicación ({view.selling.length})</h2><p className="muted small">Lo que queda por unidad después de comisión y envío, contra el precio de lista vigente del cotizador (por SKU, lista minorista desde 1 unidad). Si cargás el costo por unidad (+ IVA), se calcula el margen + IVA.</p></div></div>
        {view.selling.length === 0 ? <p className="muted">Sin ventas en 30 días.</p> : (
          <div className="table-scroll"><table className="sales-history-table">
            <thead><tr><th>Publicación</th><th>Vendidas</th><th>Precio</th><th>Comisión</th><th>Envío</th><th>Queda</th><th>Lista</th><th>Costo</th><th>Margen + IVA</th></tr></thead>
            <tbody>{view.selling.slice(0, shown).map((row) => (
              <tr key={row.item.id}>
                <td><Title item={row.item} nickname={nickname} /></td>
                <td>{row.units}</td>
                <td>{money(row.unitPrice)}</td>
                <td>{money(row.feePerUnit)}<div className="muted small">{pct(row.feePct)}</div></td>
                <td>{row.shipping == null ? <span className="muted small">sin medir</span> : money(row.shipping)}</td>
                <td><strong>{money(row.net)}</strong><div className="muted small">{pct(row.netPct)}</div></td>
                <td>{row.list ? <>{money(row.list.gross)}<div className={`small ${row.vsList < 0 ? "ml-below" : "muted"}`}>{row.vsList > 0 ? "+" : ""}{pct(row.vsList)}</div></> : <span className="muted small">{row.sku ? "sin precio" : "sin SKU"}</span>}</td>
                <td><CostCell row={row} isAdmin={isAdmin} session={session} onSaved={onSaved} /></td>
                <td>{row.margin == null ? "—" : <>{money(row.margin)}<div className="muted small">{pct(row.marginPct)}</div></>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        {view.selling.length > shown && <button type="button" className="secondary" onClick={() => setShown((count) => count + SHOW)}>Ver {Math.min(SHOW, view.selling.length - shown)} más ({shown} de {view.selling.length})</button>}
      </section>
    </div>
  );
}
