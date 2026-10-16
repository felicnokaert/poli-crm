// Directorio de empresas compartido con el equipo (beta). Solo viajan datos de directorio:
// nombre, rubro, ubicación y contactos. Notas, compras, etapa del pipeline, potencial, ventas y
// cualquier número comercial se quedan en el espacio privado de cada persona.
const PUBLIC_FIELDS = ['id', 'company', 'legalName', 'family', 'clientType', 'industry', 'mainProduct', 'city', 'province', 'address', 'postalCode', 'phone', 'email', 'whatsappId', 'contact'];
const PUBLIC_CONTACT_FIELDS = ['id', 'name', 'role', 'phone', 'email', 'whatsappId', 'primary'];

const plain = (value) => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function toDirectoryRecord(client = {}) {
  const record = {};
  for (const key of PUBLIC_FIELDS) if (client[key] !== undefined && client[key] !== null && client[key] !== '') record[key] = client[key];
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
// ciudad). No pisa nada de lo que ya cargó.
export function mergeDirectory(clients = [], records = [], stamp = new Date().toISOString()) {
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
  return { clients: [...clients, ...added], added: added.length };
}
