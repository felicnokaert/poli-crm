import { useMemo, useState } from "react";
import { demoModules } from "./demo-data.mjs";
import { FUTURE_MODULES } from "./poliplast-app-plan.mjs";
import { accessAllows, tabSubs } from "./team-access.mjs";

// Poliplast App (prueba, 25/11): cómo se verían Etiquetas, Conteo, Dosificado, Recibos, Facturación, Compras y
// Entregas adentro de la app, con datos INVENTADOS. Lo que se toca acá queda solo en esta pantalla (no se guarda).
const money = (value) => `$ ${Math.round(Number(value) || 0).toLocaleString("es-AR")}`;

function Tabs({ subs, tab, setTab }) {
  return (
    <div className="segmented demo-tabs" role="tablist" aria-label="Submódulos">
      {subs.map((sub) => (
        <button key={sub} type="button" role="tab" aria-selected={tab === sub} className={tab === sub ? "selected" : ""} onClick={() => setTab(sub)}>{sub}</button>
      ))}
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="table-scroll">
      <table className="sales-history-table demo-table">
        <thead><tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
        <tbody>{rows.length ? rows : <tr><td colSpan={head.length} className="muted">Nada para mostrar.</td></tr>}</tbody>
      </table>
    </div>
  );
}

function Stats({ items }) {
  return (
    <section className="metric-grid demo-stats">
      {items.map(([label, value]) => (
        <article className="metric-card" key={label}><span>{label}</span><strong>{value}</strong></article>
      ))}
    </section>
  );
}

const Pill = ({ tone = "", children }) => <em className={`badge demo-pill ${tone}`}>{children}</em>;

function Etiquetas({ data, tab }) {
  const [rows, setRows] = useState(data.etiquetas);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState("");
  const scan = (event) => {
    event.preventDefault();
    const found = rows.find((row) => row.id === code.trim());
    if (!found) setMsg("No es un envío pendiente de nuestras cuentas.");
    else if (found.status === "Cancelado") setMsg(`Envío ${found.id}: CANCELADO. No lo prepares.`);
    else if (found.status === "Preparado") setMsg(`Envío ${found.id}: ya estaba escaneado (${found.by} ${found.at}). No suma.`);
    else {
      setRows((current) => current.map((row) => (row.id === found.id ? { ...row, status: "Preparado", by: "Vos (prueba)", at: "ahora" } : row)));
      setMsg(`Listo: ${found.sku} x${found.qty} preparado.`);
    }
    setCode("");
  };
  const pending = rows.filter((row) => row.status === "Pendiente");
  if (tab === "Escanear") return (
    <>
      <form className="demo-scan" onSubmit={scan}>
        <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="Escaneá o escribí el número de envío" aria-label="Número de envío" />
        <button type="submit" className="primary">Marcar preparado</button>
      </form>
      {msg && <p className="demo-msg" role="status">{msg}</p>}
      <p className="muted small">Para probar, copiá un número de la pestaña Pendientes, por ejemplo {pending[0]?.id || rows[0]?.id}.</p>
    </>
  );
  if (tab === "Pendientes") {
    const byCut = ["8:00", "10:00", "12:00"].map((cut) => [cut, pending.filter((row) => row.cut === cut)]);
    return (
      <>
        <Stats items={byCut.map(([cut, list]) => [`Corte ${cut}`, list.reduce((sum, row) => sum + row.qty, 0) + " u."])} />
        <Table head={["Envío", "Cuenta", "SKU", "Cant.", "Corte", "Envío por"]} rows={pending.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.account}</td><td>{row.sku}</td><td>{row.qty}</td><td>{row.cut}</td><td>{row.logistic}</td></tr>)} />
      </>
    );
  }
  if (tab === "Hecho") return <Table head={["Envío", "SKU", "Cant.", "Preparó", "Hora"]} rows={rows.filter((row) => row.status === "Preparado").map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.sku}</td><td>{row.qty}</td><td>{row.by}</td><td>{row.at}</td></tr>)} />;
  if (tab === "Devoluciones") return <Table head={["Envío", "Cuenta", "Producto", "Estado"]} rows={rows.filter((row) => row.returned).map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.account}</td><td>{row.title}</td><td><Pill tone="warn">Devolución en camino</Pill></td></tr>)} />;
  return <Table head={["Corte", "Lunes a viernes", "Cuentas"]} rows={["8:00", "10:00", "12:00"].map((cut) => <tr key={cut}><td>{cut}</td><td>Sí</td><td>Todas</td></tr>)} />;
}

function Conteo({ data, tab }) {
  const [rows, setRows] = useState(data.conteo);
  const diffs = rows.filter((row) => row.counted !== null && row.counted !== row.expected);
  if (tab === "Categorías") return (
    <Table head={["SKU", "Producto", "Depósito", "Sistema", "Contado"]} rows={rows.map((row, index) => (
      <tr key={row.sku}><td>{row.sku}</td><td>{row.title}</td><td>{row.deposit}</td><td>{row.expected}</td>
        <td><input className="demo-count" type="number" inputMode="numeric" value={row.counted ?? ""} aria-label={`Contado ${row.sku}`} onChange={(event) => setRows((current) => current.map((item, i) => (i === index ? { ...item, counted: event.target.value === "" ? null : Number(event.target.value) } : item)))} /></td></tr>
    ))} />
  );
  if (tab === "Administración") return <Table head={["SKU", "Producto", "Sistema", "Contado", "Diferencia"]} rows={diffs.map((row) => <tr key={row.sku}><td>{row.sku}</td><td>{row.title}</td><td>{row.expected}</td><td>{row.counted}</td><td><Pill tone={row.counted < row.expected ? "warn" : ""}>{row.counted - row.expected > 0 ? "+" : ""}{row.counted - row.expected}</Pill></td></tr>)} />;
  return <Table head={["SKU", "Contó", "Depósito"]} rows={rows.filter((row) => row.by).map((row) => <tr key={row.sku}><td>{row.sku}</td><td>{row.by}</td><td>{row.deposit}</td></tr>)} />;
}

function Dosificado({ data, tab }) {
  const [rows, setRows] = useState(data.dosificado);
  if (tab === "Kits") return <Table head={["Fórmula", "Relación", "Nota"]} rows={[["618-SP", "100 : 110 en peso", "Espuma proyectada"], ["770-IR", "100 : 110 en peso", "Inyección rígida"], ["Poliurea", "1 : 1 en volumen", "Krypton"], ["Resina 608", "+ 1-2 % catalizador", "Fraccionado"]].map(([a, b, c]) => <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>)} />;
  if (tab === "Resumen") return <Stats items={[["Para dosificar", rows.filter((row) => row.status === "Para dosificar").length], ["Kg del día", rows.reduce((sum, row) => sum + row.kg, 0)]]} />;
  const list = tab === "Registros" ? rows.filter((row) => row.status !== "Para dosificar") : rows.filter((row) => row.status === "Para dosificar");
  return (
    <Table head={["Pedido", "Cliente", "Fórmula", "Kg", "Para", "Estado", ""]} rows={list.map((row) => (
      <tr key={row.id}><td>{row.id}</td><td>{row.client}</td><td>{row.formula}</td><td>{row.kg}</td><td>{row.due}</td><td><Pill>{row.status}</Pill>{row.by && <span className="muted small"> {row.by}</span>}</td>
        <td>{row.status === "Para dosificar" && <button type="button" className="secondary" onClick={() => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status: "Dosificado", by: "Vos (prueba)" } : item)))}>Listo</button>}</td></tr>
    ))} />
  );
}

function Recibos({ data, tab }) {
  const [rows, setRows] = useState(data.recibos);
  const [form, setForm] = useState({ client: "", amount: "", method: "Transferencia" });
  const today = rows[0]?.date;
  if (tab === "Cargar recibo") return (
    <form className="demo-form" onSubmit={(event) => {
      event.preventDefault();
      if (!form.client.trim() || !Number(form.amount)) return;
      setRows((current) => [{ id: `R-${String(3400 + current.length).padStart(6, "0")}`, date: today, client: form.client.trim(), amount: Number(form.amount), method: form.method, by: "Vos (prueba)" }, ...current]);
      setForm({ client: "", amount: "", method: "Transferencia" });
    }}>
      <label>Cliente<input value={form.client} onChange={(event) => setForm({ ...form, client: event.target.value })} /></label>
      <label>Importe<input type="number" inputMode="numeric" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label>
      <label>Forma de pago<select value={form.method} onChange={(event) => setForm({ ...form, method: event.target.value })}>{["Transferencia", "Efectivo", "Cheque", "Echeq"].map((item) => <option key={item}>{item}</option>)}</select></label>
      <button type="submit" className="primary">Guardar recibo</button>
      <p className="muted small">Prueba: se suma a «Recibos del día» y no se guarda.</p>
    </form>
  );
  if (tab === "Cobranzas por cliente") {
    const byClient = Object.entries(rows.reduce((acc, row) => ({ ...acc, [row.client]: (acc[row.client] || 0) + row.amount }), {})).sort((a, b) => b[1] - a[1]);
    return <Table head={["Cliente", "Cobrado"]} rows={byClient.map(([client, amount]) => <tr key={client}><td>{client}</td><td>{money(amount)}</td></tr>)} />;
  }
  const list = rows.slice().sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <Stats items={[["Recibos", list.length], ["Cobrado", money(list.reduce((sum, row) => sum + row.amount, 0))]]} />
      <Table head={["Recibo", "Fecha", "Cliente", "Forma", "Importe", "Cargó"]} rows={list.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.date}</td><td>{row.client}</td><td>{row.method}</td><td>{money(row.amount)}</td><td>{row.by}</td></tr>)} />
    </>
  );
}

function Facturacion({ data, tab }) {
  const rows = data.facturacion;
  const list = tab === "Notas de crédito" ? rows.filter((row) => row.type === "Nota de crédito") : tab === "Saldos" ? rows.filter((row) => row.balance > 0) : rows;
  return (
    <>
      <Stats items={[["Facturado (prueba)", money(rows.filter((row) => row.type === "Factura").reduce((sum, row) => sum + row.total, 0))], ["Saldo a cobrar", money(rows.reduce((sum, row) => sum + row.balance, 0))]]} />
      <Table head={["Comprobante", "Fecha", "Empresa", "Cliente", "Total", "Saldo"]} rows={list.map((row) => <tr key={row.id}><td>{row.type === "Nota de crédito" ? row.id.replace("FCA", "NCA") : row.id}</td><td>{row.date}</td><td>{row.company}</td><td>{row.client}</td><td>{money(row.total)}</td><td>{row.balance ? <Pill tone="warn">{money(row.balance)}</Pill> : "—"}</td></tr>)} />
    </>
  );
}

function Compras({ data, tab }) {
  const rows = data.compras.slice().sort((a, b) => (a.weeksLeft ?? 99) - (b.weeksLeft ?? 99));
  if (tab === "Proveedores sugeridos") return <Table head={["SKU", "Producto", "Proveedor sugerido", "Último precio (USD)"]} rows={rows.map((row) => <tr key={row.sku}><td>{row.sku}</td><td>{row.title}</td><td>{row.supplier}</td><td>{row.lastPrice}</td></tr>)} />;
  if (tab === "Pedidos y negociación") return <p className="muted">Acá va a estar el borrador del pedido al proveedor (mail o WhatsApp) que arma la app y aprueba una persona antes de enviarlo. Nada sale solo.</p>;
  return <Table head={["SKU", "Producto", "Stock", "Venta por semana", "Alcanza para"]} rows={rows.map((row) => <tr key={row.sku}><td>{row.sku}</td><td>{row.title}</td><td>{row.stock}</td><td>{row.perWeek}</td><td>{row.weeksLeft === null ? "—" : <Pill tone={row.weeksLeft < 2 ? "warn" : ""}>{row.weeksLeft} semanas</Pill>}</td></tr>)} />;
}

function Entregas({ data, tab }) {
  const [rows, setRows] = useState(data.entregas);
  const next = { cargado: "impreso", impreso: "despachado", despachado: "entregado" };
  if (tab === "Tablero del depósito") return <Stats items={["cargado", "impreso", "despachado", "entregado"].map((status) => [status[0].toUpperCase() + status.slice(1), rows.filter((row) => row.status === status).length])} />;
  if (tab === "Calendario") {
    const days = [...new Set(rows.map((row) => row.date))].sort();
    return <Table head={["Día", "Pedidos"]} rows={days.map((day) => <tr key={day}><td>{day}</td><td>{rows.filter((row) => row.date === day).map((row) => row.client).join(" · ")}</td></tr>)} />;
  }
  const list = tab === "Expedición hoy" ? rows.filter((row) => ["cargado", "impreso"].includes(row.status)) : rows;
  return (
    <Table head={["Pedido", "Remito", "Cliente", "Depósito", "Sale por", "Estado", ""]} rows={list.map((row) => (
      <tr key={row.id}><td>{row.id}</td><td>{row.remito}</td><td>{row.client}</td><td>{row.deposit}</td><td>{row.expreso}</td><td><Pill>{row.status}</Pill></td>
        <td>{next[row.status] && <button type="button" className="secondary" onClick={() => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, status: next[row.status] } : item)))}>Pasar a {next[row.status]}</button>}</td></tr>
    ))} />
  );
}

const SCREENS = { etiquetas: Etiquetas, conteo: Conteo, dosificado: Dosificado, recibos: Recibos, facturacion: Facturacion, compras: Compras, entregas: Entregas };
const LABELS = { entregas: "Entregas" };

export function DemoModule({ id, access = null }) {
  const data = useMemo(() => demoModules(), []);
  // Solo los submódulos que la persona que se está mirando tiene habilitados.
  const subs = tabSubs(id).filter((sub) => !access || accessAllows(access, id, sub));
  const [picked, setTab] = useState(subs[0] || "");
  const tab = subs.includes(picked) ? picked : subs[0] || "";
  const Screen = SCREENS[id];
  if (!Screen) return null;
  if (!subs.length) return <section className="panel"><p className="muted">No tenés submódulos habilitados en este módulo.</p></section>;
  const label = FUTURE_MODULES[id]?.label || LABELS[id] || id;
  return (
    <section className="panel module-preview">
      <span className="eyebrow">Versión de prueba · datos inventados</span>
      <h2>{label}</h2>
      {FUTURE_MODULES[id] && <p className="muted small">{FUTURE_MODULES[id].text}</p>}
      {id === "entregas" && <p className="muted small">En la app real, Entregas es la de siempre. En la prueba se ve con pedidos inventados.</p>}
      <Tabs subs={subs} tab={tab} setTab={setTab} />
      <Screen data={data} tab={tab} />
    </section>
  );
}
