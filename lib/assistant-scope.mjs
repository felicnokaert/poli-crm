// Poliplast App (25/11): el asistente según los módulos de cada persona, decidido en el SERVIDOR.
// El navegador manda el contexto en partes etiquetadas con su módulo ({ module, text }); acá se sacan las partes
// de módulos que la persona no tiene (por su rol o porque Felipe se los quitó) y las herramientas que no le tocan.
// Así expedición nunca recibe, por ejemplo, cuánto compró un cliente, aunque el navegador lo mandara.
import { db } from './mercadolibre.mjs';
import { isAdminEmail } from './admin-users.mjs';
import { roleAllows } from '../src/poliplast-app-plan.mjs';

// Herramientas del chat y el módulo que necesitan.
export const TOOL_MODULES = { crear_tarea: 'tasks', anotar_en_cliente: 'clients', redactar_mensaje: 'clients', guardar_respuesta: null };

// Cuentas compartidas con rol fijo aunque no se pueda leer la tabla (expedición nunca ve datos de ventas).
export const FIXED_ROLES = { 'expedicion@grupopoliplast.com.ar': 'expedicion' };

// Lee el rol (tabla app_user_roles, si existe) y los módulos quitados (module_access). Si no se puede leer,
// queda como hoy (sin recortes), salvo las cuentas con rol fijo.
export async function scopeFor(email, environment = process.env, http = fetch) {
  const who = String(email || '').toLowerCase();
  if (isAdminEmail(who)) return { admin: true, role: 'admin', denied: new Set(), known: true };
  const fixed = FIXED_ROLES[who] || null;
  try {
    const store = db(environment, http);
    const enc = encodeURIComponent(who);
    const [access, roles] = await Promise.all([
      store.select(`module_access?select=module,allowed&email=eq.${enc}`),
      store.select(`app_user_roles?select=role&email=eq.${enc}`).catch(() => []),
    ]);
    const denied = new Set((access || []).filter((row) => row.allowed === false).map((row) => String(row.module)));
    return { admin: false, role: fixed || roles?.[0]?.role || null, denied, known: true };
  } catch {
    return { admin: false, role: fixed, denied: new Set(), known: !fixed ? true : false };
  }
}

export function scopeAllows(scope, module) {
  if (!module) return true;
  if (!scope || scope.admin) return true;
  if (!scope.known) return false;
  if (scope.denied.has(module)) return false;
  return scope.role ? roleAllows(scope.role, module) : true;
}

// Junta las partes permitidas. Si el navegador mandó solo texto (versión vieja), se usa tal cual solo para
// administradores o para quien no tiene rol ni módulos quitados (lo mismo que ve hoy).
export function scopedContext(body = {}, scope) {
  if (Array.isArray(body.contextParts)) {
    return body.contextParts
      .filter((part) => part && typeof part.text === 'string' && part.text.trim())
      .filter((part) => scopeAllows(scope, part.module || null))
      .map((part) => part.text)
      .join('\n');
  }
  const unrestricted = !scope || scope.admin || (scope.known && !scope.role && scope.denied.size === 0);
  return unrestricted ? String(body.context || '') : '';
}

export function scopedTools(tools = [], scope) {
  return tools.filter((tool) => scopeAllows(scope, TOOL_MODULES[tool.name] ?? null));
}

// Una línea para el prompt: qué módulos tiene la persona, así no ofrece cosas de otros.
export function scopeNote(scope) {
  if (!scope || scope.admin) return '';
  const parts = [];
  if (scope.role) parts.push(`Rol de quien pregunta: ${scope.role}.`);
  parts.push('Solo hablá de los módulos que esta persona usa; si pregunta por datos de ventas, clientes o facturación que no están en el contexto, decile que no los tiene habilitados y que lo consulte con su responsable. Ayudala a usar sus pantallas.');
  return ` ${parts.join(' ')}`;
}
