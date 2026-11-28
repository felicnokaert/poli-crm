// Compras → «Qué se termina» (28/11): lo que se vende y se está por acabar según el stock de Contabilium.
// Solo avisa: no compra ni pide nada. Proveedores y negociación llegan cuando haya lista de proveedores por producto.
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Pager, usePaged } from "./Pager.jsx";
import { loadStock } from "./quote-stock.mjs";
import { STATES, runningOut, stateLabel } from "./purchasing.mjs";

const qty = (value) => (value == null ? "—" : new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(value));
const usd = (value) => `USD ${Math.round(Number(value) || 0).toLocaleString("es-AR")}`;

export default function Compras({ supabase = null }) {
  const [state, setState] = useState({ sales: [], stock: { map: new Map(), at: "" }, loading: true, error: "" });
  const [text, setText] = useState("");
  const [status, setStatus] = useState("urgente");
  const [rubro, setRubro] = useState("");
  const [order, setOrder] = useState("dias");
  useEffect(() => {
    if (!supabase) return undefined;
    let alive = true;
    (async () => {
      try {
        const sales = [];
        for (let from = 0; from < 20000; from += 1000) {
          const { data, error } = await supabase.from("contabilium_ventas_por_codigo").select("codigo,unidades_6m,unidades_12m,usd_6m,ultima_venta,nombre,rubro,subrubro").gt("unidades_6m", 0).range(from, from + 999);
          if (error) throw error;
          sales.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        const stock = await loadStock(supabase);
        if (alive) setState({ sales, stock, loading: false, error: "" });
      } catch (failure) {
        if (alive) setState((current) => ({ ...current, loading: false, error: failure.message || String(failure) }));
      }
    })();
    return () => { alive = false; };
  }, [supabase]);
  const rows = useMemo(() => runningOut(state.sales, state.stock.map), [state.sales, state.stock]);
  const rubros = useMemo(() => [...new Set(rows.map((row) => row.rubro).filter(Boolean))].sort(), [rows]);
  const counts = useMemo(() => rows.reduce((acc, row) => { acc[row.state] = (acc[row.state] || 0) + 1; return acc; }, {}), [rows]);
  const filtered = useMemo(() => {
    const words = text.trim().toLowerCase();
    const list = rows.filter((row) => (status === "urgente" ? row.state === "sin-stock" || row.state === "critico" : !status || row.state === status)
      && (!rubro || row.rubro === rubro) && (!words || `${row.code} ${row.name}`.toLowerCase().includes(words)));
    if (order === "ventas") return [...list].sort((a, b) => b.usd6 - a.usd6);
    return list;
  }, [rows, text, status, rubro, order]);
  const paged = usePaged(filtered, 25, `${text}|${status}|${rubro}|${order}`);
  if (!supabase) return <section className="panel"><p className="muted">Compras necesita la conexión en línea.</p></section>;
  const when = state.stock.at ? new Date(state.stock.at).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return (
    <div className="content-stack purchasing">
      <section className="panel">
        <span className="eyebrow">Compras</span>
        <h2>Qué se termina</h2>
        <p className="muted small">Lo que se vendió en los últimos 6 meses contra el stock de Contabilium (V. Domínico + Mar del Plata{when ? `, actualizado ${when}` : ""}). Los días son cuánto alcanza al ritmo de venta; «Para 60 días» es cuánto faltaría para cubrir dos meses. Solo avisa: no pide nada.</p>
        <div className="metric-grid purchasing-counts">
          {STATES.map(([id, label]) => (
            <button key={id} type="button" className={`metric-card purchasing-state is-${id}${status === id ? " selected" : ""}`} onClick={() => setStatus(status === id ? "" : id)}>
              <span>{label}</span><strong>{counts[id] || 0}</strong>
            </button>
          ))}
        </div>
        <div className="billing-filters">
          <label className="search"><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Código o producto" aria-label="Buscar producto" /></label>
          <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Estado"><option value="urgente">Sin stock y menos de 15 días</option><option value="">Todos</option>{STATES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
          <select value={rubro} onChange={(event) => setRubro(event.target.value)} aria-label="Rubro"><option value="">Todos los rubros</option>{rubros.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={order} onChange={(event) => setOrder(event.target.value)} aria-label="Orden"><option value="dias">Lo que menos dura primero</option><option value="ventas">Lo que más se vende primero</option></select>
        </div>
        {state.error ? <p className="form-notice">No se pudo leer: {state.error}</p> : state.loading ? <p className="muted">Cruzando ventas y stock…</p> : filtered.length === 0 ? <p className="muted">Nada con esos filtros.</p> : (
          <div className="table-scroll"><table className="billing-table">
            <thead><tr><th scope="col">Producto</th><th scope="col">Rubro</th><th scope="col" className="num">V. Domínico</th><th scope="col" className="num">MDQ</th><th scope="col" className="num">Vende por mes</th><th scope="col" className="num">Alcanza</th><th scope="col" className="num">Para 60 días</th></tr></thead>
            <tbody>{paged.rows.map((row) => (
              <tr key={row.code}>
                <td data-label="Producto"><strong>{row.code}</strong>{row.name ? <><br /><span className="muted small">{row.name}</span></> : null}</td>
                <td data-label="Rubro" className="small">{row.rubro || "—"}</td>
                <td data-label="V. Domínico" className="num">{qty(row.vd)}</td>
                <td data-label="MDQ" className="num">{qty(row.mdq)}</td>
                <td data-label="Vende por mes" className="num">{qty(row.perMonth)}<br /><span className="muted small">{usd(row.usd6)} en 6 m</span></td>
                <td data-label="Alcanza" className="num"><span className={`purchasing-chip is-${row.state}`}>{row.state === "sin-stock" ? "Sin stock" : `${row.days} ${row.days === 1 ? "día" : "días"}`}</span></td>
                <td data-label="Para 60 días" className="num">{row.suggest ? qty(row.suggest) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <Pager paged={paged} label="productos" />
      </section>
      <section className="panel">
        <h3>Proveedores y pedidos</h3>
        <p className="muted small">Para sugerir a quién comprarle y armar el pedido hace falta saber qué proveedor vende cada producto. Cuando esa lista exista (se puede empezar por los de esta tabla), esta sección suma «Proveedores sugeridos» y «Pedidos y negociación», siempre con aprobación de una persona.</p>
      </section>
    </div>
  );
}
