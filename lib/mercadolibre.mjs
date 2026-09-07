import crypto from 'node:crypto';

export const MERCADOLIBRE_ACCOUNTS = Object.freeze({
  poliplast: 'POLIPLAST',
  foam: 'FOAM',
});

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function secretKey(secret) {
  if (!secret || secret.length < 24) throw new Error('MELI_TOKEN_ENCRYPTION_KEY debe tener al menos 24 caracteres.');
  return crypto.createHash('sha256').update(secret).digest();
}

export function sealToken(value, secret) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', secretKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((item) => item.toString('base64url')).join('.');
}

export function openToken(value, secret) {
  const [iv, tag, encrypted] = String(value || '').split('.').map((item) => Buffer.from(item, 'base64url'));
  if (!iv?.length || !tag?.length || !encrypted?.length) throw new Error('Credencial cifrada inválida.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', secretKey(secret), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function createOAuthState({ accountKey, userId }, secret, now = Date.now()) {
  if (!MERCADOLIBRE_ACCOUNTS[accountKey]) throw new Error('Cuenta de Mercado Libre no válida.');
  const payload = base64url(JSON.stringify({
    accountKey,
    userId,
    nonce: crypto.randomBytes(16).toString('hex'),
    exp: now + 10 * 60 * 1000,
  }));
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyOAuthState(state, secret, now = Date.now()) {
  const [payload, signature] = String(state || '').split('.');
  if (!payload || !signature) throw new Error('Estado OAuth inválido.');
  const expected = crypto.createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) throw new Error('Firma OAuth inválida.');
  const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!MERCADOLIBRE_ACCOUNTS[decoded.accountKey] || !decoded.userId || decoded.exp < now) throw new Error('Estado OAuth vencido o inválido.');
  return decoded;
}

export function normalizeItem(item, accountId) {
  return {
    account_id: accountId,
    item_id: String(item.id),
    title: item.title || '',
    status: item.status || 'unknown',
    category_id: item.category_id || null,
    available_quantity: Number.isFinite(item.available_quantity) ? item.available_quantity : null,
    sold_quantity: Number.isFinite(item.sold_quantity) ? item.sold_quantity : null,
    permalink: item.permalink || null,
    thumbnail: item.thumbnail || null,
    raw_payload: item,
    synced_at: new Date().toISOString(),
  };
}
