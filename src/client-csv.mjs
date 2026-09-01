const COLUMNS = [
  ['Empresa', 'company'], ['Razón social', 'legalName'], ['CUIT', 'cuit'], ['Contacto', 'contact'],
  ['Teléfono', 'phone'], ['Email', 'email'], ['Sitio web', 'website'], ['Provincia', 'province'],
  ['Ciudad', 'city'], ['Familia', 'family'], ['Tipo de registro', 'sourceType'], ['Temperatura', 'temperature'],
  ['Etapa', 'stage'], ['Prioridad', 'priority'], ['Producto principal', 'mainProduct'],
  ['Producto potencial', 'productPotential'], ['Proveedor actual', 'currentSupplier'], ['Decisor', 'decisionMaker'],
  ['Última compra', 'lastPurchase'], ['Total compras', 'totalPurchases'], ['Notas', 'notes'], ['Pipeline activo', 'pipelineActive'],
];

function clean(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function escapeCell(value) {
  const text = value === true ? 'Sí' : value === false ? 'No' : String(value ?? '');
  return /[;"\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function clientsToCsv(clients = []) {
  const lines = [COLUMNS.map(([label]) => escapeCell(label)).join(';')];
  for (const client of clients) lines.push(COLUMNS.map(([, key]) => escapeCell(client[key])).join(';'));
  return `\uFEFF${lines.join('\r\n')}`;
}

function parseRows(text = '') {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] || '';
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"' && quoted && source[index + 1] === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ''; continue; }
    if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(cell); if (row.some((value) => value.trim())) rows.push(row); row = []; cell = ''; continue;
    }
    cell += char;
  }
  row.push(cell); if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function parseBoolean(value) {
  const normalized = clean(value);
  if (['si', 'true', '1', 'activo'].includes(normalized)) return true;
  if (['no', 'false', '0', 'cartera'].includes(normalized)) return false;
  return undefined;
}

export function mergeClientsCsv(existing = [], text = '') {
  const rows = parseRows(text);
  if (rows.length < 2) throw new Error('El CSV no contiene clientes.');
  const headerMap = new Map(COLUMNS.map(([label, key]) => [clean(label), key]));
  const keys = rows[0].map((header) => headerMap.get(clean(header)) || '');
  if (!keys.includes('company')) throw new Error('Falta la columna Empresa.');
  const clients = [...existing];
  const byCompany = new Map(clients.map((client, index) => [clean(client.company), index]));
  const byCuit = new Map(clients.map((client, index) => [clean(client.cuit), index]).filter(([key]) => key));
  let added = 0, updated = 0, skipped = 0;
  for (const values of rows.slice(1)) {
    const incoming = {};
    keys.forEach((key, index) => { if (key && values[index]?.trim()) incoming[key] = key === 'pipelineActive' ? parseBoolean(values[index]) : values[index].trim(); });
    if (!incoming.company) { skipped += 1; continue; }
    const index = byCuit.get(clean(incoming.cuit)) ?? byCompany.get(clean(incoming.company));
    if (index === undefined) {
      const client = { id: crypto.randomUUID(), family: 'Sin definir', stage: 'Nuevo', temperature: 'Tibio', pipelineActive: false, ...incoming, source: 'Importación CSV', updatedAt: new Date().toISOString() };
      clients.push(client); byCompany.set(clean(client.company), clients.length - 1); if (client.cuit) byCuit.set(clean(client.cuit), clients.length - 1); added += 1;
    } else {
      clients[index] = { ...clients[index], ...incoming, updatedAt: new Date().toISOString() };
      updated += 1;
    }
  }
  return { clients, added, updated, skipped };
}
