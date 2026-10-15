// Convierte el plan generado desde Trello (src/trello-plan.mjs) en tareas del CRM.
// Es idempotente: no repite lo que ya está cargado y no pisa tareas ya editadas o completadas.
export function planTasks(plan = [], existingTasks = [], stamp = new Date().toISOString()) {
  const known = new Set((existingTasks || []).map((task) => task.id));
  return plan
    .filter((item) => !known.has(item.id))
    .map((item) => ({
      id: item.id,
      clientId: '',
      company: '',
      title: item.title,
      dueDate: item.dueDate,
      cadence: 'Única',
      priority: item.urgent ? 'Alta' : 'Media',
      done: false,
      createdAt: stamp,
      updatedAt: stamp,
      trigger: `Trello · ${item.list}`,
      trelloUrl: item.url,
      source: 'trello-plan',
      block: item.bucket,
    }));
}

export function planSummary(plan = [], existingTasks = []) {
  const loaded = new Set((existingTasks || []).map((task) => task.id));
  const total = plan.length;
  const present = plan.filter((item) => loaded.has(item.id)).length;
  return { total, loaded: present, pending: total - present };
}

// Tareas de un día, ordenadas: pendientes primero y las altas arriba.
export function tasksForDay(tasks = [], date) {
  return tasks
    .filter((task) => task.dueDate === date)
    .sort((a, b) => Number(a.done) - Number(b.done) || (a.priority === 'Alta' ? -1 : 0) - (b.priority === 'Alta' ? -1 : 0));
}

export function monthGrid(year, month) {
  const first = new Date(year, month, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  const last = new Date(year, month + 1, 0, 12).getDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let day = 1; day <= last; day += 1) cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}
