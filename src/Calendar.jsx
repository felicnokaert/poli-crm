import { useMemo, useState } from "react";
import { CalendarPlus, ChevronLeft, ChevronRight, Download, ExternalLink } from "lucide-react";
import { monthGrid, tasksForDay } from "./trello-plan-import.mjs";
import { routineForDate, specialsForDate } from "./routine.mjs";
import { PLAN_HOLIDAYS, PLAN_LIGHT_DAYS } from "./trello-plan.mjs";
import { buildIcs } from "./ics.mjs";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const HEADS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function timeOrder(a, b) {
  return (a.startTime || "99:99").localeCompare(b.startTime || "99:99");
}

export function Calendar({ tasks = [], date, onToggleTask, onOpenTask, onAddEvent }) {
  const [form, setForm] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [opts, setOpts] = useState({ routine: true, includeTasks: true, includeEvents: true });
  const [exported, setExported] = useState("");
  const [cursor, setCursor] = useState(() => { const [y, m] = date.split("-").map(Number); return { y, m: m - 1 }; });
  const [selected, setSelected] = useState(date);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const move = (delta) => setCursor(({ y, m }) => { const next = new Date(y, m + delta, 1, 12); return { y: next.getFullYear(), m: next.getMonth() }; });
  const dayTasks = tasksForDay(tasks, selected);
  const dayEvents = dayTasks.filter((task) => task.kind === "evento").sort(timeOrder);
  const dayOthers = dayTasks.filter((task) => task.kind !== "evento");
  const routine = routineForDate(selected);
  const block = routine.blocks.find((item) => item.id === "dia");
  const specials = specialsForDate(selected);
  const holiday = PLAN_HOLIDAYS.includes(selected);
  const light = PLAN_LIGHT_DAYS.includes(selected);
  function submitEvent(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.date || !form.startTime) return;
    onAddEvent?.({ ...form, title: form.title.trim() });
    setSelected(form.date);
    const [y, m] = form.date.split("-").map(Number);
    setCursor({ y, m: m - 1 });
    setForm(null);
  }

  function runExport() {
    const to = "2026-12-31";
    const { text, count } = buildIcs(tasks, { from: date, to, ...opts, skipDays: [...PLAN_HOLIDAYS, ...PLAN_LIGHT_DAYS] });
    const blob = new Blob([text], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `crm-poliplast-${date}.ics`;
    anchor.click();
    URL.revokeObjectURL(url);
    setExported(`Se descargó el archivo con ${count} ${count === 1 ? "evento" : "eventos"}.`);
  }

  return (
    <section className="panel calendar">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Calendario</span>
          <h2>{MONTHS[cursor.m][0].toUpperCase() + MONTHS[cursor.m].slice(1)} {cursor.y}</h2>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="primary" onClick={() => setForm(form ? null : { title: "", date: selected, startTime: "10:00", endTime: "", place: "", company: "" })}><CalendarPlus size={15} /> Nuevo evento</button>
          <button type="button" className="secondary" onClick={() => setExportOpen(!exportOpen)}><Download size={15} /> Exportar a Google Calendar</button>
          <button type="button" className="secondary" aria-label="Mes anterior" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="secondary" aria-label="Mes siguiente" onClick={() => move(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
      {form && (
        <form className="form-grid calendar-form" onSubmit={submitEvent}>
          <label className="span-2">Qué es (visita, reunión, llamada…)<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="ej. Visita técnica en Astillero Sur" /></label>
          <label>Fecha<input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
          <label>Desde<input type="time" required value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} /></label>
          <label>Hasta (opcional)<input type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} /></label>
          <label>Empresa o contacto<input value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} /></label>
          <label className="span-2">Lugar<input value={form.place} onChange={(event) => setForm({ ...form, place: event.target.value })} placeholder="dirección o enlace de la reunión" /></label>
          <div className="panel-head-actions span-2">
            <button type="submit" className="primary">Guardar evento</button>
            <button type="button" className="secondary" onClick={() => setForm(null)}>Cancelar</button>
          </div>
        </form>
      )}
      {exportOpen && (
        <div className="calendar-export">
          <p><strong>Exportar a Google Calendar</strong> <span className="muted small">de hoy al 31/12, sin feriados</span></p>
          <label><input type="checkbox" checked={opts.routine} onChange={(event) => setOpts({ ...opts, routine: event.target.checked })} /> Bloques de la rutina, con su horario</label>
          <label><input type="checkbox" checked={opts.includeEvents} onChange={(event) => setOpts({ ...opts, includeEvents: event.target.checked })} /> Mis eventos con hora</label>
          <label><input type="checkbox" checked={opts.includeTasks} onChange={(event) => setOpts({ ...opts, includeTasks: event.target.checked })} /> Tareas pendientes (día completo, con link a Trello)</label>
          <div className="panel-head-actions"><button type="button" className="primary" onClick={runExport}>Descargar archivo (.ics)</button></div>
          {exported && <p className="form-notice">{exported}</p>}
          <p className="muted small">Después, en Google Calendar: Configuración ⚙ → Importar y exportar → Importar → elegí el archivo y el calendario. Si lo volvés a importar se actualizan los mismos eventos, no se duplican. Es de una sola vía: lo que cambies en Google no vuelve al CRM.</p>
        </div>
      )}
      <div className="calendar-grid" role="grid" aria-label="Calendario del mes">
        {HEADS.map((name) => <div key={name} className="calendar-head">{name}</div>)}
        {cells.map((cell, index) => {
          if (!cell) return <div key={`e${index}`} className="calendar-cell empty" />;
          const list = tasksForDay(tasks, cell);
          const pending = list.filter((task) => !task.done).length;
          const weekend = index % 7 >= 5;
          const off = PLAN_HOLIDAYS.includes(cell);
          return (
            <button
              type="button"
              key={cell}
              className={`calendar-cell${weekend ? " weekend" : ""}${off ? " holiday" : ""}${cell === date ? " today" : ""}${cell === selected ? " selected" : ""}`}
              aria-label={`${cell}: ${pending} pendientes`}
              onClick={() => setSelected(cell)}
            >
              <span className="calendar-day">{Number(cell.slice(8))}</span>
              {off && <em>feriado</em>}
              {pending > 0 && <strong className="calendar-count">{pending}</strong>}
            </button>
          );
        })}
      </div>
      <div className="calendar-detail">
        <h3>{selected}</h3>
        {holiday && <p className="form-notice">Feriado (a confirmar): sin carga de trabajo.</p>}
        {light && <p className="form-notice">Día liviano / puente (a confirmar): sin carga de trabajo.</p>}
        {!routine.weekend && block && <p className="muted small"><strong>Bloque del día:</strong> {block.title}</p>}
        {specials.map((line) => <p key={line} className="muted small">{line}</p>)}
        {dayTasks.length === 0 && <p className="muted">Sin tareas ni eventos para este día.</p>}
        {[...dayEvents, ...dayOthers].map((task) => (
          <article key={task.id} className={`calendar-task${task.done ? " done" : ""}${task.kind === "evento" ? " event" : ""}`}>
            {task.kind === "evento" && <span className="calendar-time">{task.startTime}{task.endTime ? `–${task.endTime}` : ""}</span>}
            <input type="checkbox" checked={Boolean(task.done)} aria-label={`Completar ${task.title}`} onChange={() => onToggleTask?.(task.id)} />
            <button type="button" className="link-button" onClick={() => onOpenTask?.(task.id)}>{task.title}</button>
            <span className={`priority ${(task.priority || "Media").toLowerCase()}`}>{task.priority || "Media"}</span>
            {task.trelloUrl && <a href={task.trelloUrl} target="_blank" rel="noreferrer" aria-label="Abrir en Trello"><ExternalLink size={14} /></a>}
          </article>
        ))}
      </div>
    </section>
  );
}
