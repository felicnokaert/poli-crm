// Contacto a mano en la ficha del mapa (solo vista del CRM): link de WhatsApp a partir del celular
// cargado. Puro y testeado (test/mapa-datos.test.mjs). Argentina: los celulares se marcan como
// 54 9 + código de área + número; el "0" y el "15" del área no van.
export const soloDigitos = (texto) => String(texto ?? '').replace(/\D/g, '');

// Devuelve https://wa.me/<número> o null si no parece un teléfono completo.
export function linkWhatsApp(telefono) {
  let d = soloDigitos(telefono);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('549')) { /* ya viene con país y 9 de celular */ }
  else if (d.startsWith('54')) d = `549${d.slice(2)}`; // le falta el 9 de celular
  else if (d.startsWith('0')) d = `549${d.slice(1)}`; // 0 + área + número
  else if (d.length === 10) d = `549${d}`; // área + número
  else {
    // área + 15 + número (ej. 2236 15 553212): se saca el 15 si lo que queda suma 10 dígitos
    const m = /^(\d{2,4})15(\d{6,8})$/.exec(d);
    if (!m || m[1].length + m[2].length !== 10) return null;
    d = `549${m[1]}${m[2]}`;
  }
  return d.length === 13 ? `https://wa.me/${d}` : null; // 54 + 9 + 10 dígitos
}

if (typeof window !== 'undefined') window.Contacto = { soloDigitos, linkWhatsApp };
