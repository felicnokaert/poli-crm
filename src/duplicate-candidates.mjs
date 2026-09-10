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
  const candidates = [];
  for (let leftIndex = 0; leftIndex < clients.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < clients.length; rightIndex += 1) {
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
  }
  const order = { high: 0, medium: 1, low: 2 };
  return candidates.sort((a, b) => order[a.confidence] - order[b.confidence] || a.id.localeCompare(b.id));
}

