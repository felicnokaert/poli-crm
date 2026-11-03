import { useMemo, useState } from "react";
import { DayReview } from "./DayReview.jsx";
import { MAX_ROCKS, chosenRocks, rockCandidates, rockKey, sierraKey } from "./big-rocks.mjs";
import { planSummary, tasksForDay } from "./trello-plan-import.mjs";
import { CheckCircle2, Circle, ArrowRight, Flame } from "lucide-react";
import {
  WEEKLY_TARGETS, hoursLabel, routineForDate, routineKey, routineProgress, routineStreak, weekDates,
} from "./routine.mjs";

const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie"];

// Las 3 piedras grandes del día y «afilar la sierra» de la semana (los 7 hábitos: primero lo importante).
function BigRocks({ date, planChecks, tasks, onToggle, onToggleTask }) {
  const [pick, setPick] = useState("");
  const chosen = chosenRocks(date, planChecks, tasks);
  const candidates = rockCandidates(date, planChecks, tasks);
  const sierra = planChecks[sierraKey(date)] === true;
  return (
    <section className="panel big-rocks" aria-label="Piedras grandes">
      <h3>Las 3 piedras grandes de hoy</h3>
      <p className="muted small">Lo importante primero. Elegí hasta {MAX_ROCKS} tareas que, si las hacés, hacen que el día valga la pena, aunque no sean las más urgentes.</p>
      {chosen.length === 0 && <p className="muted">Todavía no elegiste ninguna.</p>}
      <ul>
        {chosen.map((task) => (
          <li key={task.id} className={task.done ? "done" : ""}>
            <label><input type="checkbox" checked={Boolean(task.done)} onChange={() => onToggleTask?.(task.id)} /> <span>{task.title}</span></label>{" "}
            <button type="button" className="link-button" onClick={() => onToggle(rockKey(date, task.id), false)}>Quitar</button>
          </li>
        ))}
      </ul>
      {chosen.length < MAX_ROCKS && candidates.length > 0 && (
        <div className="list-toolbar">
          <select value={pick} onChange={(event) => setPick(event.target.value)} aria-label="Elegir una piedra grande">
            <option value="">Elegir de mis tareas pendientes…</option>
            {candidates.map((task) => <option key={task.id} value={task.id}>{task.priority === "Alta" ? "★ " : ""}{task.title}{task.dueDate ? ` · ${task.dueDate}` : ""}</option>)}
          </select>
          <button type="button" className="secondary" disabled={!pick} onClick={() => { onToggle(rockKey(date, pick), true); setPick(""); }}>Sumar</button>
        </div>
      )}
      <div className="routine-block sierra">
        <button type="button" className="task-check" aria-pressed={sierra} aria-label={`${sierra ? "Desmarcar" : "Marcar"} afilar la sierra`} onClick={() => onToggle(sierraKey(date), !sierra)}>
          {sierra ? <CheckCircle2 size={22} /> : <Circle size={22} />}
        </button>
        <div>
          <strong>Afilar la sierra (esta semana)</strong>
          <p className="muted small">Una hora para vos: leer, capacitarte o mejorar tu método. Lo que te hace más efectivo sin que lo pida nadie.</p>
        </div>
      </div>
    </section>
  );
}

export function Routine({ date, planChecks = {}, onToggle, onNavigate, tasks = [], onToggleTask, onImportPlan, plan = [], onPostpone }) {
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

      {!day.weekend && <BigRocks date={date} planChecks={planChecks} tasks={tasks} onToggle={onToggle} onToggleTask={onToggleTask} />}

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

      <DayReview date={date} planChecks={planChecks} tasks={tasks} onPostpone={onPostpone} onToggleTask={onToggleTask} />

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
