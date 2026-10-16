// "Importar tareas de Trello" para cualquiera del equipo: lee el JSON que exporta Trello
// (Menú del tablero → Imprimir, exportar y compartir → Exportar como JSON) y lo pasa a tareas
// propias. No toca el plan de Felipe (src/trello-plan.mjs), que es solo de su cuenta.
export function trelloJsonToTasks(json, existingTasks = [], stamp = new Date().toISOString()) {
  const board = typeof json === 'string' ? JSON.parse(json) : json;
  if (!board || !Array.isArray(board.cards)) throw new Error('No parece un JSON exportado de Trello.');
  const lists = new Map((board.lists || []).map((list) => [list.id, list]));
  const known = new Set((existingTasks || []).map((task) => task.id));
  const tasks = [];
  for (const card of board.cards) {
    const list = lists.get(card?.idList);
    if (!card?.id || !String(card.name || '').trim() || card.closed || list?.closed) continue;
    const id = `trello-${card.id}`;
    if (known.has(id)) continue;
    known.add(id);
    tasks.push({
      id,
      clientId: '',
      company: '',
      title: String(card.name).trim(),
      dueDate: card.due ? String(card.due).slice(0, 10) : '',
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
  return tasks;
}
