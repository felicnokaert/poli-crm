// Entregas para expedición SIN login (20/11, decisión de Felipe: opción B). La app de conteo (otro repositorio) muestra una pantalla propia
// de expedición y le pide los datos a ESTE servidor desde su función del lado del servidor, con la clave ENTREGAS_API_KEY en X-Api-Key
// (ENTREGAS_API_KEY_NEXT para rotarla sin cortar). Nunca se entrega la sesión de expedicion@ (esa cuenta puede leer facturas y clientes
// del CRM). Felipe decidió: entra solo con el nombre del operario y el depósito, y ve todos los datos del pedido (incluye teléfono y
// dirección). Cada consulta y cada cambio queda en entregas_api_log (operario, depósito, hora) y hay tope de pedidos por minuto.
// Rutas (vercel.json las reescribe a /api/admin-users?entregas=…):
//   GET  /api/entregas/config?operador=&deposito=        operarios, depósitos y expresos
//   GET  /api/entregas/hoy?operador=&deposito=           trabajo de expedición: pendientes + despachados/entregados hoy
//   GET  /api/entregas/calendario?desde=&hasta=&operador=&deposito=   pedidos con remito, despacho o entrega en el rango (hasta 62 días)
//   POST /api/entregas/estado {pedido, estado, datos, nota, operador, deposito}
//   GET  /api/entregas/pedido?id=&operador=&deposito=    un pedido con su historial (eventos) y sus archivos (link firmado de 10 min)
// 21/11 (pedido de la app de conteo): las filas de hoy/calendario suman vendedor_id, impreso_por, despacho_operador,
// despacho_at, tiene_guia_archivo, tiene_comprobante y archivos (cantidad). Operario de sistema «Resumen diario» (SYSTEM_ACTOR):
// solo puede LEER (config, hoy, calendario, pedido), con cualquier depósito o «Todos»; nunca cambia estados.
// El cambio de estado usa la MISMA función de la base que Entregas (entregas_cambiar_estado) con rol «expedicion», a través de
// entregas_cambiar_estado_expedicion (solo servicio): las transiciones permitidas, los datos que pide cada estado y el evento con
// operador y depósito salen de ahí, sin duplicar reglas.
import { serviceHeaders } from './corporate-auth.mjs';
import { safeEqual } from './safe-equal.mjs';

export const ESTADOS_EXPEDICION = ['impreso', 'cargado', 'bloqueado', 'despachado', 'entregado', 'incidencia'];
const PENDIENTES = ['cargado', 'impreso', 'bloqueado', 'incidencia'];
const RATE_LIMIT = 120;
const hits = new Map();

export const SYSTEM_ACTOR = 'Resumen diario';
const PEDIDO_COLUMNS = 'id,codigo,vendedor_id,impreso_por,n_remito,fecha_remito,cliente,cuit,direccion,localidad,provincia,cp,telefono,contacto,nota,expreso_id,vendedor_email,estado,estado_desde,impreso_at,bloqueo_motivo,bloqueo_detalle,stock_estimado,fecha_despacho,n_guia,bultos,fecha_entrega,incidencia_motivo,incidencia_detalle,items,created_at,updated_at,operador,deposito_salida';

export function keyIsValid(received, environment = process.env) {
  return [environment.ENTREGAS_API_KEY, environment.ENTREGAS_API_KEY_NEXT].some((key) => key && String(key).length >= 24 && safeEqual(String(received || ''), String(key)));
}
export function rateLimited(key, now = Date.now()) {
  const bucket = Math.floor(now / 60000);
  const entry = hits.get(key);
  const count = entry?.bucket === bucket ? entry.count + 1 : 1;
  hits.set(key, { bucket, count });
  return count > RATE_LIMIT;
}
// Día de hoy en Argentina (UTC-3).
export const arToday = (now = Date.now()) => new Date(Number(now) - 3 * 3600000).toISOString().slice(0, 10);
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
export function rangeOf(desde, hasta, now = Date.now()) {
  const today = arToday(now);
  const from = isDate(desde) ? desde : today;
  let to = isDate(hasta) ? hasta : from;
  if (to < from) to = from;
  const maxTo = new Date(Date.parse(`${from}T00:00:00Z`) + 61 * 86400000).toISOString().slice(0, 10);
  if (to > maxTo) to = maxTo;
  return { from, to };
}
// El operario y el depósito tienen que estar en la configuración de Entregas (Ajustes → Operadores).
export function checkWho(config = {}, operador = '', deposito = '', { readOnly = false } = {}) {
  const op = String(operador || '').trim();
  const dep = String(deposito || '').trim();
  if (op === SYSTEM_ACTOR) return readOnly ? { operador: op, deposito: dep || 'Todos', system: true } : { error: 'El operario de sistema solo puede consultar.' };
  if (!op || !(config.operadores || []).includes(op)) return { error: 'Operario desconocido: elegilo de la lista.' };
  if (!dep || !(config.depositos || []).includes(dep)) return { error: 'Depósito desconocido: elegilo de la lista.' };
  return { operador: op, deposito: dep };
}
// Trabajo de hoy: todo lo pendiente (cargado, impreso, bloqueado, incidencia) y lo despachado o entregado hoy.
export function todayFilter(today) {
  return `or=(estado.in.(${PENDIENTES.join(',')}),fecha_despacho.eq.${today},fecha_entrega.eq.${today})`;
}

function rest(environment, http) {
  const base = `${environment.SUPABASE_URL}/rest/v1`;
  return {
    async select(path) {
      const res = await http(`${base}/${path}`, { headers: serviceHeaders(environment) });
      if (!res.ok) throw new Error(`base (${res.status}): ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return res.json();
    },
    async insert(table, row) {
      await http(`${base}/${table}`, { method: 'POST', headers: serviceHeaders(environment, { 'Content-Type': 'application/json', Prefer: 'return=minimal' }), body: JSON.stringify(row) }).catch(() => null);
    },
    async rpc(name, args) {
      const res = await http(`${base}/rpc/${name}`, { method: 'POST', headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }), body: JSON.stringify(args) });
      const body = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, body };
    },
  };
}

function withExpreso(pedidos, expresos) {
  const names = new Map(expresos.map((row) => [row.id, row.nombre ?? row.name ?? '']));
  return pedidos.map((row) => ({ ...row, expreso: row.expreso_id ? names.get(row.expreso_id) || null : null }));
}

// Datos de despacho y archivos por pedido (una consulta para todos los pedidos de la lista).
export function enrichPedidos(pedidos, eventos = [], archivos = []) {
  const despacho = new Map();
  for (const evento of eventos) {
    if (evento.a_estado !== 'despachado') continue;
    const current = despacho.get(evento.pedido_id);
    if (!current || String(evento.created_at) > String(current.created_at)) despacho.set(evento.pedido_id, evento);
  }
  const files = new Map();
  for (const archivo of archivos) {
    const list = files.get(archivo.pedido_id) || [];
    list.push(archivo.tipo);
    files.set(archivo.pedido_id, list);
  }
  return pedidos.map((row) => {
    const event = despacho.get(row.id);
    const tipos = files.get(row.id) || [];
    return {
      ...row,
      despacho_operador: event ? event.operador || event.user_email || null : null,
      despacho_at: event ? event.created_at : null,
      tiene_guia_archivo: tipos.includes('guia'),
      tiene_comprobante: tipos.includes('remito_firmado'),
      archivos: tipos.length,
    };
  });
}

export function setCors(response, environment = process.env) {
  response.setHeader('Access-Control-Allow-Origin', environment.ENTREGAS_ORIGINS || environment.LABELS_ORIGINS || '*');
  response.setHeader('Access-Control-Allow-Headers', 'X-Api-Key, Content-Type');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Cache-Control', 'no-store');
}

// Link firmado (10 minutos) a un archivo del bucket privado «entregas». Si falla, null (se muestra sin link).
export async function signUrl(environment, http, path) {
  if (!path) return null;
  try {
    const encoded = String(path).split('/').map(encodeURIComponent).join('/');
    const res = await http(`${environment.SUPABASE_URL}/storage/v1/object/sign/entregas/${encoded}`, { method: 'POST', headers: serviceHeaders(environment, { 'Content-Type': 'application/json' }), body: JSON.stringify({ expiresIn: 600 }) });
    if (!res.ok) return null;
    const body = await res.json();
    const signed = body?.signedURL || body?.signedUrl;
    return signed ? `${environment.SUPABASE_URL}/storage/v1${signed.startsWith('/') ? '' : '/'}${signed}` : null;
  } catch {
    return null;
  }
}

export async function entregasApiHandler(request, response, environment = process.env, http = fetch, now = Date.now) {
  setCors(response, environment);
  if (request.method === 'OPTIONS') return response.status(204).end();
  if (!environment.ENTREGAS_API_KEY) return response.status(503).json({ error: 'Falta cargar ENTREGAS_API_KEY en Vercel.' });
  const received = request.headers?.['x-api-key'] || '';
  if (!keyIsValid(received, environment)) return response.status(401).json({ error: 'Clave inválida.' });
  if (rateLimited(`e:${String(received).slice(-8)}`, now())) return response.status(429).json({ error: 'Demasiados pedidos: esperá un minuto.' });
  const route = String(request.query?.entregas || '');
  const params = request.method === 'POST' ? (request.body || {}) : (request.query || {});
  const db = rest(environment, http);
  const log = (entry) => db.insert('entregas_api_log', { accion: route, operador: params.operador ? String(params.operador).slice(0, 40) : null, deposito: params.deposito ? String(params.deposito).slice(0, 40) : null, ...entry });
  try {
    const [config] = await db.select('entregas_config?select=operadores,depositos&id=eq.1');
    const who = checkWho(config, params.operador, params.deposito, { readOnly: request.method === 'GET' });
    if (who.error) { await log({ ok: false, detalle: who.error }); return response.status(400).json({ error: who.error }); }

    if (route === 'config' && request.method === 'GET') {
      const expresos = await db.select('entregas_expresos?select=id,nombre,tracking_url,requiere_guia,dias_esperados&activo=eq.true&order=orden').catch(() => []);
      await log({});
      return response.status(200).json({ ok: true, operadores: config.operadores || [], depositos: config.depositos || [], estados: ESTADOS_EXPEDICION, expresos });
    }
    if ((route === 'hoy' || route === 'calendario') && request.method === 'GET') {
      const today = arToday(now());
      let filter = todayFilter(today);
      if (route === 'calendario') {
        const { from, to } = rangeOf(params.desde, params.hasta, now());
        filter = `or=(and(fecha_remito.gte.${from},fecha_remito.lte.${to}),and(fecha_despacho.gte.${from},fecha_despacho.lte.${to}),and(fecha_entrega.gte.${from},fecha_entrega.lte.${to}))`;
      }
      const [pedidos, expresos] = await Promise.all([
        db.select(`entregas_pedidos?select=${PEDIDO_COLUMNS}&estado=neq.cancelado&${filter}&order=created_at.asc&limit=500`),
        db.select('entregas_expresos?select=*').catch(() => []),
      ]);
      const ids = pedidos.map((row) => row.id).filter((id) => /^[0-9a-f-]{36}$/i.test(id));
      const inList = ids.length ? `pedido_id=in.(${ids.join(',')})` : '';
      const [eventos, archivos] = inList ? await Promise.all([
        db.select(`entregas_eventos?select=pedido_id,a_estado,operador,user_email,created_at&a_estado=eq.despachado&${inList}`).catch(() => []),
        db.select(`entregas_archivos?select=pedido_id,tipo&${inList}`).catch(() => []),
      ]) : [[], []];
      await log({ detalle: `${pedidos.length} pedidos` });
      return response.status(200).json({ ok: true, hoy: today, pedidos: enrichPedidos(withExpreso(pedidos, expresos), eventos, archivos) });
    }
    if (route === 'pedido' && request.method === 'GET') {
      const id = String(params.id || '');
      if (!/^[0-9a-f-]{36}$/i.test(id)) return response.status(400).json({ error: 'Pedido inválido.' });
      const [pedidos, eventos, archivos, expresos] = await Promise.all([
        db.select(`entregas_pedidos?select=${PEDIDO_COLUMNS}&id=eq.${id}`),
        db.select(`entregas_eventos?select=id,tipo,de_estado,a_estado,nota,datos,operador,deposito,user_email,created_at&pedido_id=eq.${id}&order=created_at.asc`).catch(() => []),
        db.select(`entregas_archivos?select=id,tipo,nombre,mime,tamano,storage_path,created_at,operador,deposito&pedido_id=eq.${id}&order=created_at.asc`).catch(() => []),
        db.select('entregas_expresos?select=*').catch(() => []),
      ]);
      if (!pedidos.length) return response.status(404).json({ error: 'Pedido inexistente.' });
      const signed = await Promise.all(archivos.map(async (archivo) => ({ ...archivo, storage_path: undefined, url: await signUrl(environment, http, archivo.storage_path) })));
      await log({ pedido_id: id, detalle: 'detalle' });
      const [pedido] = enrichPedidos(withExpreso(pedidos, expresos), eventos.filter((evento) => evento.a_estado === 'despachado'), archivos);
      return response.status(200).json({ ok: true, pedido, eventos, archivos: signed });
    }
    if (route === 'estado' && request.method === 'POST') {
      if (who.system) return response.status(403).json({ error: 'El operario de sistema solo puede consultar.' });
      const pedido = String(params.pedido || '');
      const estado = String(params.estado || '');
      if (!/^[0-9a-f-]{36}$/i.test(pedido)) return response.status(400).json({ error: 'Pedido inválido.' });
      if (!ESTADOS_EXPEDICION.includes(estado)) return response.status(400).json({ error: 'Estado no permitido para expedición.' });
      const datos = params.datos && typeof params.datos === 'object' && !Array.isArray(params.datos) ? params.datos : {};
      const nota = params.nota ? String(params.nota).slice(0, 500) : null;
      const result = await db.rpc('entregas_cambiar_estado_expedicion', { p_pedido: pedido, p_estado: estado, p_datos: datos, p_nota: nota, p_operador: who.operador, p_deposito: who.deposito });
      if (!result.ok) {
        const message = String(result.body?.message || 'No se pudo cambiar el estado.').slice(0, 200);
        await log({ pedido_id: pedido, estado, ok: false, detalle: message });
        return response.status(result.status === 404 ? 404 : 409).json({ error: message });
      }
      await log({ pedido_id: pedido, estado });
      return response.status(200).json({ ok: true, pedido: result.body });
    }
    return response.status(404).json({ error: 'Ruta desconocida.' });
  } catch (error) {
    await log({ ok: false, detalle: String(error?.message || error).slice(0, 200) });
    return response.status(502).json({ error: 'Falló la consulta a la base.' });
  }
}
