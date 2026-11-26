// Feriados (26/11, Felipe: «que el calendario de Entregas marque los feriados como el de Tareas del CRM»). Es la MISMA lista que
// PLAN_HOLIDAYS de src/plan-calendar.mjs del CRM (Entregas también se compila sola en la app de conteo, por eso va copiada):
// test/entregas-feriados.test.mjs del CRM falla si las dos listas no coinciden.
export const FERIADOS = ['2026-11-23', '2026-12-08', '2026-12-25']

export const esFeriado = (iso: string): boolean => FERIADOS.includes(iso)
