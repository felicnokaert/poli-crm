import crypto from 'node:crypto';

// Comparación de secretos en tiempo constante (mismo criterio que
// verifyMetaVerifyToken): buffers de largo distinto se rechazan sin comparar
// el contenido, porque timingSafeEqual lanza en ese caso.
export function safeEqual(received = '', expected = '') {
  if (!received || !expected) return false;
  const a = Buffer.from(String(received));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
