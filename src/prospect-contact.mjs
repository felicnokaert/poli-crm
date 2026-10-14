// Control de formato de teléfono y mail de un prospecto, sin llamadas de red.
// Dice si el dato TIENE FORMATO válido y qué tipo parece (celular / fijo); no
// puede confirmar que el número o el mail existan. Para Argentina.

export function normalizePhoneAR(raw = '') {
  let digits = String(raw).replace(/\D/g, '');
  if (!digits) return { valid: false, reason: 'vacío' };
  if (digits.startsWith('00')) digits = digits.slice(2);
  let mobile = false;
  if (digits.startsWith('54')) {
    digits = digits.slice(2);
    if (digits.startsWith('9')) { mobile = true; digits = digits.slice(1); }
  }
  if (digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  // Prefijo local de celular "15" después del código de área (2 a 4 dígitos).
  if (digits.length === 12) {
    for (const area of [2, 3, 4]) {
      if (digits.slice(area, area + 2) === '15') {
        digits = digits.slice(0, area) + digits.slice(area + 2);
        mobile = true;
        break;
      }
    }
  }
  if (digits.length !== 10) return { valid: false, reason: digits.length < 10 ? 'faltan dígitos' : 'sobran dígitos' };
  if (/^(\d)\1+$/.test(digits)) return { valid: false, reason: 'número repetido' };
  const kind = mobile ? 'celular' : 'fijo o sin confirmar';
  return {
    valid: true,
    national: digits,
    kind,
    mobile,
    e164: `+54${mobile ? '9' : ''}${digits}`,
    whatsapp: mobile ? `https://wa.me/549${digits}` : '',
  };
}

const MAIL_RE = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;
const TYPOS = { 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com', 'gmail.con': 'gmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'yahoo.con': 'yahoo.com', 'outlok.com': 'outlook.com' };
const PLACEHOLDER = /^(info|contacto|ventas|administracion)@(example|test|dominio|email|correo)\./i;

export function checkEmail(raw = '') {
  const email = String(raw).trim().toLowerCase();
  if (!email) return { valid: false, reason: 'vacío' };
  if (!MAIL_RE.test(email)) return { valid: false, reason: 'formato inválido' };
  const domain = email.split('@')[1];
  if (/example\.|test\.|dominio\.|email\.com$/.test(domain) || PLACEHOLDER.test(email)) return { valid: false, reason: 'parece de ejemplo' };
  if (TYPOS[domain]) return { valid: true, suggestion: email.replace(domain, TYPOS[domain]), reason: `¿quisiste decir @${TYPOS[domain]}?` };
  const generic = /^(info|contacto|ventas|administracion|admin|hola)@/.test(email);
  return { valid: true, generic };
}

export function contactQuality(prospect = {}) {
  const phone = prospect.phone ? normalizePhoneAR(prospect.phone) : null;
  const email = prospect.email ? checkEmail(prospect.email) : null;
  const notes = [];
  if (phone) notes.push(phone.valid ? `Teléfono: ${phone.kind}` : `Teléfono con problema: ${phone.reason}`);
  if (email) notes.push(email.valid ? (email.reason ? `Mail: ${email.reason}` : `Mail: formato válido${email.generic ? ' (genérico, puede no leerlo una persona)' : ''}`) : `Mail con problema: ${email.reason}`);
  const usable = Boolean((phone && phone.valid) || (email && email.valid));
  return { phone, email, notes, usable };
}
