// Poliplast App (26/11): feriados nacionales de Argentina para el calendario único. Fuente: la lista pública de
// feriados (api.argentinadatos.com, que replica la de argentina.gob.ar/feriados). El servidor la pide y la guarda en
// memoria 12 h. Si la fuente no responde, usa el respaldo de abajo (2026), marcado como «respaldo».
const SOURCE = (year) => `https://api.argentinadatos.com/v1/feriados/${year}`;
const CACHE = new Map();
const TTL = 12 * 3600000;

// Respaldo 2026 (inamovibles, trasladables ya trasladados y días no laborables con fines turísticos).
export const FALLBACK = {
  2026: [
    ['2026-01-01', 'Año Nuevo', 'inamovible'], ['2026-02-16', 'Carnaval', 'inamovible'], ['2026-02-17', 'Carnaval', 'inamovible'],
    ['2026-03-23', 'Día no laborable con fines turísticos', 'puente'], ['2026-03-24', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'inamovible'],
    ['2026-04-02', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'inamovible'], ['2026-04-03', 'Viernes Santo', 'inamovible'],
    ['2026-05-01', 'Día del Trabajador', 'inamovible'], ['2026-05-25', 'Día de la Revolución de Mayo', 'inamovible'],
    ['2026-06-15', 'Paso a la Inmortalidad del General Güemes', 'trasladable'], ['2026-06-20', 'Paso a la Inmortalidad del General Belgrano', 'inamovible'],
    ['2026-07-09', 'Día de la Independencia', 'inamovible'], ['2026-07-10', 'Día no laborable con fines turísticos', 'puente'],
    ['2026-08-17', 'Paso a la Inmortalidad del General San Martín', 'trasladable'], ['2026-10-12', 'Día del Respeto a la Diversidad Cultural', 'trasladable'],
    ['2026-11-23', 'Día de la Soberanía Nacional', 'trasladable'], ['2026-12-07', 'Día no laborable con fines turísticos', 'puente'],
    ['2026-12-08', 'Inmaculada Concepción de María', 'inamovible'], ['2026-12-25', 'Navidad', 'inamovible'],
  ].map(([fecha, nombre, tipo]) => ({ fecha, nombre, tipo })),
};

export function normalizeHolidays(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(String(row?.fecha || '')))
    .map((row) => ({ fecha: row.fecha, nombre: String(row.nombre || 'Feriado'), tipo: String(row.tipo || '') }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export async function holidaysFor(year, http = fetch, now = Date.now()) {
  const key = Number(year);
  const hit = CACHE.get(key);
  if (hit && now - hit.at < TTL) return hit.value;
  let value;
  try {
    const response = await http(SOURCE(key), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(String(response.status));
    const rows = normalizeHolidays(await response.json());
    if (!rows.length) throw new Error('vacío');
    value = { year: key, source: 'argentinadatos', holidays: rows };
  } catch {
    value = { year: key, source: FALLBACK[key] ? 'respaldo' : 'sin-datos', holidays: FALLBACK[key] || [] };
  }
  CACHE.set(key, { at: now, value });
  return value;
}

export async function feriadosHandler(request, response, http = fetch) {
  const year = Math.min(2100, Math.max(2020, Number(request.query?.feriados) || new Date().getFullYear()));
  const value = await holidaysFor(year, http);
  response.setHeader?.('Cache-Control', 'public, max-age=3600, s-maxage=21600');
  return response.status(200).json(value);
}
