// Facturación (28/11): comprobantes de Contabilium, saldos por cobrar y notas de crédito, con filtros, orden y páginas.
// Solo lee la copia de Contabilium (contabilium_comprobantes): no emite ni cambia nada.
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Pager, usePaged } from "./Pager.jsx";
import { accessAllows, tabSubs } from "./team-access.mjs";
import { AGING, COMPANIES, KINDS, agingMatches, balancesByClient, companyLabel, currencyOf, kindPrefix, money, periodRange } from "./billing-view.mjs";

const SIZE = 25;
const PERIODS = [["30", "30 días"], ["90", "90 días"], ["365", "12 meses"], ["", "Todo"]];
const shortDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : "—");

export default function Facturacion({ supabase = null, access = null }) {
  const subs = tabSubs("facturacion").filter((sub) => !access || accessAllows(access, "facturacion", sub));
  const [tab, setTab] = useState(subs[0] || "");
  if (!supabase) return <section className="panel"><p className="muted">Facturación necesita la conexión en línea.</p></section>;
  return (
    <div className="content-stack billing">
      {subs.length > 1 && (
        <div className="segmented" role="tablist" aria-label="Facturación">
          {subs.map((sub) => <button key={sub} type="button" role="tab" aria-selected={tab === sub} className={tab === sub ? "selected" : ""} onClick={() => setTab(sub)}>{sub}</button>)}
        </div>
      )}
      {tab === "Saldos" ? <Balances supabase={supabase} /> : <Vouchers key={tab} supabase={supabase} fixedKind={tab === "Notas de crédito" ? "creditos" : ""} />}
    </div>
  );
}

// Comprobantes: la base pagina (25 por página) y filtra; nunca se trae todo.
function Vouchers({ supabase, fixedKind = "" }) {
  const [company, setCompany] = useState("");
  const [kind, setKind] = useState(fixedKind || "facturas");
  const [period, setPeriod] = useState("30");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState("fecha");
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ rows: [], total: 0, loading: true, error: "" });
  useEffect(() => { const timer = setTimeout(() => setQuery(text.trim()), 350); return () => clearTimeout(timer); }, [text]);
  useEffect(() => { setPage(1); }, [company, kind, period, query, order]);
  useEffect(() => {
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: "" }));
    (async () => {
      try {
        let request = supabase.from("contabilium_comprobantes").select("company,id,tipo,numero,fecha,cliente,total,saldo,moneda:raw->>IDMoneda", { count: "exact" });
        if (company) request = request.eq("company", company);
        const prefix = kindPrefix(kind);
        if (prefix) request = request.like("tipo", `${prefix}%`);
        const { from } = periodRange(period);
        if (from) request = request.gte("fecha", from);
        if (query) request = /^[\d-]+$/.test(query) ? request.ilike("numero", `%${query}%`) : request.ilike("cliente", `%${query}%`);
        request = order === "total" ? request.order("total", { ascending: false }) : request.order("fecha", { ascending: false }).order("numero", { ascending: false });
        const { data, error, count } = await request.range((page - 1) * SIZE, page * SIZE - 1);
        if (error) throw error;
        if (alive) setState({ rows: data || [], total: count || 0, loading: false, error: "" });
      } catch (failure) {
        if (alive) setState({ rows: [], total: 0, loading: false, error: failure.message || String(failure) });
      }
    })();
    return () => { alive = false; };
  }, [supabase, company, kind, period, query, order, page]);
  const pages = Math.max(1, Math.ceil(state.total / SIZE));
  const paged = { page, pages, total: state.total, from: state.total ? (page - 1) * SIZE + 1 : 0, to: Math.min(state.total, page * SIZE), setPage };
  return (
    <section className="panel">
      <div className="billing-filters">
        <label className="search"><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Cliente o número de comprobante" aria-label="Buscar" /></label>
        <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{COMPANIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        {!fixedKind && <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Tipo"><option value="">Todos los tipos</option>{KINDS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>}
        <select value={order} onChange={(event) => setOrder(event.target.value)} aria-label="Orden"><option value="fecha">Más nuevos primero</option><option value="total">Mayor importe primero</option></select>
        <div className="segmented" role="tablist" aria-label="Período">{PERIODS.map(([id, label]) => <button key={id || "todo"} type="button" role="tab" aria-selected={period === id} className={period === id ? "selected" : ""} onClick={() => setPeriod(id)}>{label}</button>)}</div>
      </div>
      {state.error ? <p className="form-notice">No se pudo leer: {state.error}</p> : state.loading && !state.rows.length ? <p className="muted">Cargando…</p> : state.rows.length === 0 ? <p className="muted">No hay comprobantes con esos filtros.</p> : (
        <div className="table-scroll"><table className="billing-table">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Comprobante</th><th scope="col">Cliente</th><th scope="col">Empresa</th><th scope="col" className="num">Total</th><th scope="col" className="num">Saldo</th></tr></thead>
          <tbody>{state.rows.map((row) => {
            const currency = currencyOf(row.moneda);
            return (
              <tr key={`${row.company}-${row.id}`}>
                <td data-label="Fecha">{shortDate(row.fecha)}</td>
                <td data-label="Comprobante"><strong>{row.tipo}</strong> {row.numero}</td>
                <td data-label="Cliente">{row.cliente || "—"}</td>
                <td data-label="Empresa" className="small">{companyLabel(row.company)}</td>
                <td data-label="Total" className="num">{money(row.total, currency)}</td>
                <td data-label="Saldo" className={`num${Number(row.saldo) > 0.5 ? " billing-due" : " muted"}`}>{Number(row.saldo) > 0.5 ? money(row.saldo, currency) : "—"}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
      <Pager paged={paged} label="comprobantes" />
    </section>
  );
}

// Saldos por cobrar: facturas y notas de débito con saldo, agrupadas por cliente (las más viejas primero).
function Balances({ supabase }) {
  const [state, setState] = useState({ rows: [], loading: true, error: "" });
  const [company, setCompany] = useState("");
  const [aging, setAging] = useState("");
  const [text, setText] = useState("");
  const [order, setOrder] = useState("saldo");
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const all = [];
        for (let from = 0; from < 10000; from += 1000) {
          const { data, error } = await supabase.from("contabilium_comprobantes").select("company,cliente_id,cliente,tipo,fecha,saldo,moneda:raw->>IDMoneda").gt("saldo", 0.5).or("tipo.like.FC%,tipo.like.ND%").order("fecha").range(from, from + 999);
          if (error) throw error;
          all.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        if (alive) setState({ rows: all, loading: false, error: "" });
      } catch (failure) {
        if (alive) setState({ rows: [], loading: false, error: failure.message || String(failure) });
      }
    })();
    return () => { alive = false; };
  }, [supabase]);
  const groups = useMemo(() => balancesByClient(state.rows), [state.rows]);
  const filtered = useMemo(() => {
    const words = text.trim().toLowerCase();
    const list = groups.filter((group) => (!company || group.company === company) && agingMatches(group.days, aging) && (!words || group.cliente.toLowerCase().includes(words)));
    return list.sort(order === "dias" ? (a, b) => b.days - a.days : (a, b) => (b.currency === "USD" ? b.saldo * 1500 : b.saldo) - (a.currency === "USD" ? a.saldo * 1500 : a.saldo));
  }, [groups, company, aging, text, order]);
  const totals = useMemo(() => filtered.reduce((acc, group) => { acc[group.currency] = (acc[group.currency] || 0) + group.saldo; return acc; }, {}), [filtered]);
  const paged = usePaged(filtered, SIZE, `${company}|${aging}|${text}|${order}`);
  return (
    <section className="panel">
      <p className="muted small">Facturas y notas de débito con saldo pendiente según Contabilium, por cliente. Se actualiza con la copia diaria de Contabilium.</p>
      <div className="metric-grid billing-totals">
        <article className="metric-card"><span>Por cobrar en pesos</span><strong>{money(totals.ARS || 0, "ARS")}</strong><small>{filtered.filter((group) => group.currency === "ARS").length} clientes</small></article>
        <article className="metric-card"><span>Por cobrar en dólares</span><strong>{money(totals.USD || 0, "USD")}</strong><small>{filtered.filter((group) => group.currency === "USD").length} clientes</small></article>
      </div>
      <div className="billing-filters">
        <label className="search"><Search size={15} /><input value={text} onChange={(event) => setText(event.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" /></label>
        <select value={company} onChange={(event) => setCompany(event.target.value)} aria-label="Empresa"><option value="">Todas las empresas</option>{COMPANIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
        <select value={aging} onChange={(event) => setAging(event.target.value)} aria-label="Antigüedad">{AGING.map(([id, label]) => <option key={id || "todas"} value={id}>{label}</option>)}</select>
        <select value={order} onChange={(event) => setOrder(event.target.value)} aria-label="Orden"><option value="saldo">Mayor saldo primero</option><option value="dias">Más viejo primero</option></select>
      </div>
      {state.error ? <p className="form-notice">No se pudo leer: {state.error}</p> : state.loading ? <p className="muted">Leyendo saldos…</p> : filtered.length === 0 ? <p className="muted">Nada pendiente con esos filtros.</p> : (
        <div className="table-scroll"><table className="billing-table">
          <thead><tr><th scope="col">Cliente</th><th scope="col">Empresa</th><th scope="col" className="num">Comprobantes</th><th scope="col" className="num">Más viejo</th><th scope="col" className="num">Saldo</th></tr></thead>
          <tbody>{paged.rows.map((group) => (
            <tr key={group.key}>
              <td data-label="Cliente"><strong>{group.cliente}</strong></td>
              <td data-label="Empresa" className="small">{companyLabel(group.company)}</td>
              <td data-label="Comprobantes" className="num">{group.count}</td>
              <td data-label="Más viejo" className={`num${group.days > 90 ? " billing-due" : ""}`}>{group.days} días</td>
              <td data-label="Saldo" className="num"><strong>{money(group.saldo, group.currency)}</strong></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <Pager paged={paged} label="clientes" />
    </section>
  );
}
