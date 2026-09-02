function clean(value = '') {
  return String(value).trim().toLocaleLowerCase('es-AR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9@]+/g, ' ').trim();
}

export function normalizePhone(value = '') {
  let digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function normalizeContact(contact = {}) {
  return {
    id: contact.id || globalThis.crypto?.randomUUID?.() || `contact-${Date.now()}-${Math.random()}`,
    name: String(contact.name || contact.contact || '').trim(),
    role: String(contact.role || '').trim(),
    phone: String(contact.phone || contact.whatsappId || '').trim(),
    email: String(contact.email || '').trim(),
    whatsappId: String(contact.whatsappId || '').trim(),
    source: String(contact.source || '').trim(),
    primary: Boolean(contact.primary),
  };
}

function sameContact(left, right) {
  const leftPhone = normalizePhone(left.phone || left.whatsappId);
  const rightPhone = normalizePhone(right.phone || right.whatsappId);
  if (leftPhone && rightPhone && leftPhone === rightPhone) return true;
  if (left.email && right.email && clean(left.email) === clean(right.email)) return true;
  return Boolean(left.name && right.name && clean(left.name) === clean(right.name) && clean(left.role) === clean(right.role));
}

export function clientContacts(client = {}) {
  const source = [];
  if (client.contact || client.phone || client.email || client.whatsappId) source.push({
    name: client.contact || '', phone: client.phone || client.whatsappId || '', email: client.email || '',
    whatsappId: client.whatsappId || '', primary: true, source: client.source || 'Ficha principal',
  });
  source.push(...(Array.isArray(client.contacts) ? client.contacts : []));
  const contacts = [];
  for (const raw of source) {
    const incoming = normalizeContact(raw);
    if (!incoming.name && !incoming.phone && !incoming.email && !incoming.whatsappId) continue;
    const index = contacts.findIndex((item) => sameContact(item, incoming));
    if (index < 0) contacts.push(incoming);
    else contacts[index] = { ...incoming, ...contacts[index], primary: contacts[index].primary || incoming.primary };
  }
  if (contacts.length && !contacts.some((item) => item.primary)) contacts[0].primary = true;
  return contacts;
}

export function withClientContact(client = {}, contact = {}) {
  const incoming = normalizeContact(contact);
  const contacts = clientContacts(client);
  const index = contacts.findIndex((item) => sameContact(item, incoming));
  if (index < 0) contacts.push({ ...incoming, primary: !contacts.length || incoming.primary });
  else contacts[index] = { ...contacts[index], ...incoming, id: contacts[index].id, primary: contacts[index].primary || incoming.primary };
  const primary = contacts.find((item) => item.primary) || contacts[0] || {};
  return {
    ...client,
    contacts,
    contact: primary.name || client.contact || '',
    phone: primary.phone || primary.whatsappId || client.phone || '',
    email: primary.email || client.email || '',
    whatsappId: primary.whatsappId || client.whatsappId || '',
  };
}

export function findClientByWhatsApp(clients = [], event = {}) {
  const target = normalizePhone(event.customer_wa_id || event.phone || '');
  if (!target) return undefined;
  return clients.find((client) => clientContacts(client).some((contact) => normalizePhone(contact.whatsappId || contact.phone) === target));
}

export function attachWhatsAppContact(client = {}, event = {}) {
  return withClientContact(client, {
    name: event.customer_name || '', phone: event.customer_wa_id || '', whatsappId: event.customer_wa_id || '',
    source: event.channel ? `WhatsApp ${event.channel}` : 'WhatsApp',
  });
}

export function clientSearchText(client = {}) {
  const contacts = clientContacts(client).flatMap((item) => [item.name, item.role, item.phone, item.email, item.whatsappId]);
  return [client.company, client.legalName, client.cuit, client.family, client.sourceType, ...contacts].filter(Boolean).join(' ');
}

export function duplicatePhoneSignals(clients = []) {
  const owners = new Map();
  for (const client of clients) for (const contact of clientContacts(client)) {
    const key = normalizePhone(contact.phone || contact.whatsappId);
    if (!key) continue;
    const list = owners.get(key) || [];
    if (!list.some((item) => item.clientId === client.id)) list.push({ clientId: client.id, company: client.company, contact: contact.name });
    owners.set(key, list);
  }
  return [...owners.entries()].filter(([, list]) => list.length > 1).map(([phone, ownersList]) => ({ phone, owners: ownersList }));
}
