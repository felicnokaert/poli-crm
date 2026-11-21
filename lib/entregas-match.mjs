// A qué pedido corresponde una guía o un remito subido desde expedición (1b, 21/11). Es la misma lógica que Entregas
// (entregas/src/lib/emparejarGuia.ts) pero del lado del servidor, para la app de conteo: el celular lee el texto (PDF o foto con OCR)
// y lo manda; acá se compara contra los pedidos. Orden: 1) N° de remito NUESTRO (0006-00006361: 4 + 8 dígitos; el «REMITO 5526-72357»
// de Via Cargo es del expreso y no cuenta), 2) CUIT/DNI del cliente, 3) teléfono, 4) razón social, 5) dirección.
// Pedido del chat de conteo (21/11): los datos de Poliplast como REMITENTE (CUIT 30715764845, teléfono 1166382693, «POLIPLAST»,
// «POLIURETANO Y PLASTICO PROYECTADO») se sacan del texto antes de comparar, así no confunden.
export const CRITERIO_LABEL = {
  remito: 'por N° de remito',
  cuit: 'por CUIT / DNI',
  telefono: 'por teléfono',
  razon: 'por razón social',
  direccion: 'por dirección',
};

// Criterios que alcanzan para asignar solo cuando hay un único pedido que coincide.
export const CRITERIOS_SEGUROS = new Set(['remito', 'cuit', 'telefono']);

const PROPIOS_CUIT = new Set(['30715764845']);
const PROPIOS_TELEFONO = ['6382693'];
const PROPIOS_NOMBRE = /poliuretano\s+y\s+pl[aá]stico\s+proyectado|grupo\s+poliplast|poliplast\s*s\.?\s*r\.?\s*l\.?|poliplast/gi;

const SIN_VALOR = new Set(['sa', 'srl', 'sas', 'saic', 'sacif', 'saci', 'sh', 'scs', 'sca', 'ltda', 'cia', 'de', 'del', 'la', 'las',
  'los', 'el', 'y', 'e', 'en', 'for', 'the', 'and']);
const DE_CALLE = new Set(['av', 'avda', 'avenida', 'calle', 'pje', 'pasaje', 'ruta', 'km', 'n', 'nro', 'numero', 'piso', 'dto',
  'depto', 'departamento', 'local', 'esq', 'esquina', 'bis', 'entre', 'y', 'de', 'del', 'la', 'las', 'los', 'el', 'sn', 'pb']);

const normalizar = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const palabras = (s) => normalizar(s).split(' ').filter(Boolean);

/** Saca del texto los datos de Poliplast como remitente (CUIT, teléfono y nombre). */
export function sinRemitente(texto) {
  let t = String(texto || '').replace(PROPIOS_NOMBRE, ' ');
  t = t.replace(/(?<!\d)(\d{2})[\s.-]?(\d{8})[\s.-]?(\d)(?!\d)/g, (m, a, b, c) => (PROPIOS_CUIT.has(a + b + c) ? ' ' : m));
  for (const tel of PROPIOS_TELEFONO) {
    const pattern = new RegExp(`(?:\\+?54\\s*9?\\s*)?(?:\\(?0?11\\)?[\\s-]*)?(?:15[\\s-]*)?${tel.slice(0, 3)}[\\s.-]?${tel.slice(3)}`, 'g');
    t = t.replace(pattern, ' ');
  }
  return t;
}

export function cuitsDelTexto(texto) {
  const out = new Set();
  for (const m of String(texto).matchAll(/(?<!\d)(\d{2})[\s.-]?(\d{8})[\s.-]?(\d)(?!\d)/g)) out.add(m[1] + m[2] + m[3]);
  return out;
}

function dnisDelTexto(texto, cuits) {
  const out = new Set();
  for (const c of cuits) out.add(String(Number(c.slice(2, 10))));
  for (const m of String(texto).matchAll(/(?<![\d.])(\d{1,2})\.?(\d{3})\.?(\d{3})(?![\d.])/g)) out.add(String(Number(m[1] + m[2] + m[3])));
  return out;
}

/** N° de remito del pedido normalizado a 0006-00006361 (acepta 6-6361 en el pedido). */
export function remitoNormal(n) {
  const m = String(n || '').match(/(\d{1,5})\D+(\d{1,8})/);
  return m ? `${m[1].padStart(4, '0').slice(-4)}-${m[2].padStart(8, '0')}` : null;
}

/** Remitos del texto con NUESTRO formato: 4 dígitos, guion y 8 dígitos (0006-00006361). Los del expreso (5526-72357) no cuentan. */
export function remitosDelTexto(texto) {
  const out = new Set();
  for (const m of String(texto).matchAll(/(?<![\d-])(\d{4})\s*-\s*(\d{8})(?![\d-])/g)) out.add(`${m[1]}-${m[2]}`);
  return out;
}

function tirasDeDigitos(texto) {
  const out = [];
  for (const bloque of String(texto).match(/\d[\d\s\-().\/]*\d|\d/g) ?? []) {
    const grupos = bloque.match(/\d+/g) ?? [];
    for (let i = 0; i < grupos.length; i += 1) {
      let acc = '';
      for (let j = i; j < Math.min(grupos.length, i + 5); j += 1) { acc += grupos[j]; out.push(acc); }
    }
  }
  return out;
}

function claveTelefono(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  return d.length >= 8 ? d.slice(-7) : null;
}

function coincideRazon(cliente, renglones) {
  const claves = palabras(cliente).filter((w) => w.length >= 3 && !SIN_VALOR.has(w));
  if (!claves.length || claves.join('').length < 5) return false;
  return renglones.some((r) => claves.every((w) => r.has(w)));
}

function coincideDireccion(direccion, renglones) {
  const ws = palabras(direccion).filter((w) => !DE_CALLE.has(w));
  const numero = ws.find((w) => /^\d{2,5}$/.test(w));
  const nombre = ws.filter((w) => /^[a-z]{4,}$/.test(w));
  if (!numero || !nombre.length) return false;
  return renglones.some((r) => r.has(numero) && nombre.every((w) => r.has(w)));
}

const SALIO = new Set(['despachado', 'entregado', 'incidencia']);

/** Pedidos a los que les puede faltar ese archivo (no cancelados; para guías, sin guía cargada). */
export function candidatosPara(tipo, pedidos) {
  return pedidos.filter((p) => p.estado !== 'cancelado' && (tipo !== 'guia' || (!p.n_guia && !p.tiene_guia_archivo)));
}

function porProbabilidad(a, b) {
  const sa = SALIO.has(a.estado) ? 0 : 1;
  const sb = SALIO.has(b.estado) ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return String(b.fecha_despacho || b.created_at || '').localeCompare(String(a.fecha_despacho || a.created_at || ''));
}

/** { por, pedidos } con el primer criterio que encuentra algo, o null. */
export function emparejarArchivo(textoOriginal, pedidos) {
  const texto = sinRemitente(textoOriginal);
  if (!texto.trim() || !pedidos.length) return null;
  const cuits = cuitsDelTexto(texto);
  const dnis = dnisDelTexto(texto, cuits);
  const remitos = remitosDelTexto(texto);
  const tiras = tirasDeDigitos(texto);
  const renglones = texto.split(/\n/).map((l) => new Set(palabras(l)));
  const pruebas = [
    ['remito', (p) => { const n = remitoNormal(p.n_remito); return Boolean(n) && remitos.has(n); }],
    ['cuit', (p) => {
      const c = String(p.cuit || '').replace(/\D/g, '');
      if (PROPIOS_CUIT.has(c)) return false;
      if (c.length === 11) return cuits.has(c);
      return c.length >= 7 && c.length <= 8 && dnis.has(String(Number(c)));
    }],
    ['telefono', (p) => { const k = claveTelefono(p.telefono); return Boolean(k) && !PROPIOS_TELEFONO.includes(k) && tiras.some((t) => t.endsWith(k)); }],
    ['razon', (p) => coincideRazon(p.cliente, renglones)],
    ['direccion', (p) => coincideDireccion(p.direccion, renglones)],
  ];
  for (const [por, coincide] of pruebas) {
    const hallados = pedidos.filter(coincide);
    if (hallados.length) return { por, pedidos: [...hallados].sort(porProbabilidad) };
  }
  return null;
}

/** Bultos que trae la guía («CANTIDAD DE BULTO/S: 4», «Bultos: 3»), o null. */
export function bultosDelTexto(texto) {
  const m = String(texto || '').match(/(?:cantidad\s+de\s+)?bultos?(?:\/s)?\s*[:#]?\s*(\d{1,3})\b/i);
  const n = m ? Number(m[1]) : null;
  return n && n > 0 && n < 500 ? n : null;
}
