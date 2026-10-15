import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { monthGrid, tasksForDay } from "./trello-plan-import.mjs";
import { routineForDate, specialsForDate } from "./routine.mjs";
import { PLAN_HOLIDAYS, PLAN_LIGHT_DAYS } from "./trello-plan.mjs";

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const HEADS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function Calendar({ tasks = [], date, onToggleTask, onOpenTask }) {
  const [cursor, setCursor] = useState(() => { const [y, m] = date.split("-").map(Number); return { y, m: m - 1 }; });
  const [selected, setSelected] = useState(date);
  const cells = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const move = (delta) => setCursor(({ y, m }) => { const next = new Date(y, m + delta, 1, 12); return { y: next.getFullYear(), m: next.getMonth() }; });
  const dayTasks = tasksForDay(tasks, selected);
  const routine = routineForDate(selected);
  const block = routine.blocks.find((item) => item.id === "dia");
  const specials = specialsForDate(selected);
  const holiday = PLAN_HOLIDAYS.includes(selected);
  const light = PLAN_LIGHT_DAYS.includes(selected);
  return (
    <section className="panel calendar">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Calendario</span>
          <h2>{MONTHS[cursor.m][0].toUpperCase() + MONTHS[cursor.m].slice(1)} {cursor.y}</h2>
        </div>
        <div className="panel-head-actions">
          <button type="button" className="secondary" aria-label="Mes anterior" onClick={() => move(-1)}><ChevronLeft size={16} /></button>
          <button type="button" className="secondary" aria-label="Mes siguiente" onClick={() => move(1)}><ChevronRight size={16} /></button>
        </div>
      </div>
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
        {dayTasks.length === 0 && <p className="muted">Sin tareas para este día.</p>}
        {dayTasks.map((task) => (
          <article key={task.id} className={`calendar-task${task.done ? " done" : ""}`}>
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
