import { COMMERCIAL_MASTER_CLIENTS } from './commercial-master-data.mjs';

export const COMMERCIAL_MASTER_VERSION = '2026-09-01-v2';

function normalize(value) {
  return String(value || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(sociedad anonima|sociedad de responsabilidad limitada|sociedad por acciones simplificada|s a s|s r l|s a|sas|srl|sa)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function meaningful(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

export function mergeCommercialMaster(state) {
  if (state.commercialMasterVersion === COMMERCIAL_MASTER_VERSION) {
    return { state, addedClients: 0, enrichedClients: 0, skipped: true };
  }

  const clients = [...(state.clients || [])];
  const byCompany = new Map(clients.map((client, index) => [normalize(client.company), index]));
  const byCuit = new Map(clients.map((client, index) => [normalize(client.cuit), index]).filter(([key]) => key));
  let addedClients = 0;
  let enrichedClients = 0;

  for (const source of COMMERCIAL_MASTER_CLIENTS) {
    const index = byCuit.get(normalize(source.cuit)) ?? byCompany.get(normalize(source.company));
    if (index === undefined) {
      clients.push(source);
      const nextIndex = clients.length - 1;
      byCompany.set(normalize(source.company), nextIndex);
      if (source.cuit) byCuit.set(normalize(source.cuit), nextIndex);
      addedClients += 1;
      continue;
    }

    const existing = clients[index];
    const merged = { ...source, ...existing };
    for (const [key, value] of Object.entries(source)) {
      if (!meaningful(existing[key]) || ['Sin definir', 'A confirmar', 'Desconocido', 'Desconocida'].includes(existing[key])) merged[key] = value;
    }
    merged.source = [...new Set([existing.source, source.source].filter(Boolean))].join(' + ');
    clients[index] = merged;
    enrichedClients += 1;
  }

  return {
    state: { ...state, clients, commercialMasterVersion: COMMERCIAL_MASTER_VERSION },
    addedClients,
    enrichedClients,
    skipped: false,
  };
}

export function commercialMasterStats() {
  const total = mergeCommercialMaster({ clients: [] }).state.clients.length;
  return {
    total,
    sourceRows: COMMERCIAL_MASTER_CLIENTS.length,
    historical: COMMERCIAL_MASTER_CLIENTS.filter((item) => item.sourceType === 'Cliente histórico').length,
    active: COMMERCIAL_MASTER_CLIENTS.filter((item) => item.sourceType !== 'Cliente histórico').length,
  };
}
