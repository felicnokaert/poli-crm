// Lo que anota el equipo, compartido (23/10, OK de Felipe: "está bien que el asistente aprenda de todos").
// Cada persona copia de SU espacio de trabajo a team_shared_notes: Historial, notas de clientes y prospectos
// y los resultados de la Cola del día. El asistente (teamNotes) y el resumen semanal leen lo de los demás.
// Sin datos de contacto: solo empresa, lo anotado y la fecha.
const DAY = 86400000;
const alive = (row) => row && !row.deleted && !row.deletedAt;
const clip = (text, max) => String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
const when = (value) => { const time = Date.parse(value || ''); return Number.isFinite(time) ? new Date(time).toISOString() : null; };

export const SHARED_LIMIT = 1000;

export function sharedNoteRows(data = {}, { email = '', name = '', today = new Date().toISOString().slice(0, 10), days = 365 } = {}) {
  const author = String(email || '').trim().toLowerCase();
  if (!author) return [];
  const since = Date.parse(today) - days * DAY;
  const rows = [];
  const add = (id, kind, company, note, notedAt, outcome = '') => {
    const at = when(notedAt);
    if (!note && !outcome) return;
    if (at && Date.parse(at) < since) return;
    rows.push({ id: `${author}|${id}`, author_email: author, author_name: clip(name, 80), kind, company: clip(company, 160), note: clip(note, 1500), outcome: clip(outcome, 160), noted_at: at });
  };
  for (const row of (data.interactions || []).filter(alive)) {
    add(`i:${row.id}`, 'historial', row.company, [row.summary, row.need, row.objection, row.nextAction].filter(Boolean).join(' · '), row.createdAt || row.date);
  }
  for (const client of (data.clients || []).filter(alive)) {
    if (String(client.notes || '').trim()) add(`c:${client.id}`, 'nota-cliente', client.company, client.notes, client.updatedAt);
    for (const entry of Array.isArray(client.contactLog) ? client.contactLog : []) {
      add(`cl:${client.id}:${entry.at}`, 'contacto', client.company, `Cola del día: ${entry.queue || 'contacto'}`, entry.at, entry.outcome);
    }
  }
  for (const prospect of (data.prospects || []).filter(alive)) {
    if (String(prospect.notes || '').trim()) add(`p:${prospect.id}`, 'nota-prospecto', prospect.company, [prospect.notes, prospect.family].filter(Boolean).join(' · '), prospect.updatedAt);
    for (const entry of Array.isArray(prospect.history) ? prospect.history : []) {
      const detail = [entry.family, entry.zone && `zona ${entry.zone}`, entry.variant && `versión ${entry.variant}`].filter(Boolean).join(', ');
      add(`ph:${prospect.id}:${entry.at}`, 'contacto', prospect.company, `Prospecto${detail ? ` (${detail})` : ''}`, entry.at, [entry.state, entry.outcome].filter(Boolean).join(' · '));
    }
  }
  return rows.sort((a, b) => String(b.noted_at || '').localeCompare(String(a.noted_at || ''))).slice(0, SHARED_LIMIT);
}

// Firma barata para no volver a subir lo mismo.
export function rowsSignature(rows = []) {
  let hash = 0;
  for (const row of rows) for (const char of `${row.id}${row.note}${row.outcome}`) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return `${rows.length}:${hash}`;
}

// Lo de los demás, con el formato que entiende teamNotes.
export const othersNotes = (rows = [], email = '') => {
  const me = String(email || '').trim().toLowerCase();
  return rows.filter((row) => row && row.author_email !== me && row.kind !== 'contacto');
};
export const othersContacts = (rows = [], email = '') => {
  const me = String(email || '').trim().toLowerCase();
  return rows.filter((row) => row && row.author_email !== me && row.kind === 'contacto');
};
