import { useMemo, useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2, Pencil } from "lucide-react";
import { SUGGESTIONS, WEEKDAYS, addBlock, blocksForDate, checkKey, dayProgress, removeBlock, toggleDay } from "./my-routine.mjs";

// Rutina propia de cada persona (28/11). La de Felipe sigue siendo la suya (Routine.jsx); el resto arma la propia acá.
export function MyRoutine({ date, routine = {}, planChecks = {}, onChange, onTogglePlan }) {
  const [editing, setEditing] = useState(!(routine.blocks || []).length);
  const [time, setTime] = useState("");
  const [title, setTitle] = useState("");
  const today = useMemo(() => blocksForDate(routine, date), [routine, date]);
  const progress = dayProgress(routine, date, planChecks);
  const add = (block) => { onChange(addBlock(routine, block)); setTitle(""); setTime(""); };
  const blocks = routine.blocks || [];
  const unused = SUGGESTIONS.filter((item) => !blocks.some((block) => block.title === item.title));

  return (
    <section className="panel my-routine">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Tu rutina</span>
          <h2>Rutina de hoy</h2>
          <p className="muted small">{today.length ? `${progress.done} de ${progress.total} bloques hechos` : "Armá los bloques que repetís cada día. Solo los ves vos."}</p>
        </div>
        <button type="button" className="secondary" onClick={() => setEditing(!editing)}><Pencil size={14} /> {editing ? "Listo" : "Editar rutina"}</button>
      </div>
      {today.length > 0 && !editing && (
        <>
          <div className="my-routine-bar" aria-hidden="true"><i style={{ width: `${progress.pct}%` }} /></div>
          <ul className="my-routine-list">
            {today.map((block) => {
              const done = Boolean(planChecks[checkKey(date, block.id)]);
              return (
                <li key={block.id}>
                  <button type="button" className={`my-routine-item${done ? " is-done" : ""}`} aria-pressed={done} onClick={() => onTogglePlan(checkKey(date, block.id), !done)}>
                    {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                    {block.time && <span className="my-routine-time">{block.time}</span>}
                    <span>{block.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {!today.length && !editing && <p className="muted">Hoy no tenés bloques. Tocá «Editar rutina» para sumar.</p>}
      {editing && (
        <div className="my-routine-edit">
          <form className="my-routine-form" onSubmit={(event) => { event.preventDefault(); add({ time, title }); }}>
            <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Hora (opcional)" />
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej.: Llamar a los clientes de la semana" aria-label="Bloque" />
            <button type="submit" className="primary" disabled={!title.trim()}><Plus size={14} /> Sumar</button>
          </form>
          {unused.length > 0 && (
            <p className="my-routine-suggest small"><span className="muted">Ideas:</span> {unused.map((item) => <button key={item.title} type="button" className="dr-pill" onClick={() => add(item)}>{item.time} {item.title}</button>)}</p>
          )}
          {blocks.length > 0 && (
            <ul className="my-routine-blocks">
              {blocks.map((block) => (
                <li key={block.id}>
                  <span className="my-routine-time">{block.time || "—"}</span>
                  <strong>{block.title}</strong>
                  <span className="my-routine-days">{WEEKDAYS.map(([day, label]) => <button key={day} type="button" aria-pressed={block.days.includes(day)} className={block.days.includes(day) ? "is-on" : ""} onClick={() => onChange(toggleDay(routine, block.id, day))}>{label}</button>)}</span>
                  <button type="button" className="danger-link" aria-label={`Quitar ${block.title}`} onClick={() => onChange(removeBlock(routine, block.id))}><Trash2 size={14} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
