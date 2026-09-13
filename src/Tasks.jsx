import { memo, useEffect, useState } from "react";
import { CheckCircle2, Download, Plus, Search, X } from "lucide-react";
import { formatDate } from "./utils.mjs";
import { Empty, Fact } from "./ui-primitives";
import { addDaysToToday, googleCalendarUrl, today, useModalEscape } from "./app-shared";

// Mismo patrón que clientsToCsv/salesToCsv (client-csv.mjs, sales-model.mjs):
// punto y coma como separador, BOM para que Excel/Sheets abran los acentos
// bien, y comillas solo cuando el valor las necesita.
function escapeTaskCsvCell(value) {
  const text = String(value ?? "");
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function tasksToCsv(tasks = []) {
  const columns = [
    ["Acción", "title"], ["Empresa", "company"], ["Vencimiento", "dueDate"],
    ["Prioridad", "priority"], ["Estado", "statusLabel"], ["Disparador / contexto", "trigger"],
  ];
  const lines = [columns.map(([label]) => escapeTaskCsvCell(label)).join(";")];
  for (const task of tasks) {
    const row = { ...task, statusLabel: task.done ? "Completada" : "Pendiente" };
    lines.push(columns.map(([, key]) => escapeTaskCsvCell(row[key])).join(";"));
  }
  return `﻿${lines.join("\r\n")}`;
}

function exportTasksCsv(tasks, filter) {
  const blob = new Blob([tasksToCsv(tasks)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tareas-${filter}-${today()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Elegir "vencimiento" a mano abriendo el calendario es el paso más lento de
// crear o postergar una tarea. Estos atajos cubren los casos más comunes
// (hoy, mañana, en 3 días, en una semana) en un solo clic.
const DUE_DATE_SHORTCUTS = [
  ["Hoy", 0],
  ["Mañana", 1],
  ["+3 días", 3],
  ["+1 semana", 7],
];

function DueDateShortcuts({ value, onPick }) {
  return (
    <div className="due-date-shortcuts">
      {DUE_DATE_SHORTCUTS.map(([label, days]) => {
        const date = addDaysToToday(days);
        return (
          <button
            type="button"
            key={label}
            className={`due-date-shortcut${value === date ? " selected" : ""}`}
            onClick={() => onPick(date)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// El mensaje vacío importa especialmente en "Pendientes": es el estado al
// que un vendedor llega justo después de resolver su última tarea del día.
// Mostrarle "No hay tareas que coincidan con este filtro" ahí lee como un
// error o un callejón sin salida, cuando en realidad es la mejor noticia
// posible (está al día). Distinguimos ese caso de una búsqueda sin
// resultados y del estado realmente vacío (todavía no se creó ninguna tarea).
function taskListEmptyText({ items, filtered, filter, query }) {
  if (filtered.length) return undefined;
  if (query.trim()) return "No hay tareas que coincidan con tu búsqueda.";
  if (!items.length) return "Todavía no hay tareas. Creá la primera acción comercial.";
  if (filter === "pending") return "¡Estás al día! No tenés tareas pendientes.";
  if (filter === "done") return "Todavía no completaste ninguna tarea.";
  return "No hay tareas que coincidan con este filtro.";
}

function TasksBase({ items, onToggle, onOpen, onNew }) {
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const ordered = [...items].sort(
    (a, b) =>
      Number(a.done) - Number(b.done) ||
      (a.dueDate || "").localeCompare(b.dueDate || ""),
  );
  const filtered = ordered.filter(
    (task) =>
      (filter === "all" || (filter === "pending" ? !task.done : task.done)) &&
      `${task.title || ""} ${task.company || ""} ${task.trigger || ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <span className="eyebrow">Agenda única</span>
          <h2>Tareas comerciales</h2>
        </div>
        <button className="primary" type="button" onClick={onNew} title="Nueva tarea (n)">
          <Plus size={17} /> Nueva tarea
        </button>
      </div>
      <div className="list-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tarea…"
          />
        </label>
        <div className="segmented">
          <button
            className={filter === "pending" ? "selected" : ""}
            onClick={() => setFilter("pending")}
          >
            Pendientes
          </button>
          <button
            className={filter === "done" ? "selected" : ""}
            onClick={() => setFilter("done")}
          >
            Completadas
          </button>
          <button
            className={filter === "all" ? "selected" : ""}
            onClick={() => setFilter("all")}
          >
            Todas
          </button>
        </div>
        <button
          className="secondary"
          type="button"
          onClick={() => exportTasksCsv(filtered, filter)}
          disabled={!filtered.length}
          title="Exportar a CSV la lista de tareas visible con este filtro"
        >
          <Download size={15} /> Exportar CSV
        </button>
      </div>
      <TaskList
        items={filtered}
        onToggle={onToggle}
        onOpen={onOpen}
        emptyText={taskListEmptyText({ items, filtered, filter, query })}
      />
    </section>
  );
}

// Memoizado por el mismo motivo que Dashboard: App() re-renderiza seguido
// por estado ajeno a esta vista (sync, otras pantallas) y sus 4 props ya
// llegan estables via useCallback en App.jsx.
export const Tasks = memo(TasksBase);

export function TaskList({
  items,
  onToggle,
  onOpen,
  emptyText = "No hay tareas pendientes.",
}) {
  if (!items.length) return <Empty text={emptyText} />;
  const now = today();
  return items.map((task) => {
    const overdue = !task.done && task.dueDate && task.dueDate < now;
    return (
      <article className={`task-row ${task.done ? "done" : ""} ${overdue ? "overdue" : ""}`} key={task.id}>
        <button
          className="task-check"
          type="button"
          aria-label={
            task.done
              ? `Marcar ${task.title} como pendiente`
              : `Completar ${task.title}`
          }
          onClick={() => onToggle(task.id)}
        >
          {task.done && <CheckCircle2 size={18} />}
        </button>
        <button
          className="task-main"
          type="button"
          onClick={() => onOpen?.(task.id)}
        >
          <strong>{task.title}</strong>
          <span>
            {task.company} ·{" "}
            <span className={overdue ? "task-due-overdue" : undefined}>
              {overdue ? `Vencida · ${formatDate(task.dueDate)}` : formatDate(task.dueDate)}
            </span>
            {task.trigger ? ` · ${task.trigger}` : ""}
          </span>
        </button>
        <span className={`priority ${(task.priority || "Media").toLowerCase()}`}>
          {task.priority || "Media"}
        </span>
      </article>
    );
  });
}

export function TaskDetail({ task, client, onClose, onToggle, onSave, onOpenClient, onDelete }) {
  useModalEscape(onClose);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task || {});
  useEffect(() => setDraft(task || {}), [task?.id]);
  if (!task) return null;
  function submit(event) {
    event.preventDefault();
    onSave({ ...draft, title: draft.title.trim() });
    setEditing(false);
  }
  return (
    <div className="modal-backdrop">
      <section className="modal interaction-detail">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Tarea comercial</span>
            <h2>{task.title}</h2>
            <p>{task.company || "Sin empresa vinculada"}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar tarea"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {editing ? (
          <form onSubmit={submit}>
            <div className="form-grid">
              <label className="span-2">
                Acción
                <input
                  required
                  value={draft.title || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, title: event.target.value })
                  }
                />
              </label>
              <label>
                Vencimiento
                <input
                  required
                  type="date"
                  value={draft.dueDate || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, dueDate: event.target.value })
                  }
                />
                <DueDateShortcuts
                  value={draft.dueDate || ""}
                  onPick={(date) => setDraft({ ...draft, dueDate: date })}
                />
              </label>
              <label>
                Prioridad
                <select
                  value={draft.priority || "Media"}
                  onChange={(event) =>
                    setDraft({ ...draft, priority: event.target.value })
                  }
                >
                  <option>Alta</option>
                  <option>Media</option>
                  <option>Baja</option>
                </select>
              </label>
              <label className="span-2">
                Disparador / contexto
                <input
                  value={draft.trigger || ""}
                  onChange={(event) =>
                    setDraft({ ...draft, trigger: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="modal-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  setDraft(task);
                  setEditing(false);
                }}
              >
                Cancelar
              </button>
              <button className="primary" type="submit">
                Guardar cambios
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="conversation-detail-grid">
              <Fact label="Vencimiento" value={formatDate(task.dueDate)} />
              <Fact label="Prioridad" value={task.priority || "Media"} />
              <Fact label="Cadencia" value={task.cadence || "Seguimiento"} />
              <Fact
                label="Estado"
                value={task.done ? "Completada" : "Pendiente"}
              />
            </div>
            {task.trigger && (
              <div className="detail-block">
                <span>Por qué aparece hoy</span>
                <p>{task.trigger}</p>
              </div>
            )}
            <div className="modal-actions">
              <button className="secondary" type="button" onClick={onClose}>
                Cerrar
              </button>
              {client && (
                <button
                  className="secondary"
                  type="button"
                  onClick={() => onOpenClient(client.id)}
                >
                  Ver cliente
                </button>
              )}
              <a
                className="secondary calendar-link"
                href={googleCalendarUrl(task)}
                target="_blank"
                rel="noreferrer"
              >
                Abrir en Google Calendar
              </a>
              <button
                className="secondary"
                type="button"
                onClick={() => setEditing(true)}
              >
                Editar
              </button>
              <button
                className="primary"
                type="button"
                onClick={() => onToggle(task.id)}
              >
                {task.done ? "Marcar pendiente" : "Completar tarea"}
              </button>
              <button
                className="danger-link"
                type="button"
                onClick={() => onDelete(task.id)}
              >
                Eliminar tarea
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export function TaskForm({ form, setForm, clients, onClose, onSave }) {
  useModalEscape(onClose);
  const field = (name) => ({
    value: form[name] || "",
    onChange: (event) => setForm({ ...form, [name]: event.target.value }),
  });
  return (
    <div className="modal-backdrop">
      <form className="modal interaction-detail" onSubmit={onSave}>
        <div className="modal-head">
          <div>
            <span className="eyebrow">Agenda comercial</span>
            <h2>Nueva tarea</h2>
            <p>Definí una acción concreta, una fecha y por qué debe hacerse.</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Cerrar tarea"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <div className="form-grid">
          <label>
            Cliente
            <select {...field("clientId")}>
              <option value="">Sin cliente vinculado</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.company}
                </option>
              ))}
            </select>
          </label>
          {!form.clientId && (
            <label>
              Empresa / referencia
              <input {...field("company")} placeholder="Opcional" />
            </label>
          )}
          <label className="span-2">
            Acción
            <input
              required
              {...field("title")}
              placeholder="Ej. llamar para confirmar consumo mensual"
            />
          </label>
          <label>
            Vencimiento
            <input required type="date" {...field("dueDate")} />
            <DueDateShortcuts
              value={form.dueDate || ""}
              onPick={(date) => setForm({ ...form, dueDate: date })}
            />
          </label>
          <label>
            Prioridad
            <select {...field("priority")}>
              <option>Alta</option>
              <option>Media</option>
              <option>Baja</option>
            </select>
          </label>
          <label className="span-2">
            Disparador / contexto
            <input
              {...field("trigger")}
              placeholder="Ej. pasaron 7 días desde la propuesta"
            />
          </label>
        </div>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="primary" type="submit">
            Crear tarea
          </button>
        </div>
      </form>
    </div>
  );
}
