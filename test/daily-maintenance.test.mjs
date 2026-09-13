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

// Test de integración de punta a punta: simula una corrida real y completa
// del cron (api/cron-daily-maintenance.js) sobre un único workspace con
// datos de VARIOS clientes a la vez - tareas vencidas de más de un cliente,
// una cotización fría, un cliente para repurchase radar y un hot lead sin
// responder, todo junto en el mismo estado. Los tests existentes de
// buildFullDailyMaintenanceUpdate ejercitan un solo caso por vez; este cubre
// que las 3 señales + el cierre de tareas + las auto-tareas conviven bien
// cuando hay ruido de varios clientes en la misma corrida.
test("buildFullDailyMaintenanceUpdate corre de punta a punta con datos realistas de varios clientes", () => {
  const now = "2026-09-13T03:00:00.000Z";

  const state = {
    tasksClosedThrough: "",
    tasks: [
      // Tarea vencida de un cliente - debe cerrarse.
      { id: "task-vencida-cliente-a", clientId: "client-a", dueDate: "2026-09-01", done: false },
      // Tarea vencida de otro cliente - debe cerrarse también.
      { id: "task-vencida-cliente-b", clientId: "client-b", dueDate: "2026-09-05", done: false },
      // Tarea que todavía no vence - no se toca.
      { id: "task-futura-cliente-c", clientId: "client-c", dueDate: "2026-10-01", done: false },
    ],
    clients: [
      {
        id: "client-a",
        company: "Cliente A SA",
        contacts: [{ id: "ca-1", whatsappId: "5491100000001", primary: true }],
      },
      {
        id: "client-b",
        company: "Cliente B SRL",
        contacts: [{ id: "cb-1", whatsappId: "5491100000002", primary: true }],
      },
      {
        id: "client-c",
        company: "Cliente C SA",
        contacts: [{ id: "cc-1", whatsappId: "5491100000003", primary: true }],
      },
    ],
    inbox: [
      // Hot lead: mensaje entrante comercial y urgente, sin clasificar, de
      // Cliente A, varios días sin respuesta.
      {
        event_id: "evt-hotlead",
        direction: "inbound",
        channel: "general",
        customer_wa_id: "5491100000001",
        customer_name: "Cliente A SA",
        text_body: "Necesito el precio para hoy, cuántos kg tienen en stock?",
        occurred_at: "2026-09-01T10:00:00Z",
        classification_status: "pending",
      },
      // Mensaje ya respondido/clasificado de Cliente C - no debe generar señales.
      {
        event_id: "evt-resuelto",
        direction: "inbound",
        channel: "general",
        customer_wa_id: "5491100000003",
        customer_name: "Cliente C SA",
        text_body: "Gracias, quedamos así.",
        occurred_at: "2026-09-10T10:00:00Z",
        classification_status: "resolved",
      },
    ],
    sales: [
      // Cliente B: dos compras del mismo producto en distintos meses -> repurchase radar.
      { customer: "Cliente B SRL", date: "2026-07-01", items: [{ description: "Easy Spray" }] },
      { customer: "Cliente B SRL", date: "2026-08-01", items: [{ description: "Easy Spray" }] },
    ],
  };

  const before = {
    taskIds: new Set(state.tasks.map((t) => t.id)),
  };

  const result = buildFullDailyMaintenanceUpdate(state, now);

  assert.equal(result.changed, true);

  // 1) Cierre de tareas vencidas: 2 de las 3 tareas debían cerrarse.
  assert.equal(result.summary.tasksClosed, 2);
  assert.equal(result.nextState.tasks.find((t) => t.id === "task-vencida-cliente-a").done, true);
  assert.equal(result.nextState.tasks.find((t) => t.id === "task-vencida-cliente-b").done, true);
  assert.equal(result.nextState.tasks.find((t) => t.id === "task-futura-cliente-c").done, false);

  // 2) Señales calculadas y persistidas juntas: hot lead de Cliente A,
  //    repurchase de Cliente B.
  assert.equal(result.nextState.dailySignals.calculatedAt, now);
  assert.equal(result.nextState.dailySignals.hotLeadsCount, 1);
  assert.equal(result.nextState.dailySignals.hotLeads[0].customer, "Cliente A SA");
  assert.equal(result.nextState.dailySignals.repurchaseCount, 1);
  assert.equal(result.nextState.dailySignals.repurchase[0].customer, "Cliente B SRL");
  assert.equal(result.summary.hotLeadsCount, 1);
  assert.equal(result.summary.repurchaseCount, 1);

  // 3) Auto-tarea de seguimiento creada para el hot lead de Cliente A,
  //    vinculada al cliente correcto, sin duplicar ninguna de las tareas
  //    preexistentes.
  assert.equal(result.summary.autoFollowupTasksCreated, 1);
  const autoTasks = result.nextState.tasks.filter((t) => t.source === AUTO_HOT_LEAD_TASK_SOURCE);
  assert.equal(autoTasks.length, 1);
  assert.equal(autoTasks[0].clientId, "client-a");
  assert.match(autoTasks[0].title, /Cliente A SA/);

  // El total de tareas es: las 3 originales + la 1 auto-generada.
  assert.equal(result.nextState.tasks.length, 4);
  for (const id of before.taskIds) {
    assert.ok(result.nextState.tasks.some((t) => t.id === id), `la tarea original ${id} no debería desaparecer`);
  }
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
