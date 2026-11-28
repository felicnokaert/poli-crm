// Poliplast App (26/11, Felipe: «que no sean invasivas»): la campanita junta lo que hay que mirar, sin carteles que
// salten. «Para hacer» = lo que pide una acción; «Novedades» = para enterarse. Leído/no leído por id (en la cuenta).
const DAY = 86400000;
const daysBetween = (from, to) => Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY);

export function buildNotifications({ tasks = [], alerts = [], reports = [], noEmail = 0, today, allows = () => true } = {}) {
  const items = [];
  if (allows('tasks')) {
    for (const task of tasks) {
      if (task.done || !task.dueDate || task.dueDate > today) continue;
      const late = daysBetween(task.dueDate, today);
      items.push({
        id: `task:${task.id}:${task.dueDate}:${today}`, kind: 'action', group: 'Tareas', view: 'tasks', taskId: task.id,
        title: task.title || 'Tarea', detail: `${task.company ? `${task.company} · ` : ''}${late > 0 ? `vencida hace ${late} día${late === 1 ? '' : 's'}` : 'para hoy'}`,
        at: task.dueDate, weight: late > 0 ? 2 : 1,
      });
    }
  }
  for (const alert of alerts) {
    if (alert.resolved_at) continue;
    const module = String(alert.type || '').startsWith('shopify') ? 'shopify' : String(alert.type || '').startsWith('ml') ? 'mercadolibre' : 'mejoras';
    if (!allows(module) && !allows('mejoras')) continue;
    items.push({
      id: `alert:${alert.type}:${alert.entity_id}:${alert.severity === 'baja' ? String(alert.first_seen || '').slice(0, 10) : today}`,
      kind: alert.severity === 'baja' ? 'info' : 'action', group: 'Alertas', view: allows('mejoras') ? 'mejoras' : module,
      title: alert.title || 'Alerta', detail: alert.detail || '', at: String(alert.last_seen || alert.first_seen || '').slice(0, 10), weight: alert.severity === 'alta' ? 3 : 1,
    });
  }
  for (const report of reports) {
    if (report.status !== 'nuevo') continue;
    items.push({ id: `report:${report.id}`, kind: report.severity === 'idea' ? 'info' : 'action', group: 'Avisos del equipo', view: 'avisos', title: report.text, detail: `${report.name || report.by || ''} · ${report.viewLabel || report.view || ''}`, at: String(report.at || '').slice(0, 10), weight: report.severity === 'no-me-deja' ? 3 : 1 });
  }
  // Clientes de la cartera sin mail (27/11): un aviso por semana mientras queden.
  if (noEmail > 0 && allows('clients')) {
    const monday = new Date(`${today}T12:00:00Z`); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    items.push({ id: `noemail:${monday.toISOString().slice(0, 10)}`, kind: 'action', group: 'Clientes', view: 'clients', clientsTab: 'sinmail', title: `${noEmail} cliente${noEmail === 1 ? '' : 's'} de tu cartera sin mail`, detail: 'Pedíselo en el próximo presupuesto o factura y cargalo', at: today, weight: 0 });
  }
  return items.sort((a, b) => b.weight - a.weight || String(b.at).localeCompare(String(a.at)));
}

export function unreadCount(items = [], read = []) {
  const seen = new Set(read);
  return items.filter((item) => !seen.has(item.id)).length;
}
