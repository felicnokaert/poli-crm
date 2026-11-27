// Clientes sin mail (27/11, Felipe: «tener una lista de clientes que no tienen mail y preguntarle a su comercial»).
// Junta los mails que ya existen (ficha del CRM: email, contactos, extraEmails; ficha de Contabilium) y arma:
// - para cada comercial: los clientes de SU cartera sin mail en ningún lado (aviso «pedíselo»);
// - para administradores: los clientes de Contabilium que compraron en 12 meses sin mail, por vendedor del último comprobante.
// Nada se envía solo y nada se escribe en Contabilium.
import { clientContacts } from './client-contacts.mjs';

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[a-z]{2,}$/i;
const IGNORE = /(^|@)(no-?reply|noreply|sinmail|sin-mail|nomail|notiene|no-tiene|ejemplo|example|test)\b|^(x+|0+)@/i;

export function normalizeEmail(value = '') {
  const mail = String(value || '').trim().toLowerCase().replace(/^mailto:/, '');
  return EMAIL.test(mail) && !IGNORE.test(mail) ? mail : '';
}

// Un campo puede traer varios mails («a@x.com; b@y.com»).
export function splitEmails(value = '') {
  return [...new Set(String(value || '').split(/[\s,;/]+/).map(normalizeEmail).filter(Boolean))];
}

export const cleanCuit = (value = '') => String(value || '').replace(/\D/g, '');
const validCuit = (value) => cleanCuit(value).length === 11;
export const cleanName = (value = '') => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/\b(s\.?\s?a\.?|s\.?\s?r\.?\s?l\.?|s\.?\s?a\.?\s?s\.?|srl|sas|sa)\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();

export function emailsOfClient(client = {}) {
  const found = [...splitEmails(client.email)];
  for (const contact of clientContacts(client)) found.push(...splitEmails(contact.email));
  for (const extra of client.extraEmails || []) found.push(...splitEmails(extra));
  return [...new Set(found)];
}

// Índice de mails de Contabilium por CUIT y por nombre limpio.
export function contabiliumIndex(rows = []) {
  const byCuit = new Map();
  const byName = new Map();
  const byId = new Map();
  for (const row of rows) {
    const mails = splitEmails(row.email);
    byId.set(`${row.company}:${row.id}`, row);
    if (!mails.length) continue;
    if (validCuit(row.cuit)) byCuit.set(cleanCuit(row.cuit), [...new Set([...(byCuit.get(cleanCuit(row.cuit)) || []), ...mails])]);
    const name = cleanName(row.razon_social);
    if (name.length >= 4) byName.set(name, [...new Set([...(byName.get(name) || []), ...mails])]);
  }
  return { byCuit, byName, byId };
}

export function contabiliumEmailsFor(client = {}, index) {
  if (!index) return [];
  if (validCuit(client.cuit) && index.byCuit.has(cleanCuit(client.cuit))) return index.byCuit.get(cleanCuit(client.cuit));
  const name = cleanName(client.company || client.name || client.razon_social);
  return (name.length >= 4 && index.byName.get(name)) || [];
}

// Cartera de un comercial: los que no tienen mail en la ficha. Si Contabilium tiene uno, se sugiere (no se copia solo).
export function myClientsWithoutEmail(clients = [], index = null) {
  return clients
    .filter((client) => client && !client.deleted && !client.archived)
    .filter((client) => emailsOfClient(client).length === 0)
    .map((client) => ({ id: client.id, name: client.company || client.name || 'Sin nombre', cuit: client.cuit || '', phone: client.phone || '', suggested: contabiliumEmailsFor(client, index)[0] || '' }))
    .sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)) || a.name.localeCompare(b.name, 'es'));
}

const SALES = /^(FC|COT)/i;

// Administradores: clientes que compraron (FC o COT) en el período, con la ficha de Contabilium sin mail.
// vendor = IDVendedor del último comprobante; vendorNames traduce el número de Contabilium a una persona.
export function contabiliumWithoutEmail({ invoices = [], clients = [], crmClients = [], vendorNames = {} } = {}) {
  const index = contabiliumIndex(clients);
  const crmByCuit = new Map();
  const crmByName = new Map();
  for (const client of crmClients) {
    const mails = emailsOfClient(client);
    if (!mails.length) continue;
    if (validCuit(client.cuit)) crmByCuit.set(cleanCuit(client.cuit), mails);
    const name = cleanName(client.company || client.name);
    if (name.length >= 4) crmByName.set(name, mails);
  }
  const last = new Map();
  for (const invoice of invoices) {
    if (!SALES.test(String(invoice.tipo || ''))) continue;
    const key = `${invoice.company}:${invoice.cliente_id}`;
    const prev = last.get(key);
    if (!prev || String(invoice.fecha) > String(prev.fecha)) last.set(key, invoice);
  }
  const rows = [];
  let withEmail = 0;
  let noFicha = 0;
  for (const [key, invoice] of last) {
    const ficha = index.byId.get(key);
    if (!ficha) { noFicha += 1; continue; }
    if (splitEmails(ficha.email).length) { withEmail += 1; continue; }
    const name = cleanName(ficha.razon_social || invoice.cliente);
    const inCrm = (validCuit(ficha.cuit) && crmByCuit.get(cleanCuit(ficha.cuit))) || (name.length >= 4 && crmByName.get(name)) || [];
    const otherCompany = (validCuit(ficha.cuit) && index.byCuit.get(cleanCuit(ficha.cuit))) || [];
    const vendor = String(invoice.vendedor || '0');
    rows.push({
      key, company: invoice.company, clienteId: invoice.cliente_id, name: ficha.razon_social || invoice.cliente || 'Sin nombre',
      cuit: ficha.cuit || '', phone: ficha.telefono || '', lastAt: String(invoice.fecha || '').slice(0, 10), lastType: invoice.tipo,
      vendor, vendorName: vendorNames[vendor] || (vendor === '0' ? 'Sin vendedor' : `Vendedor ${vendor}`),
      suggested: inCrm[0] || otherCompany[0] || '', suggestedFrom: inCrm[0] ? 'ficha del CRM' : otherCompany[0] ? 'otra empresa del grupo' : '',
    });
  }
  rows.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return { rows, total: last.size, withEmail, noFicha };
}

export function groupByVendor(rows = []) {
  const groups = new Map();
  for (const row of rows) {
    const group = groups.get(row.vendor) || { vendor: row.vendor, name: row.vendorName, rows: [], suggested: 0 };
    group.rows.push(row);
    if (row.suggested) group.suggested += 1;
    groups.set(row.vendor, group);
  }
  return [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
}

// Texto para copiar y pasarle al comercial.
export function askText(group, limit = 40) {
  const lines = group.rows.slice(0, limit).map((row) => `• ${row.name}${row.cuit ? ` (CUIT ${row.cuit})` : ''}${row.phone ? ` · ${row.phone}` : ''} · última ${row.lastType} ${row.lastAt}`);
  const more = group.rows.length > limit ? `\n…y ${group.rows.length - limit} más.` : '';
  return `Hola${group.name && !/^Vendedor|^Sin vendedor/.test(group.name) ? ` ${group.name}` : ''}, estos clientes no tienen mail en Contabilium. ¿Me pasás el mail cuando hables con ellos (o del presupuesto/factura)?\n${lines.join('\n')}${more}`;
}
