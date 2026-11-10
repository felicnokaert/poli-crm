// Ordenar las tareas de Felipe en tres grupos y proponer cuáles pasan a prioridad Alta (10/11).
// Solo organiza lo que se VE: no cambia nada hasta que la persona toca «Marcar Alta».
import { arAddDays } from './ar-date.mjs';

export const GROUPS = [
  { key: 'vender', label: 'Vender' },
  { key: 'canales', label: 'Canales y gestión' },
  { key: 'despues', label: 'Después' },
];

const SELL = /(seguimiento|retomar contacto|cotiz|cliente|prospect|prospec|llamar|reactivar|presupuesto|pedido de|derivaci)/i;
const SELL_ORIGIN = /(prospect-followup|quote-followup|cola-atrasados|derivacion-whatsapp|asistente)/i;
const CHANNEL = /(^|\W)(ML|Shopify|Mercado Libre|Full|Ads|clips?|SKU|Penosil|EPP|colecci|checkout|SEO)(\W|$)/i;

function dayDiff(due, today) {
  if (!due) return null;
  return Math.round((new Date(`${due}T12:00:00Z`) - new Date(`${today}T12:00:00Z`)) / 86400000);
}

// 'vender' si toca a un cliente o prospecto; 'despues' si falta más de una semana; el resto es 'canales y gestión'.
export function taskGroup(task, today) {
  const text = `${task.title || ''} ${task.company || ''}`;
  const selling = Boolean(task.clientId) || SELL.test(text) || SELL_ORIGIN.test(String(task.origin || task.source || ''));
  if (selling) return 'vender';
  const days = dayDiff(task.dueDate, today);
  if (days !== null && days > 7) return 'despues';
  return CHANNEL.test(text) || days !== null ? 'canales' : 'despues';
}

export function groupCounts(tasks, today) {
  const counts = { vender: 0, canales: 0, despues: 0 };
  for (const task of tasks) if (!task.done) counts[taskGroup(task, today)] += 1;
  return counts;
}

// Candidatas a «Alta»: vencidas o de hoy, las de clientes primero. Máximo `limit` y nunca las que ya son Alta.
export function suggestHigh(tasks, today, limit = 5) {
  const scored = tasks
    .filter((task) => !task.done && String(task.priority || '').toLowerCase() !== 'alta')
    .map((task) => {
      const days = dayDiff(task.dueDate, today);
      const group = taskGroup(task, today);
      let score = 0;
      if (days !== null && days < 0) score += 3;
      else if (days === 0) score += 2;
      else if (days !== null && days <= 2) score += 1;
      if (group === 'vender') score += 2;
      if (task.clientId) score += 1;
      return { task, score, days, group };
    })
    .filter((entry) => entry.score >= 2)
    .sort((a, b) => b.score - a.score || (a.task.dueDate || '').localeCompare(b.task.dueDate || ''));
  return scored.slice(0, limit);
}

export { arAddDays };
