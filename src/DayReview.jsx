import { useMemo, useState } from "react";
import { CheckCircle2, MoonStar, Clock3, CircleAlert, ArrowRight, CalendarDays, ChevronDown } from "lucide-react";
import { reviewDay } from "./day-review.mjs";
import { previousWorkday, nextWorkday } from "./routine.mjs";

// Cierre del día (28/11, Felipe: «mejorar mucho la visual y el funcionamiento»): arriba un resumen con números y el
// avance del día; abajo solo los grupos que tienen algo, con acciones a mano. Sin bloques vacíos ni textos de relleno.
const fmtDay = (iso = "") => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : "");

function Group({ id, title, tone, icon: Icon, items, open, onToggle, children }) {
  if (!items.length) return null;
  return (
    <section className={`dr-group ${tone || ""}`}>
      <button type="button" className="dr-group-head" aria-expanded={open} onClick={() => onToggle(id)}>
        <Icon size={15} /> <strong>{title}</strong> <span className="dr-count">{items.length}</span>
        <ChevronDown size={14} className={`dr-caret${open ? " is-open" : ""}`} />
      </button>
      {open && <ul className="dr-list">{children}</ul>}
    </section>
  );
}

export function DayReview({ date, planChecks = {}, tasks = [], onPostpone, onToggleTask, includeRoutine = true }) {
  const [which, setWhich] = useState("hoy");
  const [openGroups, setOpenGroups] = useState(["pendiente", "vencidas"]);
  const target = which === "hoy" ? date : previousWorkday(date);
  const review = useMemo(() => reviewDay(target, { planChecks, tasks, includeRoutine }), [target, planChecks, tasks, includeRoutine]);
  const move = (task) => onPostpone?.(task.id, nextWorkday(target > date ? target : date));
  const toggle = (id) => setOpenGroups((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));

  const done = [...review.routine.done.map((b) => ({ id: `b-${b.id}`, title: b.title, routine: true })), ...review.doneTasks];
  const pendingTasks = review.pendingTasks;
  const routineMissed = review.routine.missed;
  const total = done.length + pendingTasks.length + routineMissed.length;
  const pct = total ? Math.round((done.length / total) * 100) : 0;
  const stats = [
    ["Hechas", done.length, "good"],
    ["Sin hacer", pendingTasks.length + routineMissed.length, pendingTasks.length + routineMissed.length ? "warn" : ""],
    ["Postergadas", review.postponedTasks.length, ""],
    ["Vencidas", review.carried.length, review.carried.length ? "bad" : ""],
  ];
  const nothing = !total && !review.postponedTasks.length && !review.carried.length && !review.tomorrowTasks.length;

  return (
    <section className="day-review" aria-label="Cierre del día">
      <div className="dr-head">
        <div>
          <h3><MoonStar size={17} /> Cierre del día</h3>
          <p className="muted small">{review.headline}</p>
        </div>
        <div className="segmented" role="group" aria-label="Día a revisar">
          <button type="button" className={which === "hoy" ? "selected" : ""} aria-pressed={which === "hoy"} onClick={() => setWhich("hoy")}>Hoy</button>
          <button type="button" className={which === "ayer" ? "selected" : ""} aria-pressed={which === "ayer"} onClick={() => setWhich("ayer")}>Día hábil anterior</button>
        </div>
      </div>

      {review.weekend ? <p className="dr-empty">Fin de semana: no hay cierre. Descansá.</p> : nothing ? (
        <p className="dr-empty">Nada para cerrar: no hay tareas para este día. Cargá las de mañana en Tareas.</p>
      ) : (
        <>
          <div className="dr-summary">
            <div className="dr-progress" role="img" aria-label={`${pct}% del día hecho`}>
              <svg viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15.5" className="dr-ring-bg" />{pct > 0 && <circle cx="18" cy="18" r="15.5" className="dr-ring" style={{ strokeDasharray: `${pct * 0.974} 100` }} />}</svg>
              <span>{pct}%</span>
            </div>
            <div className="dr-stats">
              {stats.map(([label, value, tone]) => <div key={label} className={`dr-stat ${tone}`}><b>{value}</b><span>{label}</span></div>)}
            </div>
          </div>

          <div className="dr-groups">
            <Group id="pendiente" title="Quedó sin hacer" tone="warn" icon={Clock3} items={pendingTasks} open={openGroups.includes("pendiente")} onToggle={toggle}>
              {pendingTasks.map((task) => (
                <li key={task.id} className="dr-item">
                  <span className="dr-title">{task.title}{task.postponedCount > 0 && <small> · postergada {task.postponedCount} {task.postponedCount === 1 ? "vez" : "veces"}</small>}</span>
                  <span className="dr-actions">
                    {onToggleTask && <button type="button" className="dr-pill good" onClick={() => onToggleTask(task.id)}><CheckCircle2 size={13} /> Hecha</button>}
                    {onPostpone && <button type="button" className="dr-pill" onClick={() => move(task)}><ArrowRight size={13} /> Al próximo día</button>}
                  </span>
                </li>
              ))}
            </Group>
            <Group id="vencidas" title="Vencidas de días anteriores" tone="bad" icon={CircleAlert} items={review.carried} open={openGroups.includes("vencidas")} onToggle={toggle}>
              {review.carried.map((task) => (
                <li key={task.id} className="dr-item">
                  <span className="dr-title">{task.title}<small> · era del {fmtDay(task.dueDate)}</small></span>
                  <span className="dr-actions">
                    {onToggleTask && <button type="button" className="dr-pill good" onClick={() => onToggleTask(task.id)}><CheckCircle2 size={13} /> Hecha</button>}
                    {onPostpone && <button type="button" className="dr-pill" onClick={() => move(task)}><ArrowRight size={13} /> Al próximo día</button>}
                  </span>
                </li>
              ))}
            </Group>
            <Group id="rutina" title="Bloques de rutina sin marcar" tone="warn" icon={Clock3} items={routineMissed} open={openGroups.includes("rutina")} onToggle={toggle}>
              {routineMissed.map((block) => <li key={block.id} className="dr-item"><span className="dr-title">{block.title}</span></li>)}
            </Group>
            <Group id="hecho" title="Salió bien" tone="good" icon={CheckCircle2} items={done} open={openGroups.includes("hecho")} onToggle={toggle}>
              {done.map((item) => <li key={item.id} className="dr-item"><span className="dr-title"><CheckCircle2 size={13} className="dr-ok" /> {item.title}</span></li>)}
            </Group>
            <Group id="postergado" title="Postergado" icon={ArrowRight} items={review.postponedTasks} open={openGroups.includes("postergado")} onToggle={toggle}>
              {review.postponedTasks.map((task) => <li key={task.id} className="dr-item"><span className="dr-title">{task.title}<small> → {fmtDay(task.dueDate)}</small></span></li>)}
            </Group>
            <Group id="manana" title={`Para el ${fmtDay(review.tomorrow) || review.tomorrow}`} icon={CalendarDays} items={review.tomorrowTasks} open={openGroups.includes("manana")} onToggle={toggle}>
              {review.tomorrowTasks.map((task) => <li key={task.id} className="dr-item"><span className="dr-title">{task.title}</span></li>)}
            </Group>
          </div>
        </>
      )}
    </section>
  );
}
