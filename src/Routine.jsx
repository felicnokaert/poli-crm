import { useMemo, useState } from "react";
import { planSummary, tasksForDay } from "./trello-plan-import.mjs";
import { CheckCircle2, Circle, ArrowRight, Flame } from "lucide-react";
import {
  WEEKLY_TARGETS, hoursLabel, routineForDate, routineKey, routineProgress, routineStreak, weekDates,
} from "./routine.mjs";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

export function Routine({ date, planChecks = {}, onToggle, onNavigate, tasks = [], onToggleTask, onImportPlan, plan = [] }) {
  const [full, setFull] = useState(true);
  const day = useMemo(() => routineForDate(date), [date]);
  const progress = routineProgress(planChecks, date);
  const streak = routineStreak(planChecks, date);
  const blocks = day.blocks.filter((block) => full || !block.extra);
  const week = weekDates(date);
  return (
    <section className="panel routine">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Hábitos diarios</span>
          <h2>Rutina de hoy</h2>
          <p>
            {day.weekend
              ? "Fin de semana: sin rutina. Descansá."
              : `${full ? hoursLabel(day.totalMinutes) : hoursLabel(day.baseMinutes)} de trabajo enfocado. Los bloques "extra" suman cuando hay tiempo.`}
          </p>
        </div>
        {!day.weekend && (
          <div className="segmented" role="group" aria-label="Tamaño de la rutina">
            <button type="button" className={full ? "selected" : ""} aria-pressed={full} onClick={() => setFull(true)}>Completa · {hoursLabel(day.totalMinutes)}</button>
            <button type="button" className={!full ? "selected" : ""} aria-pressed={!full} onClick={() => setFull(false)}>Base · {hoursLabel(day.baseMinutes)}</button>
          </div>
        )}
      </div>

      {!day.weekend && (
        <>
          <div className="routine-summary">
            <strong>{progress.done} de {progress.total} bloques</strong>
            <span className="muted small">{hoursLabel(progress.minutesDone)} hechas</span>
            {streak > 0 && <span className="routine-streak"><Flame size={14} /> {streak} {streak === 1 ? "día" : "días"} seguidos con la base cumplida</span>}
          </div>
          {day.specials.map((line) => <p key={line} className="form-notice">{line}</p>)}
          <div className="routine-list">
            {blocks.map((block) => {
              const checked = planChecks[routineKey(date, block.id)] === true;
              return (
                <article key={block.id} className={`routine-block${checked ? " done" : ""}${block.extra ? " extra" : ""}`}>
                  <button type="button" className="task-check" aria-pressed={checked} aria-label={`${checked ? "Desmarcar" : "Marcar"} ${block.title}`} onClick={() => onToggle(routineKey(date, block.id), !checked)}>
                    {checked ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                  </button>
                  <div>
                    <strong>{block.start} · {block.title}</strong>
                    <span className="muted small">{block.minutes} min{block.extra ? " · extra" : ""}</span>
                    <p>{block.detail}</p>
                  </div>
                  {block.view && onNavigate && (
                    <button type="button" className="secondary" onClick={() => onNavigate(block.view)}>Ir <ArrowRight size={14} /></button>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}

      {onImportPlan && (() => {
        const sum = planSummary(plan, tasks);
        return (
          <div className="routine-plan">
            <div>
              <strong>Plan Trello del 16/10 al 31/12</strong>
              <span className="muted small">{sum.total} tarjetas repartidas por día hábil según el bloque del día. {sum.pending === 0 ? "Ya están cargadas en Tareas." : `${sum.pending} sin cargar todavía.`}</span>
            </div>
            <button type="button" className="primary" disabled={sum.pending === 0} onClick={onImportPlan}>{sum.pending === 0 ? "Plan cargado" : `Cargar ${sum.pending} tareas`}</button>
          </div>
        );
      })()}

      {tasksForDay(tasks, date).length > 0 && (
        <div className="routine-today-tasks">
          <h3>Para hoy desde Trello</h3>
          {tasksForDay(tasks, date).map((task) => (
            <label key={task.id} className={task.done ? "done" : ""}>
              <input type="checkbox" checked={Boolean(task.done)} onChange={() => onToggleTask?.(task.id)} />
              <span>{task.title}</span>
              {task.trelloUrl && <a href={task.trelloUrl} target="_blank" rel="noreferrer">Trello</a>}
            </label>
          ))}
        </div>
      )}

      <div className="routine-week" aria-label="Semana">
        {week.map((item, index) => {
          const p = routineProgress(planChecks, item);
          const pct = p.baseTotal ? Math.round((p.baseDone / p.baseTotal) * 100) : 0;
          return (
            <div key={item} className={`routine-day${item === date ? " today" : ""}`}>
              <span>{DAY_LABELS[index]}</span>
              <strong>{pct}%</strong>
            </div>
          );
        })}
      </div>

      <details className="routine-targets">
        <summary><strong>Metas de la semana</strong> <span className="muted small">del Plan Comercial</span></summary>
        <ul>{WEEKLY_TARGETS.map(([label, value]) => <li key={label}><strong>{label}:</strong> {value}</li>)}</ul>
        <p className="muted small">Si la conversión queda por debajo del objetivo, no se bajan las metas: se sube el volumen de contactos.</p>
      </details>
    </section>
  );
}
