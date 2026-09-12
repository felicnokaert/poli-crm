import test from "node:test";
import assert from "node:assert/strict";
import { buildDailyMaintenanceUpdate } from "../src/daily-maintenance.mjs";

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
