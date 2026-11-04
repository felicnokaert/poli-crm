// Fecha de HOY en Argentina (UTC-3). `new Date().toISOString().slice(0, 10)` da el día UTC: desde las 21:00 argentinas ya es «mañana» (bug del 4/11:
// las tareas de hoy figuraban vencidas, el Cierre del día y la Rutina mostraban el día siguiente, las ventas cargadas de noche salían con fecha de mañana).
export const arToday = (now = Date.now()) => new Date(Number(now) - 3 * 3600000).toISOString().slice(0, 10);
export const arAddDays = (days, now = Date.now()) => arToday(Number(now) + Number(days) * 86400000);
