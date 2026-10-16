// Directorio de empresas compartido con el equipo (beta). Solo viajan datos de directorio:
// nombre, rubro, ubicación, contactos y la clasificación de Felipe (sourceType: cliente, prospecto,
// no corresponde...; tipoCliente: aplicador, inyección... para el mapa RAPYP). Notas, compras, etapa
// del pipeline, potencial, ventas y cualquier número comercial se quedan en el espacio de cada persona.
import { resolverTipo } from './client-type.mjs';

export const PUBLIC_FIELDS = ['id', 'company', 'legalName', 'family', 'clientType', 'industry', 'mainProduct', 'city', 'province', 'address', 'postalCode', 'phone', 'email', 'whatsappId', 'contact', 'sourceType', 'tipoClienteNota'];
// Se completan en fichas que ya vinieron del directorio, si la persona no las cambió.
const CLASSIFICATION_FIELDS = ['sourceType', 'tipoCliente', 'tipoClienteNota'];
const PUBLIC_CONTACT_FIELDS = ['id', 'name', 'role', 'phone', 'email', 'whatsappId', 'primary'];

const plain = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function toDirectoryRecord(client = {}) {
  const record = {};
  for (const key of PUBLIC_FIELDS) if (client[key] !== undefined && client[key] !== null && client[key] !== '') record[key] = client[key];
  // El tipo viaja ya resuelto (lo manual o lo que sale de lo que compra), sin los productos ni los kilos.
  const productos = (client.polio8?.products || []).filter((p) => p?.name).map((p) => ({ producto: p.name }));
  const { tipo } = resolverTipo(productos, { tipoCliente: client.tipoCliente });
  if (tipo) record.tipoCliente = tipo;
  if (Array.isArray(client.contacts)) {
    record.contacts = client.contacts.map((contact) => {
      const out = {};
      for (const key of PUBLIC_CONTACT_FIELDS) if (contact?.[key] !== undefined && contact?.[key] !== null && contact?.[key] !== '') out[key] = contact[key];
      return out;
    }).filter((contact) => contact.name || contact.phone || contact.email || contact.whatsappId);
  }
  return record;
}

// Solo empresas con nombre y que no sean clientes marcados como no comerciales.
export function publishableClients(clients = []) {
  return clients.filter((client) => client?.id && String(client.company || '').trim());
}

const keyOf = (client) => `${plain(client.company)}|${plain(client.city)}`;

// Suma al espacio de la persona las empresas del directorio que todavía no tiene (por id o por nombre y
// ciudad). No pisa nada de lo que ya cargó: en las que ya tenía con el mismo id solo completa la
// clasificación que esté vacía (así quien trajo el directorio antes recibe los aplicadores).
export function mergeDirectory(clients = [], records = [], stamp = new Date().toISOString()) {
  const byId = new Map(records.filter((record) => record?.id).map((record) => [record.id, record]));
  let updated = 0;
  clients = clients.map((client) => {
    const record = byId.get(client.id);
    if (!record) return client;
    const missing = CLASSIFICATION_FIELDS.filter((key) => record[key] && (!client[key] || client[key] === 'A confirmar'));
    if (!missing.length) return client;
    updated += 1;
    return { ...client, ...Object.fromEntries(missing.map((key) => [key, record[key]])), updatedAt: stamp };
  });
  const ids = new Set(clients.map((client) => client.id));
  const keys = new Set(clients.map(keyOf));
  const added = [];
  for (const record of records) {
    if (!record?.id || !record.company) continue;
    if (ids.has(record.id) || keys.has(keyOf(record))) continue;
    ids.add(record.id);
    keys.add(keyOf(record));
    added.push({
      family: 'Sin definir', stage: 'Nuevo', temperature: 'Tibio', pipelineActive: false,
      ...record, source: 'Directorio del equipo', createdAt: stamp, updatedAt: stamp,
    });
  }
  return { clients: [...clients, ...added], added: added.length, updated };
}
