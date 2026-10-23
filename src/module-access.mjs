// Permisos por módulo y submódulo (24/10). Por defecto todos ven todo; la tabla module_access guarda solo lo que se
// le quitó a alguien. Los administradores ven siempre todo. Perfil y Datos no se pueden quitar (cada uno maneja lo suyo).
// Ojo: esto controla lo que muestra la app. Lo que protege los datos de verdad son las reglas de la base (RLS).
import { isChannelAdmin } from './user-channels.mjs';

export const MODULES = [
  { id: 'dashboard', label: 'Inicio' },
  { id: 'inbox', label: 'Por revisar' },
  { id: 'tasks', label: 'Tareas' },
  { id: 'sales', label: 'Ventas' },
  { id: 'quoter', label: 'Cotizador' },
  { id: 'prospecting', label: 'Prospección' },
  { id: 'conversations', label: 'Historial' },
  { id: 'mejoras', label: 'Centro de mejoras' },
  {
    id: 'mercadolibre', label: 'Mercado Libre',
    children: [['resumen', 'Resumen'], ['publicaciones', 'Publicaciones'], ['mercado', 'Mercado (competencia y tendencias)'], ['dinero', 'Dinero (stock, ganancia y publicidad)']],
  },
  {
    id: 'shopify', label: 'Shopify',
    children: [['resumen', 'Resumen'], ['mejorar', 'Qué mejorar'], ['productos', 'Productos'], ['operacion', 'Operación'], ['ordenar', 'Ordenar catálogo']],
  },
  { id: 'clients', label: 'Empresas y contactos' },
  { id: 'map', label: 'Mapa' },
  { id: 'academy', label: 'Academia comercial' },
  { id: 'techdocs', label: 'Base técnica' },
];

export const ALWAYS_ALLOWED = ['profile', 'settings'];

export const moduleKey = (module, child = '') => (child ? `${module}.${child}` : module);

// Conjunto de claves quitadas a una persona a partir de las filas de la tabla.
export function deniedSet(rows = []) {
  return new Set((Array.isArray(rows) ? rows : []).filter((row) => row && row.allowed === false).map((row) => String(row.module)));
}

export function canSee(email, denied, module, child = '') {
  if (ALWAYS_ALLOWED.includes(module) || isChannelAdmin(email)) return true;
  if (!(denied instanceof Set) || denied.size === 0) return true;
  if (denied.has(module)) return false;
  return child ? !denied.has(moduleKey(module, child)) : true;
}

// Para el menú: saca los grupos que quedan vacíos.
export function filterNav(groups, email, denied) {
  return groups
    .map(([name, items]) => [name, items.filter(([id]) => canSee(email, denied, id))])
    .filter(([, items]) => items.length > 0);
}

// Primera pantalla permitida (por si la guardada ya no se puede ver).
export function firstAllowedView(email, denied, preferred = 'dashboard') {
  if (canSee(email, denied, preferred)) return preferred;
  return MODULES.find((module) => canSee(email, denied, module.id))?.id || 'profile';
}

// Filas a guardar al cambiar un permiso: se borra la excepción al volver a permitir (la tabla guarda solo lo quitado).
export function accessChange(email, key, allowed) {
  return allowed
    ? { op: 'delete', email: String(email).toLowerCase(), module: key }
    : { op: 'upsert', row: { email: String(email).toLowerCase(), module: key, allowed: false, updated_at: new Date().toISOString() } };
}
