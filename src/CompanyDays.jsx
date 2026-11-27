import { useEffect, useState } from "react";
import { adminFetch } from "./admin-api.mjs";
import { holidayDetail } from "./unified-calendar.mjs";

// Días cerrados de la empresa (26/11, Felipe): día del plástico, fiesta de fin de año, medio día por algún motivo. Los carga
// un administrador; todos los ven en el calendario (y en /api/feriados para Entregas y la app de conteo).
const asHoliday = (item) => ({ fecha: item.fecha, nombre: item.nombre, tipo: item.tipo === "medio-dia" ? "empresa-medio-dia" : "empresa", ...(item.desde ? { desde: item.desde } : {}) });

// items = lo que devolvió el servidor (null = todavía no se pidió: manda lo que trajo /api/feriados).
export function mergeCompanyDays(holidays = [], items = null) {
  if (!items) return holidays;
  const base = holidays.filter((item) => !String(item.tipo || "").startsWith("empresa"));
  return [...base, ...items.map(asHoliday)].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function CompanyDaysPanel({ date, items, onItems, fallback = [], onClose, local = false }) {
  const [form, setForm] = useState({ fecha: date, nombre: "", tipo: "cerrado", desde: "13:00" });
  const [status, setStatus] = useState("");
  const list = items || fallback.filter((item) => String(item.tipo || "").startsWith("empresa")).map((item) => ({ fecha: item.fecha, nombre: item.nombre, tipo: item.tipo === "empresa-medio-dia" ? "medio-dia" : "cerrado", desde: item.desde }));
  useEffect(() => {
    if (local) return undefined;
    let alive = true;
    adminFetch({ action: "company-days", op: "list" }).then((response) => response.json()).then((body) => { if (alive && Array.isArray(body.items)) onItems(body.items); }).catch(() => {});
    return () => { alive = false; };
  }, [onItems, local]);
  async function send(body, optimistic) {
    if (local) { onItems(optimistic); setStatus("Prueba sin base: se ve acá pero no se guarda."); return true; }
    setStatus("Guardando…");
    try {
      const response = await adminFetch({ action: "company-days", ...body });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "No se pudo guardar.");
      onItems(Array.isArray(result.items) ? result.items : optimistic);
      setStatus(window.__poliplastReadOnly ? "Link de prueba: se ve acá pero no se guarda." : "Listo: lo ve todo el equipo.");
      return true;
    } catch (error) {
      setStatus(error.message);
      return false;
    }
  }
  async function save(event) {
    event.preventDefault();
    const day = { fecha: form.fecha, nombre: form.nombre.trim(), tipo: form.tipo, ...(form.tipo === "medio-dia" ? { desde: form.desde } : {}) };
    if (await send({ op: "save", ...day }, [...list.filter((item) => item.fecha !== day.fecha), day].sort((a, b) => a.fecha.localeCompare(b.fecha)))) setForm({ ...form, nombre: "" });
  }
  return (
    <div className="calendar-export company-days">
      <p><strong>Días cerrados de la empresa</strong> <span className="muted small">los ve todo el equipo, también en Entregas</span></p>
      <form className="form-grid calendar-form" onSubmit={save}>
        <label>Fecha<input type="date" required value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })} /></label>
        <label>Cómo<select value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}><option value="cerrado">Día completo</option><option value="medio-dia">Medio día</option></select></label>
        {form.tipo === "medio-dia" && <label>Cerrado desde<input type="time" value={form.desde} onChange={(event) => setForm({ ...form, desde: event.target.value })} /></label>}
        <label className="span-2">Motivo<input required minLength={3} value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} placeholder="ej. Día del plástico, fiesta de fin de año" /></label>
        <div className="panel-head-actions span-2">
          <button type="submit" className="primary">Guardar</button>
          <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
        </div>
      </form>
      {status && <p className="form-notice">{status}</p>}
      {list.length === 0 ? <p className="muted small">Todavía no hay días cargados.</p> : (
        <ul className="company-days-list">
          {list.map((item) => (
            <li key={item.fecha}>
              <span><strong>{item.fecha.split("-").reverse().join("/")}</strong> · {item.nombre} · <span className="muted small">{holidayDetail(asHoliday(item))}</span></span>
              <button type="button" className="danger-link" onClick={() => send({ op: "remove", fecha: item.fecha }, list.filter((other) => other.fecha !== item.fecha))}>Quitar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
