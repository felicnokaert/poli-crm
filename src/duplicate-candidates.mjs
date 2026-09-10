import { clientContacts, normalizePhone } from './client-contacts.mjs';

function normalizedText(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9@]+/g, ' ').trim();
}

function normalizedCuit(value = '') {
  return String(value).replace(/\D/g, '');
}

function valuesFor(client, field) {
  if (field === 'phone') return clientContacts(client).map((item) => normalizePhone(item.phone || item.whatsappId)).filter(Boolean);
  if (field === 'email') return clientContacts(client).map((item) => normalizedText(item.email)).filter(Boolean);
  return [];
}

function intersects(left = [], right = []) {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function signalsFor(left, right) {
  const signals = [];
  const leftCuit = normalizedCuit(left.cuit);
  const rightCuit = normalizedCuit(right.cuit);
  if (leftCuit && leftCuit === rightCuit) signals.push({ type: 'cuit_exact', strength: 'strong', label: 'CUIT exacto' });
  if (intersects(valuesFor(left, 'phone'), valuesFor(right, 'phone'))) signals.push({ type: 'phone_exact', strength: 'strong', label: 'Teléfono exacto' });
  if (intersects(valuesFor(left, 'email'), valuesFor(right, 'email'))) signals.push({ type: 'email_exact', strength: 'strong', label: 'Email exacto' });

  const leftLegal = normalizedText(left.legalName);
  const rightLegal = normalizedText(right.legalName);
  if (leftLegal && leftLegal === rightLegal) signals.push({ type: 'legal_name_exact', strength: 'strong', label: 'Razón social exacta' });

  const leftCompany = normalizedText(left.company);
  const rightCompany = normalizedText(right.company);
  if (leftCompany && leftCompany === rightCompany) signals.push({ type: 'company_name_exact', strength: 'medium', label: 'Nombre comercial exacto' });
  return signals;
}

function confidenceFor(signals) {
  const strong = signals.filter((item) => item.strength === 'strong').length;
  if (strong >= 2 || signals.some((item) => item.type === 'cuit_exact')) return 'high';
  if (strong === 1) return 'medium';
  return signals.length ? 'low' : null;
}

export function detectDuplicateClientCandidates(clients = []) {
  // Generamos pares sólo dentro de índices que comparten alguna señal. Esto
  // evita comparar toda la cartera contra toda la cartera (O(n²)), que con
  // más de mil fichas bloqueaba la pantalla Empresas.
  const indexes = {
    cuit: new Map(), phone: new Map(), email: new Map(), legalName: new Map(), company: new Map(),
  };
  const add = (index, value, clientIndex) => {
    if (!value) return;
    index.set(value, [...(index.get(value) || []), clientIndex]);
  };
  clients.forEach((client, clientIndex) => {
    add(indexes.cuit, normalizedCuit(client.cuit), clientIndex);
    valuesFor(client, 'phone').forEach((value) => add(indexes.phone, value, clientIndex));
    valuesFor(client, 'email').forEach((value) => add(indexes.email, value, clientIndex));
    add(indexes.legalName, normalizedText(client.legalName), clientIndex);
    add(indexes.company, normalizedText(client.company), clientIndex);
  });
  const pairKeys = new Set();
  Object.values(indexes).forEach((index) => index.forEach((members) => {
    const unique = [...new Set(members)];
    for (let left = 0; left < unique.length; left += 1) {
      for (let right = left + 1; right < unique.length; right += 1) {
        pairKeys.add(`${Math.min(unique[left], unique[right])}:${Math.max(unique[left], unique[right])}`);
      }
    }
  }));
  const candidates = [];
  for (const pairKey of pairKeys) {
      const [leftIndex, rightIndex] = pairKey.split(':').map(Number);
      const left = clients[leftIndex];
      const right = clients[rightIndex];
      if (!left?.id || !right?.id || left.id === right.id) continue;
      const signals = signalsFor(left, right);
      const confidence = confidenceFor(signals);
      if (!confidence) continue;
      candidates.push({
        id: [left.id, right.id].sort().join('::'),
        clientIds: [left.id, right.id],
        confidence,
        signals,
        requiresHumanReview: true,
      });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return candidates.sort((a, b) => order[a.confidence] - order[b.confidence] || a.id.localeCompare(b.id));
}
