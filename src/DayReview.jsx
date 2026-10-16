import { useMemo, useState } from "react";
import { CheckCircle2, CalendarClock, MoonStar } from "lucide-react";
import { reviewDay } from "./day-review.mjs";
import { previousWorkday, nextWorkday } from "./routine.mjs";

function TaskLine({ task, children }) {
  return (
    <li>
      <span>{task.title}</span>
      {task.postponedCount > 0 && <span className="muted small"> · postergada {task.postponedCount} {task.postponedCount === 1 ? "vez" : "veces"}</span>}
      {children}
    </li>
  );
}

function Block({ title, tone, items, empty, render }) {
  return (
    <div className={`review-block ${tone || ""}`}>
      <h4>{title} <b>{items.length}</b></h4>
      {items.length ? <ul>{items.slice(0, 8).map(render)}{items.length > 8 && <li className="muted small">y {items.length - 8} más</li>}</ul> : <p className="muted small">{empty}</p>}
    </div>
  );
}

export function DayReview({ date, planChecks = {}, tasks = [], onPostpone, onToggleTask }) {
  const [which, setWhich] = useState("hoy");
  const target = which === "hoy" ? date : previousWorkday(date);
  const review = useMemo(() => reviewDay(target, { planChecks, tasks }), [target, planChecks, tasks]);
  const move = (task) => onPostpone?.(task.id, nextWorkday(target > date ? target : date));
  return (
    <section className="day-review" aria-label="Cierre del día">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Segundo cerebro</span>
          <h3><MoonStar size={16} /> Cierre del día</h3>
          <p className="muted small">{review.headline}</p>
        </div>
        <div className="segmented" role="group" aria-label="Día a revisar">
          <button type="button" className={which === "hoy" ? "selected" : ""} aria-pressed={which === "hoy"} onClick={() => setWhich("hoy")}>Hoy</button>
          <button type="button" className={which === "ayer" ? "selected" : ""} aria-pressed={which === "ayer"} onClick={() => setWhich("ayer")}>Último día hábil</button>
        </div>
      </div>
      {!review.weekend && (
        <div className="review-grid">
          <Block title="Salió bien" tone="good" empty="Todavía nada marcado." items={[...review.routine.done.map((b) => ({ id: `b-${b.id}`, title: b.title })), ...review.doneTasks]} render={(item) => <li key={item.id}><CheckCircle2 size={13} /> {item.title}</li>} />
          <Block title="Quedó sin hacer" tone="warn" empty="Nada pendiente de este día." items={[...review.routine.missed.map((b) => ({ id: `m-${b.id}`, title: `Rutina: ${b.title}`, block: true })), ...review.pendingTasks]} render={(item) => (
            <TaskLine key={item.id} task={item}>
              {!item.block && onPostpone && <button type="button" className="link-button" onClick={() => move(item)}>Pasar al próximo día hábil</button>}
              {!item.block && onToggleTask && <button type="button" className="link-button" onClick={() => onToggleTask(item.id)}>Hecha</button>}
            </TaskLine>
          )} />
          <Block title="Postergado" empty="No se postergó nada." items={review.postponedTasks} render={(task) => <TaskLine key={task.id} task={task}><span className="muted small"> → {task.dueDate}</span></TaskLine>} />
          <Block title="Vencidas de antes" tone="warn" empty="Sin arrastres." items={review.carried} render={(task) => <TaskLine key={task.id} task={task}><span className="muted small"> · era del {task.dueDate}</span></TaskLine>} />
          <Block title={`Para ${review.tomorrow}`} empty="Nada cargado todavía." items={review.tomorrowTasks} render={(task) => <TaskLine key={task.id} task={task} />} />
        </div>
      )}
      <p className="muted small"><CalendarClock size={12} /> Se arma solo con lo que marcás en la rutina y en tus tareas: cuanto más lo uses, más útil es.</p>
    </section>
  );
}
