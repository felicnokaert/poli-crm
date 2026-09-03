// Mueve una tarjeta a otra lista (o la misma) y la ubica antes de
// `beforeCardId`, o al final si no se pasa. Renumera el `order` de la lista
// destino para que quede 0..n-1 sin huecos.
export function moveCard(cards = [], cardId, toListId, beforeCardId = null) {
  const moving = cards.find((item) => item.id === cardId);
  if (!moving) return cards;
  const rest = cards.filter((item) => item.id !== cardId);
  const targetSiblings = rest
    .filter((item) => item.listId === toListId)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const insertAt = beforeCardId ? targetSiblings.findIndex((item) => item.id === beforeCardId) : targetSiblings.length;
  targetSiblings.splice(insertAt < 0 ? targetSiblings.length : insertAt, 0, { ...moving, listId: toListId });
  const renumbered = targetSiblings.map((item, index) => ({ ...item, order: index }));
  const others = rest.filter((item) => item.listId !== toListId);
  return [...others, ...renumbered];
}

// Mueve una lista un lugar a la izquierda (-1) o a la derecha (+1) y
// renumera todo el tablero 0..n-1, sin huecos.
export function reorderList(lists = [], listId, direction) {
  const ordered = [...lists].sort((a, b) => (a.order || 0) - (b.order || 0));
  const index = ordered.findIndex((item) => item.id === listId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return lists;
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((item, position) => ({ ...item, order: position }));
}

// Seis listas típicas de un flujo kanban de una sola persona/equipo chico.
export const KANBAN_TEMPLATE = [
  'Backlog / Ideas',
  'Priorizado / Esta semana',
  'En Proceso',
  'Bloqueado / En espera',
  'Listo para revisar',
  'Hecho',
];
