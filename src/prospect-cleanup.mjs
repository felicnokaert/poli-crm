// Limpieza de prospectos (12/11, Felipe: ~500 en la lista, ver cuáles sirven). Puro y testeado.
// Solo CLASIFICA y SUGIERE; descartar lo hace la persona con un toque (queda como «Sin interés» con motivo y se puede deshacer).
// Criterio de Resinplast (audio de Felipe, 12/11): somos revendedores y vendemos FRACCIONADO (baldes y envases chicos);
// no competimos por tambores. El perfil es reparación, parchado, carpintería, talleres y náutica que repara.
// El fabricante de piletas o de lanchas compra por volumen al fabricante de resina: no es perfil.
import { markProspect } from './prospect-convert.mjs';
import { normalizePhoneAR } from './prospect-contact.mjs';
import { isCompetitor } from './prospect-model.mjs';

export const FABRICANTE_OUTCOME = 'Fabricante (no es perfil)';

function plain(value = '') {
  return String(value).toLocaleLowerCase('es-AR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// Qué tan bien encaja un prospecto de Resinplast según el rubro. Otras familias: 'normal' (no se juzga).
export function resinplastFit(rubro = '') {
  const text = plain(rubro);
  if (/repar|taller|restyling|surf|carpinter|parch|mantenim/.test(text)) {
    return { fit: 'alta', reason: 'Reparación o taller: compra fraccionado, es el perfil de Resinplast.' };
  }
  if (/astillero|lancha|nautic|catamaran|cruceros/.test(text)) {
    return { fit: 'revisar', reason: 'Astillero o náutica: si fabrica en serie compra por tambor; si repara, sirve. Mirar a mano.' };
  }
  if (/tanque|prfv|plastic|fibra de vidrio/.test(text)) {
    return { fit: 'revisar', reason: 'Industria de fibra: depende del volumen. Mirar a mano.' };
  }
  if (/pisc|pilet|cupula/.test(text)) {
    return { fit: 'bajar', reason: 'Piletas de fibra: el fabricante compra por volumen directo, no fraccionado.', outcome: FABRICANTE_OUTCOME };
  }
  return { fit: 'revisar', reason: 'Rubro poco claro para Resinplast. Mirar a mano.' };
}

// Estado de trabajo del prospecto.
function workStatus(prospect) {
  if (prospect.linkedClientId) return 'cliente';
  if (prospect.state === 'Sin interés') return 'cerrado';
  if (prospect.state && prospect.state !== 'No contactado') return 'en-curso';
  return 'pendiente';
}

export function classifyProspect(prospect = {}) {
  const status = workStatus(prospect);
  const phone = prospect.phone ? normalizePhoneAR(prospect.phone) : null;
  let contact = 'sin-telefono';
  let contactNote = phone ? `Teléfono con problema: ${phone.reason}` : 'No tiene teléfono cargado.';
  if (phone?.valid) {
    contact = phone.mobile ? 'celular' : 'fijo';
    contactNote = phone.mobile ? 'Celular: se puede escribir por WhatsApp.' : 'Fijo: llamar, o probar si tiene WhatsApp Business.';
  }
  let fit = 'normal';
  let reason = '';
  let outcome = '';
  if (prospect.competitor || isCompetitor(prospect.company)) {
    fit = 'bajar'; reason = 'Es competencia.'; outcome = 'No le interesa';
  } else if (prospect.family === 'Resinplast') {
    const result = resinplastFit(prospect.rubro);
    fit = result.fit; reason = result.reason; outcome = result.outcome || '';
  }
  if (prospect.cleanupKept && fit !== 'normal') { fit = 'conservado'; reason = 'La dejaste a propósito.'; outcome = ''; }
  return { id: prospect.id, status, contact, contactNote, fit, reason, outcome };
}

export function classifyAll(prospects = []) {
  return (Array.isArray(prospects) ? prospects : []).map((prospect) => ({ prospect, ...classifyProspect(prospect) }));
}

// Resumen de lo PENDIENTE (los prospectos sin contactar y que todavía no son clientes).
export function cleanupSummary(prospects = []) {
  const rows = classifyAll(prospects);
  const pending = rows.filter((row) => row.status === 'pendiente');
  const count = (list, key, value) => list.filter((row) => row[key] === value).length;
  return {
    total: rows.length,
    pending: pending.length,
    clients: count(rows, 'status', 'cliente'),
    inProgress: count(rows, 'status', 'en-curso'),
    closed: count(rows, 'status', 'cerrado'),
    celular: count(pending, 'contact', 'celular'),
    fijo: count(pending, 'contact', 'fijo'),
    sinTelefono: count(pending, 'contact', 'sin-telefono'),
    alta: count(pending, 'fit', 'alta'),
    bajar: count(pending, 'fit', 'bajar'),
    revisar: count(pending, 'fit', 'revisar'),
  };
}

// Descarta varios de una vez como «Sin interés» con motivo (misma marca que en la cola: queda en el historial y en «Qué aprendimos»).
export function discardMany(state, ids = [], { outcome = FABRICANTE_OUTCOME, user = '', now = new Date().toISOString() } = {}) {
  let next = state;
  let done = 0;
  for (const id of ids) {
    const { state: marked, result } = markProspect(next, id, 'Sin interés', { outcome, user, now });
    if (result !== 'no_encontrado') { next = marked; done += 1; }
  }
  return { state: next, done };
}

// Dejar un prospecto aunque el criterio sugiera bajarlo.
export function keepMany(state, ids = [], { now = new Date().toISOString() } = {}) {
  const set = new Set(ids);
  return { ...state, prospects: (state.prospects || []).map((item) => (set.has(item.id) ? { ...item, cleanupKept: true, updatedAt: now } : item)) };
}

const CONTACT_LABEL = { celular: 'Celular', fijo: 'Fijo', 'sin-telefono': 'Sin teléfono' };
const FIT_LABEL = { alta: 'Prioridad', bajar: 'Para bajar', revisar: 'Revisar', normal: '', conservado: 'Conservado' };

export function cleanupCsv(rows = []) {
  const esc = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const head = ['Empresa', 'Ciudad', 'Provincia', 'Familia', 'Rubro', 'Teléfono', 'Tipo de teléfono', 'Mail', 'Estado', 'Sugerencia', 'Motivo'];
  const lines = rows.map((row) => [
    row.prospect.company, row.prospect.city, row.prospect.province, row.prospect.family, row.prospect.rubro, row.prospect.phone,
    CONTACT_LABEL[row.contact], row.prospect.email, row.prospect.state, FIT_LABEL[row.fit], row.reason,
  ].map(esc).join(','));
  return `﻿${[head.map(esc).join(','), ...lines].join('\r\n')}`;
}
export { CONTACT_LABEL, FIT_LABEL };
