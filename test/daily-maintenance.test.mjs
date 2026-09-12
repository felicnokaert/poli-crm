import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyMaintenanceUpdate,
  buildDailySignalsUpdate,
  buildFullDailyMaintenanceUpdate,
  buildAutoFollowupTasks,
  AUTO_HOT_LEAD_TASK_SOURCE,
} from "../src/daily-maintenance.mjs";

const HOT_LEAD_EVENT = {
  event_id: "e1",
  direction: "inbound",
  channel: "general",
  customer_wa_id: "5491100000001",
  customer_name: "Cliente Caliente",
  text_body: "Necesito el precio para hoy, cuántos kg tienen en stock?",
  occurred_at: "2026-09-01T10:00:00Z",
  classification_status: "pending",
};

test("cierra tareas vencidas y devuelve un resumen con la cantidad cerrada", () => {
  const state = {
    tasks: [
      { id: "t1", dueDate: "2026-09-01", done: false },
      { id: "t2", dueDate: "2026-09-05", done: false },
      { id: "t3", dueDate: "2026-09-20", done: false },
    ],
    tasksClosedThrough: "",
  };
  const result = buildDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.tasksClosed, 2);
  assert.equal(result.nextState.tasks.find((t) => t.id === "t1").done, true);
  assert.equal(result.nextState.tasks.find((t) => t.id === "t2").done, true);
  assert.equal(result.nextState.tasks.find((t) => t.id === "t3").done, false);
});

test("no marca nada si no hay tareas vencidas, pero igual avanza el cutoff", () => {
  const state = {
    tasks: [{ id: "t1", dueDate: "2026-09-20", done: false }],
    tasksClosedThrough: "",
  };
  const result = buildDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.tasksClosed, 0);
  assert.equal(result.nextState.tasksClosedThrough, "2026-09-12T03:00:00.000Z");
});

test("no hace nada si ya se corrió el mantenimiento para ese cutoff", () => {
  const state = {
    tasks: [{ id: "t1", dueDate: "2026-09-01", done: false }],
    tasksClosedThrough: "2026-09-12T03:00:00.000Z",
  };
  const result = buildDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, false);
  assert.equal(result.nextState, state);
  assert.equal(result.summary.tasksClosed, 0);
});

test("no hace nada si el cutoff anterior es más reciente que el nuevo", () => {
  const state = {
    tasks: [{ id: "t1", dueDate: "2026-09-01", done: false }],
    tasksClosedThrough: "2026-09-13T00:00:00.000Z",
  };
  const result = buildDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, false);
  assert.equal(result.nextState, state);
});

test("ignora tareas ya marcadas como completadas al contar el resumen", () => {
  const state = {
    tasks: [
      { id: "t1", dueDate: "2026-09-01", done: true },
      { id: "t2", dueDate: "2026-09-05", done: false },
    ],
    tasksClosedThrough: "",
  };
  const result = buildDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.tasksClosed, 1);
});

test("usa la fecha de creación cuando la tarea no tiene fecha de vencimiento", () => {
  const state = {
    tasks: [{ id: "t1", createdAt: "2026-08-01T10:00:00.000Z", done: false }],
    tasksClosedThrough: "",
  };
  const result = buildDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.tasksClosed, 1);
});

test("usa el ISO completo actual como cutoff por defecto cuando no se pasa nowISO", () => {
  const state = { tasks: [], tasksClosedThrough: "" };
  const before = new Date().toISOString();
  const result = buildDailyMaintenanceUpdate(state);
  assert.ok(result.summary.cutoff >= before);
});

test("buildDailySignalsUpdate calcula las 3 señales y las persiste con timestamp", () => {
  const state = {
    inbox: [
      {
        event_id: "e1",
        direction: "inbound",
        channel: "general",
        customer_wa_id: "5491100000001",
        customer_name: "Cliente Caliente",
        text_body: "Necesito el precio para hoy, cuántos kg tienen en stock?",
        occurred_at: "2026-09-01T10:00:00Z",
        classification_status: "pending",
      },
    ],
    sales: [
      { customer: "Cliente A", date: "2026-07-01", items: [{ description: "Easy Spray" }] },
      { customer: "Cliente A", date: "2026-08-01", items: [{ description: "Easy Spray" }] },
    ],
  };
  const result = buildDailySignalsUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.nextState.dailySignals.calculatedAt, "2026-09-12T03:00:00.000Z");
  assert.equal(result.nextState.dailySignals.hotLeadsCount, 1);
  assert.equal(result.nextState.dailySignals.repurchaseCount, 1);
  assert.equal(result.nextState.dailySignals.coldQuotesCount, 1);
  assert.equal(result.nextState.dailySignals.hotLeads[0].customer, "Cliente Caliente");
  assert.equal(result.nextState.dailySignals.repurchase[0].customer, "Cliente A");
  assert.equal(result.summary.hotLeadsCount, 1);
  // No debe pisar el resto del estado (tareas, clientes, etc.)
  assert.deepEqual(result.nextState.inbox, state.inbox);
  assert.deepEqual(result.nextState.sales, state.sales);
});

test("buildDailySignalsUpdate maneja un estado vacío sin romper", () => {
  const result = buildDailySignalsUpdate({}, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.nextState.dailySignals.hotLeadsCount, 0);
  assert.equal(result.nextState.dailySignals.coldQuotesCount, 0);
  assert.equal(result.nextState.dailySignals.repurchaseCount, 0);
  assert.deepEqual(result.nextState.dailySignals.hotLeads, []);
});

test("buildFullDailyMaintenanceUpdate cierra tareas vencidas y persiste dailySignals en una sola pasada", () => {
  const state = {
    tasks: [{ id: "t1", dueDate: "2026-09-01", done: false }],
    tasksClosedThrough: "",
    inbox: [],
    sales: [
      { customer: "Cliente A", date: "2026-07-01", items: [{ description: "Easy Spray" }] },
      { customer: "Cliente A", date: "2026-08-01", items: [{ description: "Easy Spray" }] },
    ],
  };
  const result = buildFullDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.tasksClosed, 1);
  assert.equal(result.summary.repurchaseCount, 1);
  assert.equal(result.nextState.tasks.find((t) => t.id === "t1").done, true);
  assert.equal(result.nextState.dailySignals.calculatedAt, "2026-09-12T03:00:00.000Z");
  assert.equal(result.nextState.dailySignals.repurchaseCount, 1);
});

test("buildAutoFollowupTasks crea una tarea nueva para un hot lead sin tarea previa", () => {
  const state = { inbox: [HOT_LEAD_EVENT], tasks: [], clients: [] };
  const result = buildAutoFollowupTasks(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.autoFollowupTasksCreated, 1);
  const [task] = result.nextState.tasks;
  assert.equal(task.source, AUTO_HOT_LEAD_TASK_SOURCE);
  assert.equal(task.done, false);
  assert.equal(task.dueDate, "2026-09-12");
  assert.equal(task.company, "Cliente Caliente");
  assert.match(task.title, /Cliente Caliente/);
  assert.ok(task.autoKey);
});

test("buildAutoFollowupTasks no duplica si ya existe una tarea abierta auto-generada para ese contacto", () => {
  const existingTask = {
    id: "existing",
    source: AUTO_HOT_LEAD_TASK_SOURCE,
    autoKey: "general:cliente caliente",
    done: false,
  };
  const state = { inbox: [HOT_LEAD_EVENT], tasks: [existingTask], clients: [] };
  const result = buildAutoFollowupTasks(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, false);
  assert.equal(result.summary.autoFollowupTasksCreated, 0);
  assert.equal(result.nextState, state);
  assert.equal(result.nextState.tasks.length, 1);
});

test("buildAutoFollowupTasks sí crea una tarea nueva si la anterior ya está marcada como hecha", () => {
  const doneTask = {
    id: "done1",
    source: AUTO_HOT_LEAD_TASK_SOURCE,
    autoKey: "general:cliente caliente",
    done: true,
  };
  const state = { inbox: [HOT_LEAD_EVENT], tasks: [doneTask], clients: [] };
  const result = buildAutoFollowupTasks(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.autoFollowupTasksCreated, 1);
  assert.equal(result.nextState.tasks.length, 2);
});

test("buildAutoFollowupTasks no crea nada si no hay hot leads", () => {
  const state = { inbox: [], tasks: [], clients: [] };
  const result = buildAutoFollowupTasks(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, false);
  assert.equal(result.summary.autoFollowupTasksCreated, 0);
  assert.equal(result.nextState, state);
});

test("buildAutoFollowupTasks vincula la tarea a un cliente existente cuando el WhatsApp coincide", () => {
  const state = {
    inbox: [HOT_LEAD_EVENT],
    tasks: [],
    clients: [
      {
        id: "client-1",
        company: "Cliente Caliente SA",
        contacts: [{ id: "c1", whatsappId: "5491100000001", primary: true }],
      },
    ],
  };
  const result = buildAutoFollowupTasks(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.nextState.tasks[0].clientId, "client-1");
});

test("buildFullDailyMaintenanceUpdate también crea tareas de seguimiento para hot leads", () => {
  const state = {
    tasks: [],
    tasksClosedThrough: "",
    inbox: [HOT_LEAD_EVENT],
    sales: [],
    clients: [],
  };
  const result = buildFullDailyMaintenanceUpdate(state, "2026-09-12T03:00:00.000Z");
  assert.equal(result.changed, true);
  assert.equal(result.summary.autoFollowupTasksCreated, 1);
  assert.equal(
    result.nextState.tasks.filter((t) => t.source === AUTO_HOT_LEAD_TASK_SOURCE).length,
    1,
  );
});
