// "Importar tareas de Trello" para todo el equipo (Felipe incluido desde el 19/10): lee el JSON que exporta
// Trello (Menú del tablero → Imprimir, exportar y compartir → Exportar como JSON). Suma las tarjetas nuevas
// y actualiza las que ya estaban (mismo id `trello-<id>`, también las del plan de Felipe).
//
// Al actualizar:
// - nombre: se toma el de Trello;
// - completada en Trello: queda hecha (nunca se "deshace" algo que se marcó hecho en el CRM);
// - fecha: solo si cambió EN TRELLO desde la última importación (se recuerda en `trelloDue`). Así no se
//   pisan las fechas del plan repartido por día ni lo que se postergó en el CRM. La primera vez solo se
//   anota la fecha de Trello, salvo que la tarea no tuviera fecha.

function parseBoard(json) {
  const board = typeof json === 'string' ? JSON.parse(json) : json;
  if (!board || !Array.isArray(board.cards)) throw new Error('No parece un JSON exportado de Trello.');
  return board;
}

export function trelloJsonSync(json, existingTasks = [], stamp = new Date().toISOString()) {
  const board = parseBoard(json);
  const lists = new Map((board.lists || []).map((list) => [list.id, list]));
  const byId = new Map((existingTasks || []).map((task) => [task.id, task]));
  const seen = new Set();
  const added = [];
  const updates = [];
  for (const card of board.cards) {
    const list = lists.get(card?.idList);
    const title = String(card?.name || '').trim();
    if (!card?.id || !title) continue;
    const id = `trello-${card.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const due = card.due ? String(card.due).slice(0, 10) : '';
    const current = byId.get(id);
    if (current) {
      const patch = {};
      const changes = [];
      if (current.title !== title) { patch.title = title; changes.push('nombre'); }
      if (card.dueComplete && !current.done) { patch.done = true; changes.push('hecha'); }
      if (current.trelloDue === undefined) {
        patch.trelloDue = due;
        if (due && !current.dueDate) { patch.dueDate = due; changes.push('fecha'); }
      } else if (due !== current.trelloDue) {
        patch.trelloDue = due;
        if (due && due !== current.dueDate) { patch.dueDate = due; changes.push('fecha'); }
      }
      if (Object.keys(patch).length) updates.push({ id, patch: { ...patch, ...(changes.length ? { updatedAt: stamp } : {}) }, changes });
      continue;
    }
    if (card.closed || list?.closed) continue;
    added.push({
      id,
      clientId: '',
      company: '',
      title,
      dueDate: due,
      trelloDue: due,
      cadence: 'Única',
      priority: 'Media',
      done: Boolean(card.dueComplete),
      createdAt: stamp,
      updatedAt: stamp,
      trigger: `Trello · ${list?.name || board.name || 'tablero'}`,
      trelloUrl: card.shortUrl || card.url || '',
      source: 'trello-import',
    });
  }
  return { added, updates, changed: updates.filter((item) => item.changes.length).length };
}

export function trelloJsonToTasks(json, existingTasks = [], stamp = new Date().toISOString()) {
  return trelloJsonSync(json, existingTasks, stamp).added;
}

export function applyTrelloUpdates(tasks = [], updates = []) {
  if (!updates.length) return tasks;
  const patches = new Map(updates.map((item) => [item.id, item.patch]));
  return tasks.map((task) => (patches.has(task.id) ? { ...task, ...patches.get(task.id) } : task));
}
